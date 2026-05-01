using SparrowInterviewAI.Api.Models;
using SparrowInterviewAI.Api.Repositories;
using System.Text;
using System.Text.RegularExpressions;

namespace SparrowInterviewAI.Api.Services;

public partial class SessionRuntimeService
{
    private readonly SessionRepository _sessions;
    private readonly UserRepository _users;
    private readonly DocumentRepository _documents;
    private readonly PromptTemplateService _prompts;
    private readonly HashedEmbeddingService _embeddings;
    private readonly ExternalProviderService _providers;
    private readonly SessionBroadcastService _broadcasts;
    private readonly IConfiguration _configuration;

    [GeneratedRegex(@"\s+")]
    private static partial Regex MultiSpaceRegex();

    public SessionRuntimeService(
        SessionRepository sessions,
        UserRepository users,
        DocumentRepository documents,
        PromptTemplateService prompts,
        HashedEmbeddingService embeddings,
        ExternalProviderService providers,
        SessionBroadcastService broadcasts,
        IConfiguration configuration)
    {
        _sessions = sessions;
        _users = users;
        _documents = documents;
        _prompts = prompts;
        _embeddings = embeddings;
        _providers = providers;
        _broadcasts = broadcasts;
        _configuration = configuration;
    }

    public async Task<TranscriptSegment> IngestTranscriptAsync(Guid sessionId, TranscriptSegmentRequest request)
    {
        var speakerLabel = ResolveSpeakerLabel(request.SourceType);

        var segment = await _sessions.AddTranscriptSegmentAsync(
            sessionId,
            request.TranscriptText,
            request.SourceType,
            request.SequenceNo,
            request.IsPartial,
            speakerLabel);

        await _broadcasts.BroadcastTranscriptAsync(sessionId, segment);

        if (!request.IsPartial)
        {
            var detectedQuestion = await DetectQuestionAsync(sessionId, request.TranscriptText, request.SourceType);
            if (detectedQuestion is not null)
            {
                await _broadcasts.BroadcastQuestionAsync(sessionId, detectedQuestion);
            }
        }

        await _broadcasts.BroadcastLiveStateAsync(sessionId, await GetLiveStateAsync(sessionId));
        return segment;
    }

    public async Task<DetectedQuestion?> DetectQuestionAsync(Guid sessionId, string rawText, string sourceType, Guid? sourceReferenceId = null)
    {
        var cleaned = await CleanQuestionAsync(rawText);
        if (!LooksLikeQuestion(cleaned))
        {
            return null;
        }

        var latestQuestion = await _sessions.GetLatestQuestionAsync(sessionId);
        if (latestQuestion is not null &&
            string.Equals(latestQuestion.CleanedText ?? latestQuestion.RawText, cleaned, StringComparison.OrdinalIgnoreCase))
        {
            return latestQuestion;
        }

        var questionType = ClassifyQuestionType(cleaned);
        var question = await _sessions.AddDetectedQuestionAsync(
            sessionId,
            rawText,
            cleaned,
            sourceType,
            questionType,
            confidence: 0.82,
            sourceReferenceId: sourceReferenceId);

        return question;
    }

    public async Task<AiResponse> GenerateAnswerAsync(Guid sessionId, GenerateAnswerRequest request)
    {
        var session = await _sessions.GetByIdAsync(sessionId)
            ?? throw new InvalidOperationException("Session not found.");

        var user = await _users.GetByIdAsync(session.UserId);
        var profile = await _users.GetProfileAsync(session.UserId);
        var latestQuestion = await _sessions.GetLatestQuestionAsync(sessionId);
        var activeQuestion = CleanQuestionLocal(request.QuestionText ?? latestQuestion?.CleanedText ?? latestQuestion?.RawText ?? string.Empty);
        if (string.IsNullOrWhiteSpace(activeQuestion))
        {
            throw new InvalidOperationException("No active question is available to answer.");
        }

        var questionType = latestQuestion?.QuestionType ?? ClassifyQuestionType(activeQuestion);
        var queryEmbeddingVector = await _providers.TryCreateEmbeddingAsync(activeQuestion) ?? _embeddings.CreateEmbedding(activeQuestion);
        var queryEmbedding = _embeddings.ToVectorLiteral(queryEmbeddingVector);
        var relevantChunks = await _documents.SearchRelevantChunksAsync(session.UserId, activeQuestion, queryEmbedding, 5);
        var profileSummary = await _documents.GetLatestProfileSummaryAsync(session.UserId);
        var sessionNotes = await _sessions.GetSessionNotesAsync(sessionId);
        var allQuestions = await _sessions.GetAllQuestionsAsync(sessionId);
        var allResponses = await _sessions.GetAllResponsesAsync(sessionId);
        var conversationHistory = BuildSessionHistory(allQuestions, allResponses);
        var fallbackAnswer = ComposeAnswer(
            question: activeQuestion,
            questionType: questionType,
            promptModifier: request.PromptModifier,
            userProfile: profile,
            profileSummary: profileSummary,
            relevantChunks: relevantChunks);
        var candidateContext = BuildCandidateContext(profile, profileSummary, relevantChunks, sessionNotes);
        var provider = _providers.ResolveAiProvider(request.Provider);
        string answerText;

        if (provider == "openai" && _providers.SupportsOpenAi)
        {
            var streamedBuilder = new StringBuilder();
            var systemPrompt = BuildExternalAnswerSystemPrompt(questionType, user?.FullName);
            var userPrompt = BuildExternalAnswerUserPrompt(activeQuestion, questionType, candidateContext, request.PromptModifier, request.ResponseType);

            await foreach (var token in _providers.TryGenerateTextStreamAsync(provider, systemPrompt, userPrompt, conversationHistory))
            {
                streamedBuilder.Append(token);
                await _broadcasts.BroadcastAnswerStreamTokenAsync(sessionId, token);
            }

            answerText = streamedBuilder.Length > 0 ? streamedBuilder.ToString() : fallbackAnswer;
        }
        else
        {
            var externalResult = await _providers.TryGenerateTextAsync(
                provider,
                BuildExternalAnswerSystemPrompt(questionType, user?.FullName),
                BuildExternalAnswerUserPrompt(activeQuestion, questionType, candidateContext, request.PromptModifier, request.ResponseType),
                conversationHistory);

            answerText = string.IsNullOrWhiteSpace(externalResult) ? fallbackAnswer : externalResult;
        }

        var modelName = provider == "openai" && _providers.SupportsOpenAi ? "external-provider" : "local-rules";
        var modelProvider = provider == "openai" && _providers.SupportsOpenAi ? "openai" : "local";

        var response = await _sessions.AddAiResponseAsync(
            sessionId,
            latestQuestion?.Id,
            sourceCaptureId: null,
            responseType: request.ResponseType,
            promptModifier: request.PromptModifier,
            responseText: answerText,
            modelName: modelName,
            modelProvider: modelProvider);

        await _broadcasts.BroadcastAnswerAsync(sessionId, response);
        await _broadcasts.BroadcastLiveStateAsync(sessionId, await GetLiveStateAsync(sessionId));
        return response;
    }

    public async Task<ScreenAnalysisResult> AnalyzeScreenAsync(
        Guid sessionId,
        string captureType,
        string? windowTitle,
        string? appName,
        string storagePath,
        string? extractedText,
        string? promptModifier,
        string? ocrProvider,
        string? aiProvider)
    {
        var resolvedOcrText = extractedText;
        if (string.IsNullOrWhiteSpace(resolvedOcrText) || _providers.ResolveOcrProvider(ocrProvider) != "local")
        {
            var ocrResult = await _providers.TryExtractTextAsync(ocrProvider, storagePath, null);
            if (!string.IsNullOrWhiteSpace(ocrResult.Text))
            {
                resolvedOcrText = ocrResult.Text;
            }
        }

        var capture = await _sessions.AddScreenCaptureAsync(
            sessionId,
            captureType,
            windowTitle,
            appName,
            storagePath,
            resolvedOcrText,
            promptModifier,
            submittedToAi: true);

        // Broadcast screen capture thumbnail to mobile companion
        if (File.Exists(storagePath))
        {
            try
            {
                var imageBytes = await File.ReadAllBytesAsync(storagePath);
                var base64 = Convert.ToBase64String(imageBytes);
                await _broadcasts.BroadcastScreenCaptureAsync(sessionId, $"data:image/png;base64,{base64}");
            }
            catch
            {
                // Non-critical: skip broadcast if image read fails
            }
        }

        DetectedQuestion? question = null;
        AiResponse? response = null;

        if (!string.IsNullOrWhiteSpace(resolvedOcrText))
        {
            question = await DetectQuestionAsync(sessionId, resolvedOcrText, "screen", capture.Id);
            if (question is not null)
            {
                response = await GenerateAnswerAsync(
                    sessionId,
                    new GenerateAnswerRequest
                    {
                        QuestionText = question.CleanedText ?? question.RawText,
                        PromptModifier = promptModifier,
                        ResponseType = "screen_analysis",
                        Provider = aiProvider
                    });
            }
        }

        await _broadcasts.BroadcastLiveStateAsync(sessionId, await GetLiveStateAsync(sessionId));

        return new ScreenAnalysisResult
        {
            Capture = capture,
            DetectedQuestion = question,
            Response = response
        };
    }

    public async Task<AudioTranscriptionResult> TranscribeAudioAsync(
        Guid sessionId,
        Stream audioStream,
        string fileName,
        string? contentType,
        string language,
        long sequenceNo,
        string sourceType,
        string? provider)
    {
        var transcription = await _providers.TryTranscribeAudioAsync(provider, audioStream, fileName, contentType, language);
        if (string.IsNullOrWhiteSpace(transcription.Text))
        {
            // Empty result means silence / no speech detected — skip gracefully
            return new AudioTranscriptionResult
            {
                Provider = transcription.Provider,
                Model = transcription.Model,
                TranscriptText = string.Empty,
                Segment = new()
            };
        }

        var segment = await IngestTranscriptAsync(sessionId, new TranscriptSegmentRequest
        {
            TranscriptText = transcription.Text,
            SourceType = sourceType,
            SequenceNo = sequenceNo,
            IsPartial = false
        });

        return new AudioTranscriptionResult
        {
            Provider = transcription.Provider,
            Model = transcription.Model,
            TranscriptText = transcription.Text,
            Segment = segment
        };
    }

    public async Task<SessionNoteRecord> SaveNoteAsync(Guid sessionId, SessionNoteRequest request)
    {
        var note = await _sessions.AddSessionNoteAsync(sessionId, request.NoteType, request.Content);
        await _broadcasts.BroadcastLiveStateAsync(sessionId, await GetLiveStateAsync(sessionId));
        return note;
    }

    public async Task<SessionSummaryRecord> GenerateSummaryAsync(Guid sessionId, string? provider = null)
    {
        var liveState = await GetLiveStateAsync(sessionId);
        var transcript = liveState.RecentTranscript;
        var notes = liveState.Notes;
        var allQuestions = await _sessions.GetAllQuestionsAsync(sessionId);
        var allResponses = await _sessions.GetAllResponsesAsync(sessionId);
        var fallbackSummary = BuildSummaryText(liveState, transcript, notes, allQuestions, allResponses);
        var externalSummary = await _providers.TryGenerateTextAsync(
            provider,
            _prompts.SessionSummaryGuidance,
            BuildExternalSummaryPrompt(liveState, transcript, notes, allQuestions, allResponses));
        var summaryText = string.IsNullOrWhiteSpace(externalSummary) ? fallbackSummary : externalSummary;
        var summary = await _sessions.UpsertSessionSummaryAsync(
            sessionId,
            summaryText,
            new
            {
                questionsCount = allQuestions.Count,
                responsesCount = allResponses.Count,
                transcriptCount = transcript.Count,
                questions = allQuestions.Select(q => q.CleanedText ?? q.RawText).Take(20).ToArray(),
                notes = notes.Select(note => note.Content).Take(5).ToArray()
            });

        await _broadcasts.BroadcastLiveStateAsync(sessionId, await GetLiveStateAsync(sessionId));
        return summary;
    }

    public async Task<SessionLiveState> GetLiveStateAsync(Guid sessionId)
    {
        var session = await _sessions.GetByIdAsync(sessionId)
            ?? throw new InvalidOperationException("Session not found.");

        var transcript = (await _sessions.GetTranscriptAsync(sessionId))
            .OrderByDescending(segment => segment.SequenceNo)
            .Take(20)
            .OrderBy(segment => segment.SequenceNo)
            .ToArray();

        return new SessionLiveState
        {
            SessionId = sessionId,
            Status = session.Status,
            Language = session.Language,
            StartedAt = session.StartedAt,
            LatestQuestion = await _sessions.GetLatestQuestionAsync(sessionId),
            LatestResponse = await _sessions.GetLatestResponseAsync(sessionId),
            RecentTranscript = transcript,
            Notes = await _sessions.GetSessionNotesAsync(sessionId),
            Summary = await _sessions.GetSessionSummaryAsync(sessionId)
        };
    }

    public async Task<MobileCompanionInfo> CreateMobileCompanionAsync(Guid sessionId, CreateMobileCompanionRequest request)
    {
        var baseUrl = _configuration["CompanionBaseUrl"] ?? "http://localhost:4200";
        return await _sessions.CreateMobileCompanionAsync(
            sessionId,
            request.DeviceName,
            request.DeviceType,
            baseUrl);
    }

    public async Task<SessionLiveState?> GetMobileStateAsync(string token)
    {
        var sessionId = await _sessions.ResolveMobileSessionIdAsync(token);
        if (sessionId is null)
        {
            return null;
        }

        return await GetLiveStateAsync(sessionId.Value);
    }

    private string ComposeAnswer(
        string question,
        string questionType,
        string? promptModifier,
        UserProfile? userProfile,
        string? profileSummary,
        IReadOnlyList<RelevantDocumentChunk> relevantChunks)
    {
        var builder = new StringBuilder();
        var candidateContext = BuildCandidateContext(userProfile, profileSummary, relevantChunks);

        builder.AppendLine($"Question Type: {questionType.Replace('_', ' ')}");
        builder.AppendLine();

        switch (questionType)
        {
            case "behavioral":
                builder.AppendLine("- Lead with a concise STAR story that directly answers the question.");
                builder.AppendLine($"- Situation/Task: connect it to your work as {userProfile?.TargetRole ?? "the candidate"}.");
                builder.AppendLine("- Action: highlight ownership, decisions, and collaboration.");
                builder.AppendLine("- Result: close with measurable impact and a short takeaway.");
                break;
            case "coding":
                builder.AppendLine("- Restate the input, output, and edge cases before coding.");
                builder.AppendLine("- Mention a simple baseline approach, then move to the optimized plan.");
                builder.AppendLine("- Call out time and space complexity explicitly.");
                builder.AppendLine(BuildCodingHint(question, promptModifier));
                break;
            case "system_design":
                builder.AppendLine("- Start with requirements, traffic assumptions, and the main user flow.");
                builder.AppendLine("- Break the system into API, storage, async processing, and scaling concerns.");
                builder.AppendLine("- Mention tradeoffs, bottlenecks, and how you would evolve the design.");
                builder.AppendLine("- Keep the explanation structured enough to speak through it live.");
                break;
            default:
                builder.AppendLine("- Answer directly in one strong opening sentence.");
                builder.AppendLine("- Add one or two supporting details that connect to your background.");
                builder.AppendLine("- Close with why that experience or choice matters for the role.");
                break;
        }

        if (!string.IsNullOrWhiteSpace(candidateContext))
        {
            builder.AppendLine();
            builder.AppendLine("Candidate Context:");
            builder.AppendLine(candidateContext);
        }

        if (!string.IsNullOrWhiteSpace(promptModifier))
        {
            builder.AppendLine();
            builder.AppendLine($"Modifier Applied: {promptModifier}");
        }

        builder.AppendLine();
        builder.AppendLine("Speakable Draft:");
        builder.AppendLine(BuildSpeakableDraft(question, questionType, userProfile, profileSummary, promptModifier));

        return builder.ToString().Trim();
    }

    private static string BuildCodingHint(string question, string? promptModifier)
    {
        var lowered = question.ToLowerInvariant();
        var language = string.IsNullOrWhiteSpace(promptModifier) ? "your preferred language" : promptModifier;

        if (lowered.Contains("binary search"))
        {
            return $"- In {language}, describe the low/high pointers, mid update, and exit condition.";
        }

        if (lowered.Contains("tree") || lowered.Contains("graph"))
        {
            return $"- In {language}, mention traversal choice, visited/state tracking, and when to prune work.";
        }

        if (lowered.Contains("array") || lowered.Contains("string"))
        {
            return $"- In {language}, explain the data structure you will use and why it reduces repeated work.";
        }

        return $"- In {language}, outline the function signature, helper data structures, and the clean control flow.";
    }

    private static string BuildSpeakableDraft(
        string question,
        string questionType,
        UserProfile? userProfile,
        string? profileSummary,
        string? promptModifier)
    {
        var role = userProfile?.TargetRole ?? "the role";

        return questionType switch
        {
            "behavioral" => $"A strong way I would answer this is by sharing a focused example from my experience that shows how I handled a similar situation, what actions I personally drove, and what measurable result followed. That keeps the answer relevant to {role} while sounding natural live.",
            "coding" => $"I would start by clarifying the requirements and edge cases, mention a simple baseline approach, and then move into the optimized solution with complexity tradeoffs. After that I would explain the implementation cleanly in {promptModifier ?? "the requested language"} so the interviewer can follow my reasoning.",
            "system_design" => $"I would structure this by starting with the core requirements, outlining the main components and data flow, and then walking through tradeoffs around scale, storage, and reliability. That keeps the design clear and interview-friendly for {role}.",
            _ => $"I would answer this directly, anchor it in the responsibilities of {role}, and support it with one or two concrete points from my background{(string.IsNullOrWhiteSpace(profileSummary) ? string.Empty : " so the response stays personal and credible")}."
        };
    }

    private static string BuildCandidateContext(
        UserProfile? userProfile,
        string? profileSummary,
        IReadOnlyList<RelevantDocumentChunk> chunks,
        IReadOnlyList<SessionNoteRecord>? sessionNotes = null)
    {
        var parts = new List<string>();

        if (!string.IsNullOrWhiteSpace(userProfile?.TargetRole))
        {
            parts.Add($"Target role: {userProfile.TargetRole}");
        }

        if (!string.IsNullOrWhiteSpace(userProfile?.CompanyName))
        {
            parts.Add($"Company: {userProfile.CompanyName}");
        }

        if (!string.IsNullOrWhiteSpace(userProfile?.JobDescription))
        {
            var jd = userProfile.JobDescription.Length > 800
                ? string.Concat(userProfile.JobDescription.AsSpan(0, 800), "...")
                : userProfile.JobDescription;
            parts.Add($"Job description: {jd}");
        }

        if (!string.IsNullOrWhiteSpace(userProfile?.CustomInstructions))
        {
            parts.Add($"Candidate instructions: {userProfile.CustomInstructions}");
        }

        if (!string.IsNullOrWhiteSpace(profileSummary))
        {
            parts.Add($"Resume summary: {profileSummary}");
        }

        foreach (var chunk in chunks.Take(3))
        {
            parts.Add($"Relevant context: {chunk.ChunkText.Trim()}");
        }

        if (sessionNotes is not null)
        {
            foreach (var note in sessionNotes.Take(5))
            {
                if (!string.IsNullOrWhiteSpace(note.Content))
                {
                    parts.Add($"Session note: {note.Content.Trim()}");
                }
            }
        }

        return string.Join(Environment.NewLine, parts);
    }

    private string BuildSummaryText(
        SessionLiveState state,
        IReadOnlyList<TranscriptSegment> transcript,
        IReadOnlyList<SessionNoteRecord> notes,
        IReadOnlyList<DetectedQuestion> allQuestions,
        IReadOnlyList<AiResponse> allResponses)
    {
        var builder = new StringBuilder();
        builder.AppendLine("Session Summary");
        builder.AppendLine();
        builder.AppendLine($"- Status: {state.Status}");
        builder.AppendLine($"- Transcript segments captured: {transcript.Count}");
        builder.AppendLine($"- Questions detected: {allQuestions.Count}");
        builder.AppendLine($"- AI responses generated: {allResponses.Count}");
        builder.AppendLine();

        if (allQuestions.Count > 0)
        {
            builder.AppendLine("KEY QUESTIONS ASKED:");
            foreach (var question in allQuestions)
            {
                builder.AppendLine($"  - [{question.QuestionType}] {question.CleanedText ?? question.RawText}");
            }
            builder.AppendLine();
        }

        if (allResponses.Count > 0)
        {
            builder.AppendLine("SUGGESTED ANSWERS:");
            foreach (var response in allResponses.Take(10))
            {
                var snippet = response.ResponseText.Length > 200
                    ? string.Concat(response.ResponseText.AsSpan(0, 200), "...")
                    : response.ResponseText;
                builder.AppendLine($"  - {snippet}");
            }
            builder.AppendLine();
        }

        if (notes.Count > 0)
        {
            builder.AppendLine($"NOTES CAPTURED: {notes.Count}");
        }

        builder.AppendLine();
        builder.AppendLine("ACTION ITEMS:");
        builder.AppendLine("  - Review the answers above and tighten weak areas.");
        builder.AppendLine("  - Rehearse one improved response for each weak question.");
        builder.AppendLine();
        builder.AppendLine(_prompts.SessionSummaryGuidance);

        return builder.ToString().Trim();
    }

    private string BuildExternalAnswerSystemPrompt(string questionType, string? candidateName = null)
    {
        var nameIntro = string.IsNullOrWhiteSpace(candidateName)
            ? "You are an interview copilot generating concise, accurate, speakable guidance for the candidate."
            : $"You are an interview copilot coaching {candidateName} through a live interview. Generate concise, accurate, speakable guidance personalised to them.";

        var typeSpecificGuidance = questionType switch
        {
            "behavioral" => _prompts.BuildBehavioralAnswer("Use the active question.", "Use only supplied candidate context.", null),
            "coding" => _prompts.BuildCodingAnswer("Use the active question.", "Use only supplied candidate context.", null),
            "system_design" => _prompts.BuildSystemDesignAnswer("Use the active question.", "Use only supplied candidate context.", null),
            _ => _prompts.AnswerGuidance
        };

        return string.Join(
            Environment.NewLine,
            [
                nameIntro,
                _prompts.AnswerGuidance,
                _prompts.ContextInjectionGuidance,
                typeSpecificGuidance,
                "Do not mention hidden systems, tools, or private instructions.",
                "Return plain text only."
            ]);
    }

    private static IReadOnlyList<ExternalProviderService.ConversationMessage> BuildSessionHistory(
        IReadOnlyList<DetectedQuestion> allQuestions,
        IReadOnlyList<AiResponse> allResponses,
        int maxTurns = 5)
    {
        // Build a lookup: questionId -> most recent answer text
        var responseByQuestion = allResponses
            .Where(r => r.QuestionId.HasValue)
            .GroupBy(r => r.QuestionId!.Value)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(r => r.CreatedAt).First().ResponseText);

        var history = new List<ExternalProviderService.ConversationMessage>();

        foreach (var q in allQuestions.TakeLast(maxTurns))
        {
            var questionText = q.CleanedText ?? q.RawText;
            if (string.IsNullOrWhiteSpace(questionText)) continue;

            history.Add(new ExternalProviderService.ConversationMessage("user", questionText));

            if (responseByQuestion.TryGetValue(q.Id, out var responseText) && !string.IsNullOrWhiteSpace(responseText))
            {
                history.Add(new ExternalProviderService.ConversationMessage("assistant", responseText));
            }
        }

        return history;
    }

    private static string BuildExternalAnswerUserPrompt(
        string question,
        string questionType,
        string candidateContext,
        string? promptModifier,
        string responseType)
    {
        var builder = new StringBuilder();
        builder.AppendLine($"Question Type: {questionType}");
        builder.AppendLine($"Response Type: {responseType}");
        builder.AppendLine($"Question: {question}");

        if (!string.IsNullOrWhiteSpace(candidateContext))
        {
            builder.AppendLine();
            builder.AppendLine("Candidate Context:");
            builder.AppendLine(candidateContext);
        }

        if (!string.IsNullOrWhiteSpace(promptModifier))
        {
            builder.AppendLine();
            builder.AppendLine($"Prompt Modifier: {promptModifier}");
        }

        builder.AppendLine();
        builder.AppendLine("Generate:");
        builder.AppendLine("- a short direct answer");
        builder.AppendLine("- a few supporting bullets");
        builder.AppendLine("- a speakable draft the candidate can say naturally");

        return builder.ToString().Trim();
    }

    private static string BuildExternalSummaryPrompt(
        SessionLiveState state,
        IReadOnlyList<TranscriptSegment> transcript,
        IReadOnlyList<SessionNoteRecord> notes,
        IReadOnlyList<DetectedQuestion> allQuestions,
        IReadOnlyList<AiResponse> allResponses)
    {
        var builder = new StringBuilder();
        builder.AppendLine($"Session Status: {state.Status}");
        builder.AppendLine($"Language: {state.Language}");
        builder.AppendLine();

        if (allQuestions.Count > 0)
        {
            builder.AppendLine("All Detected Questions:");
            foreach (var question in allQuestions)
            {
                builder.AppendLine($"  - [{question.QuestionType}] {question.CleanedText ?? question.RawText}");
            }
            builder.AppendLine();
        }

        if (allResponses.Count > 0)
        {
            builder.AppendLine("All AI Responses:");
            foreach (var response in allResponses.Take(15))
            {
                var snippet = response.ResponseText.Length > 300
                    ? string.Concat(response.ResponseText.AsSpan(0, 300), "...")
                    : response.ResponseText;
                builder.AppendLine($"  - [{response.ResponseType}] {snippet}");
            }
            builder.AppendLine();
        }

        builder.AppendLine("Recent Transcript:");
        foreach (var segment in transcript.TakeLast(20))
        {
            builder.AppendLine($"- [{segment.SourceType}]{(string.IsNullOrWhiteSpace(segment.SpeakerLabel) ? "" : $" ({segment.SpeakerLabel})")} {segment.TranscriptText}");
        }

        if (notes.Count > 0)
        {
            builder.AppendLine();
            builder.AppendLine("Notes:");
            foreach (var note in notes.Take(6))
            {
                builder.AppendLine($"- {note.Content}");
            }
        }

        return builder.ToString().Trim();
    }

    private async Task<string> CleanQuestionAsync(string rawText)
    {
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return string.Empty;
        }

        // Try AI-powered cleaning first
        try
        {
            var aiCleaned = await _providers.TryGenerateTextAsync(
                "openai",
                _prompts.QuestionCleaningGuidance,
                rawText);

            if (!string.IsNullOrWhiteSpace(aiCleaned))
            {
                return aiCleaned.Trim();
            }
        }
        catch
        {
            // Fall through to regex-based cleaning
        }

        return CleanQuestionLocal(rawText);
    }

    private static string CleanQuestionLocal(string rawText)
    {
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return string.Empty;
        }

        var cleaned = rawText
            .Replace("Interviewer:", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("Candidate:", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("Question:", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Trim();

        cleaned = MultiSpaceRegex().Replace(cleaned, " ");
        return cleaned.Trim();
    }

    private static bool LooksLikeQuestion(string text)
    {
        if (string.IsNullOrWhiteSpace(text) || text.Length < 12)
        {
            return false;
        }

        var lowered = text.ToLowerInvariant();
        return text.Contains('?')
               || lowered.StartsWith("tell me")
               || lowered.StartsWith("describe")
               || lowered.StartsWith("how ")
               || lowered.StartsWith("what ")
               || lowered.StartsWith("why ")
               || lowered.StartsWith("can you")
               || lowered.StartsWith("walk me through")
               || lowered.Contains("implement")
               || lowered.Contains("design ");
    }

    private static string ClassifyQuestionType(string text)
    {
        var lowered = text.ToLowerInvariant();

        if (lowered.Contains("tell me about a time")
            || lowered.Contains("conflict")
            || lowered.Contains("challenge")
            || lowered.Contains("leadership")
            || lowered.Contains("failure")
            || lowered.Contains("strength")
            || lowered.Contains("weakness"))
        {
            return "behavioral";
        }

        if (lowered.Contains("design ")
            || lowered.Contains("architecture")
            || lowered.Contains("scalable")
            || lowered.Contains("distributed")
            || lowered.Contains("rate limiter")
            || lowered.Contains("system"))
        {
            return "system_design";
        }

        if (lowered.Contains("leetcode")
            || lowered.Contains("hackerank")
            || lowered.Contains("algorithm")
            || lowered.Contains("complexity")
            || lowered.Contains("array")
            || lowered.Contains("tree")
            || lowered.Contains("graph")
            || lowered.Contains("binary search")
            || lowered.Contains("linked list")
            || lowered.Contains("implement"))
        {
            return "coding";
        }

        return "general";
    }

    private static string ResolveSpeakerLabel(string sourceType)
    {
        return sourceType switch
        {
            "system_audio" => "interviewer",
            "mic" or "microphone" or "microphone_external" => "candidate",
            "screen" => "screen",
            _ => "unknown"
        };
    }
}
