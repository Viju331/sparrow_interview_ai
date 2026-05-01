namespace SparrowInterviewAI.Api.Models;

public class InterviewSession
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string? Title { get; set; }
    public string? SourceApp { get; set; }
    public string SessionMode { get; set; } = "practice";
    public string Language { get; set; } = "en";
    public string Status { get; set; } = "created";
    public DateTime? StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class TranscriptSegment
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public long SequenceNo { get; set; }
    public string SourceType { get; set; } = "mic";
    public string? SpeakerLabel { get; set; }
    public string TranscriptText { get; set; } = string.Empty;
    public bool IsPartial { get; set; }
    public bool IsFinal { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class DetectedQuestion
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public Guid? SourceReferenceId { get; set; }
    public string SourceType { get; set; } = "transcript";
    public string RawText { get; set; } = string.Empty;
    public string? CleanedText { get; set; }
    public string QuestionType { get; set; } = "general";
    public double? Confidence { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class AiResponse
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public Guid? QuestionId { get; set; }
    public Guid? SourceCaptureId { get; set; }
    public string ResponseType { get; set; } = "answer";
    public string? PromptModifier { get; set; }
    public string ResponseText { get; set; } = string.Empty;
    public string? ModelProvider { get; set; }
    public string? ModelName { get; set; }
    public int? InputTokens { get; set; }
    public int? OutputTokens { get; set; }
    public string Status { get; set; } = "completed";
    public DateTime CreatedAt { get; set; }
}

public class CreateSessionRequest
{
    public Guid UserId { get; set; }
    public string? Title { get; set; }
    public string? SourceApp { get; set; }
    public string SessionMode { get; set; } = "practice";
    public string Language { get; set; } = "en";
}
