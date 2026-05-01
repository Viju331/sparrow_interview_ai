using Dapper;
using SparrowInterviewAI.Api.Configuration;
using SparrowInterviewAI.Api.Models;
using System.Text.Json;

namespace SparrowInterviewAI.Api.Repositories;

public class SessionRepository
{
    private readonly DbConnectionFactory _db;

    public SessionRepository(DbConnectionFactory db) => _db = db;

    public async Task<InterviewSession?> GetByIdAsync(Guid id)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleOrDefaultAsync<InterviewSession>(
            @"SELECT id, user_id, title, source_app, session_mode, language,
                     status, started_at, ended_at, created_at, updated_at
              FROM interview_sessions WHERE id = @Id",
            new { Id = id });
    }

    public async Task<IEnumerable<InterviewSession>> GetByUserAsync(Guid userId, int limit = 20)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<InterviewSession>(
            @"SELECT id, user_id, title, source_app, session_mode, language,
                     status, started_at, ended_at, created_at, updated_at
              FROM interview_sessions
              WHERE user_id = @UserId
              ORDER BY created_at DESC
              LIMIT @Limit",
            new { UserId = userId, Limit = limit });
    }

    public async Task<InterviewSession> StartSessionAsync(CreateSessionRequest request)
    {
        using var conn = _db.CreateConnection();
        var sessionId = await conn.QuerySingleAsync<Guid>(
            @"SELECT start_interview_session(
                p_user_id => @UserId,
                p_title => @Title,
                p_source_app => @SourceApp,
                p_session_mode => @SessionMode,
                p_language => @Language
              )",
            new
            {
                request.UserId,
                request.Title,
                request.SourceApp,
                request.SessionMode,
                request.Language
            });

        return await GetByIdAsync(sessionId)
            ?? throw new InvalidOperationException("Session was created but could not be reloaded.");
    }

    public async Task EndSessionAsync(Guid sessionId)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            "SELECT end_interview_session(@SessionId)",
            new { SessionId = sessionId });
    }

    public async Task UpdateStatusAsync(Guid sessionId, string status)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            @"UPDATE interview_sessions
              SET status = @Status
              WHERE id = @SessionId
                AND status <> 'completed'",
            new { SessionId = sessionId, Status = status });
    }

    public async Task<IEnumerable<TranscriptSegment>> GetTranscriptAsync(Guid sessionId)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<TranscriptSegment>(
            @"SELECT id, session_id, sequence_no, source_type, speaker_label,
                     transcript_text, is_partial, is_final, started_at, ended_at, created_at
              FROM transcript_segments
              WHERE session_id = @SessionId
              ORDER BY sequence_no ASC",
            new { SessionId = sessionId });
    }

    public async Task<TranscriptSegment> AddTranscriptSegmentAsync(Guid sessionId, string transcriptText, string sourceType, long sequenceNo, bool isPartial, string? speakerLabel = null)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleAsync<TranscriptSegment>(
            @"INSERT INTO transcript_segments (session_id, sequence_no, source_type, speaker_label, transcript_text, is_partial, is_final)
              VALUES (@SessionId, @SequenceNo, @SourceType, @SpeakerLabel, @TranscriptText, @IsPartial, @IsFinal)
              RETURNING id, session_id, sequence_no, source_type, speaker_label, transcript_text, is_partial, is_final, started_at, ended_at, created_at",
            new
            {
                SessionId = sessionId,
                SequenceNo = sequenceNo,
                SourceType = sourceType,
                SpeakerLabel = speakerLabel,
                TranscriptText = transcriptText,
                IsPartial = isPartial,
                IsFinal = !isPartial
            });
    }

    public async Task<DetectedQuestion> AddDetectedQuestionAsync(
        Guid sessionId,
        string rawText,
        string cleanedText,
        string sourceType,
        string questionType,
        double? confidence = null,
        Guid? sourceReferenceId = null)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleAsync<DetectedQuestion>(
            @"INSERT INTO detected_questions (
                    session_id,
                    source_type,
                    source_reference_id,
                    raw_text,
                    cleaned_text,
                    question_type,
                    confidence
              )
              VALUES (
                    @SessionId,
                    @SourceType,
                    @SourceReferenceId,
                    @RawText,
                    @CleanedText,
                    @QuestionType,
                    @Confidence
              )
              RETURNING id, session_id, source_type, source_reference_id, raw_text, cleaned_text, question_type, confidence, created_at",
            new
            {
                SessionId = sessionId,
                SourceType = sourceType,
                SourceReferenceId = sourceReferenceId,
                RawText = rawText,
                CleanedText = cleanedText,
                QuestionType = questionType,
                Confidence = confidence
            });
    }

    public async Task<DetectedQuestion?> GetLatestQuestionAsync(Guid sessionId)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleOrDefaultAsync<DetectedQuestion>(
            @"SELECT id, session_id, source_type, source_reference_id, raw_text,
                     cleaned_text, question_type, confidence, created_at
              FROM detected_questions
              WHERE session_id = @SessionId
              ORDER BY created_at DESC
              LIMIT 1",
            new { SessionId = sessionId });
    }

    public async Task<AiResponse> AddAiResponseAsync(
        Guid sessionId,
        Guid? questionId,
        Guid? sourceCaptureId,
        string responseType,
        string? promptModifier,
        string responseText,
        string modelName,
        string? modelProvider = "local")
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleAsync<AiResponse>(
            @"INSERT INTO ai_responses (
                    session_id,
                    question_id,
                    source_capture_id,
                    response_type,
                    prompt_modifier,
                    model_provider,
                    model_name,
                    response_text,
                    status
              )
              VALUES (
                    @SessionId,
                    @QuestionId,
                    @SourceCaptureId,
                    @ResponseType,
                    @PromptModifier,
                    @ModelProvider,
                    @ModelName,
                    @ResponseText,
                    'completed'
              )
              RETURNING id, session_id, question_id, source_capture_id, response_type,
                        prompt_modifier, model_provider, model_name, input_tokens,
                        output_tokens, response_text, status, created_at",
            new
            {
                SessionId = sessionId,
                QuestionId = questionId,
                SourceCaptureId = sourceCaptureId,
                ResponseType = responseType,
                PromptModifier = promptModifier,
                ModelProvider = modelProvider,
                ModelName = modelName,
                ResponseText = responseText
            });
    }

    public async Task<AiResponse?> GetLatestResponseAsync(Guid sessionId)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleOrDefaultAsync<AiResponse>(
            @"SELECT id, session_id, question_id, source_capture_id, response_type,
                     prompt_modifier, model_provider, model_name, input_tokens,
                     output_tokens, response_text, status, created_at
              FROM ai_responses
              WHERE session_id = @SessionId
              ORDER BY created_at DESC
              LIMIT 1",
            new { SessionId = sessionId });
    }

    public async Task<ScreenCaptureRecord> AddScreenCaptureAsync(
        Guid sessionId,
        string captureType,
        string? windowTitle,
        string? appName,
        string? storagePath,
        string? ocrText,
        string? promptModifier,
        bool submittedToAi = true)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleAsync<ScreenCaptureRecord>(
            @"INSERT INTO screen_captures (
                    session_id,
                    capture_type,
                    window_title,
                    app_name,
                    storage_path,
                    ocr_text,
                    prompt_modifier,
                    submitted_to_ai
              )
              VALUES (
                    @SessionId,
                    @CaptureType,
                    @WindowTitle,
                    @AppName,
                    @StoragePath,
                    @OcrText,
                    @PromptModifier,
                    @SubmittedToAi
              )
              RETURNING id, session_id, capture_type, window_title, app_name,
                        storage_path, ocr_text, prompt_modifier, submitted_to_ai, created_at",
            new
            {
                SessionId = sessionId,
                CaptureType = captureType,
                WindowTitle = windowTitle,
                AppName = appName,
                StoragePath = storagePath,
                OcrText = ocrText,
                PromptModifier = promptModifier,
                SubmittedToAi = submittedToAi
            });
    }

    public async Task<SessionNoteRecord> AddSessionNoteAsync(Guid sessionId, string noteType, string content)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleAsync<SessionNoteRecord>(
            @"INSERT INTO session_notes (session_id, note_type, content)
              VALUES (@SessionId, @NoteType, @Content)
              RETURNING id, session_id, note_type, content, metadata_json, created_at",
            new { SessionId = sessionId, NoteType = noteType, Content = content });
    }

    public async Task<IReadOnlyList<SessionNoteRecord>> GetSessionNotesAsync(Guid sessionId)
    {
        using var conn = _db.CreateConnection();
        var notes = await conn.QueryAsync<SessionNoteRecord>(
            @"SELECT id, session_id, note_type, content, metadata_json, created_at
              FROM session_notes
              WHERE session_id = @SessionId
              ORDER BY created_at DESC",
            new { SessionId = sessionId });

        return notes.ToList();
    }

    public async Task<IReadOnlyList<DetectedQuestion>> GetAllQuestionsAsync(Guid sessionId)
    {
        using var conn = _db.CreateConnection();
        var results = await conn.QueryAsync<DetectedQuestion>(
            @"SELECT id, session_id, source_type, source_reference_id, raw_text,
                     cleaned_text, question_type, confidence, created_at
              FROM detected_questions
              WHERE session_id = @SessionId
              ORDER BY created_at ASC",
            new { SessionId = sessionId });
        return results.ToList();
    }

    public async Task<IReadOnlyList<AiResponse>> GetAllResponsesAsync(Guid sessionId)
    {
        using var conn = _db.CreateConnection();
        var results = await conn.QueryAsync<AiResponse>(
            @"SELECT id, session_id, question_id, source_capture_id, response_type,
                     prompt_modifier, model_provider, model_name, input_tokens,
                     output_tokens, response_text, status, created_at
              FROM ai_responses
              WHERE session_id = @SessionId
              ORDER BY created_at ASC",
            new { SessionId = sessionId });
        return results.ToList();
    }

    public async Task<SessionSummaryRecord> UpsertSessionSummaryAsync(Guid sessionId, string summaryText, object summaryJson)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleAsync<SessionSummaryRecord>(
            @"INSERT INTO session_summaries (session_id, summary_text, summary_json, generated_by)
              VALUES (@SessionId, @SummaryText, CAST(@SummaryJson AS jsonb), 'ai')
              ON CONFLICT (session_id)
              DO UPDATE SET
                    summary_text = EXCLUDED.summary_text,
                    summary_json = EXCLUDED.summary_json,
                    generated_by = EXCLUDED.generated_by
              RETURNING id, session_id, summary_text, summary_json::text AS summary_json, generated_by, created_at",
            new
            {
                SessionId = sessionId,
                SummaryText = summaryText,
                SummaryJson = JsonSerializer.Serialize(summaryJson)
            });
    }

    public async Task<SessionSummaryRecord?> GetSessionSummaryAsync(Guid sessionId)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleOrDefaultAsync<SessionSummaryRecord>(
            @"SELECT id, session_id, summary_text, summary_json::text AS summary_json, generated_by, created_at
              FROM session_summaries
              WHERE session_id = @SessionId",
            new { SessionId = sessionId });
    }

    public async Task<MobileCompanionInfo> CreateMobileCompanionAsync(Guid sessionId, string? deviceName, string deviceType, string companionBaseUrl)
    {
        using var conn = _db.CreateConnection();
        var token = Convert.ToHexString(Guid.NewGuid().ToByteArray()).ToLowerInvariant();

        await conn.ExecuteAsync(
            @"INSERT INTO mobile_sessions (session_id, device_name, device_type, connection_token, last_seen_at)
              VALUES (@SessionId, @DeviceName, @DeviceType, @ConnectionToken, NOW())",
            new
            {
                SessionId = sessionId,
                DeviceName = deviceName,
                DeviceType = deviceType,
                ConnectionToken = token
            });

        return new MobileCompanionInfo
        {
            SessionId = sessionId,
            ConnectionToken = token,
            CompanionUrl = $"{companionBaseUrl.TrimEnd('/')}/#/mobile/{token}"
        };
    }

    public async Task<Guid?> ResolveMobileSessionIdAsync(string token)
    {
        using var conn = _db.CreateConnection();
        var sessionId = await conn.QuerySingleOrDefaultAsync<Guid?>(
            @"SELECT session_id
              FROM mobile_sessions
              WHERE connection_token = @Token",
            new { Token = token });

        if (sessionId is not null)
        {
            await conn.ExecuteAsync(
                @"UPDATE mobile_sessions
                  SET last_seen_at = NOW()
                  WHERE connection_token = @Token",
                new { Token = token });
        }

        return sessionId;
    }
}
