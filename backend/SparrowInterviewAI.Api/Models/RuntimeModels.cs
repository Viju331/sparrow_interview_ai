using System.Text.Json;

namespace SparrowInterviewAI.Api.Models;

public class TranscriptSegmentRequest
{
    public string TranscriptText { get; set; } = string.Empty;
    public string SourceType { get; set; } = "mic";
    public long SequenceNo { get; set; }
    public bool IsPartial { get; set; }
}

public class GenerateAnswerRequest
{
    public string? QuestionText { get; set; }
    public string? PromptModifier { get; set; }
    public string ResponseType { get; set; } = "answer";
    public string? Provider { get; set; }
}

public class SessionNoteRequest
{
    public string NoteType { get; set; } = "manual";
    public string Content { get; set; } = string.Empty;
}

public class GenerateSummaryRequest
{
    public string? Provider { get; set; }
}

public class CreateMobileCompanionRequest
{
    public string? DeviceName { get; set; }
    public string DeviceType { get; set; } = "mobile_web";
}

public class MobileCompanionInfo
{
    public Guid SessionId { get; set; }
    public string ConnectionToken { get; set; } = string.Empty;
    public string CompanionUrl { get; set; } = string.Empty;
}

public class ScreenCaptureRecord
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public string CaptureType { get; set; } = "analyze_screen";
    public string? WindowTitle { get; set; }
    public string? AppName { get; set; }
    public string? StoragePath { get; set; }
    public string? OcrText { get; set; }
    public string? PromptModifier { get; set; }
    public bool SubmittedToAi { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class SessionNoteRecord
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public string NoteType { get; set; } = "manual";
    public string Content { get; set; } = string.Empty;
    public string MetadataJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; }
}

public class SessionSummaryRecord
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public string SummaryText { get; set; } = string.Empty;
    public string SummaryJson { get; set; } = "{}";
    public string GeneratedBy { get; set; } = "ai";
    public DateTime CreatedAt { get; set; }

    public JsonDocument? SummaryJsonDocument =>
        string.IsNullOrWhiteSpace(SummaryJson) ? null : JsonDocument.Parse(SummaryJson);
}

public class RelevantDocumentChunk
{
    public Guid ChunkId { get; set; }
    public Guid DocumentId { get; set; }
    public string DocumentType { get; set; } = "supporting";
    public string ChunkText { get; set; } = string.Empty;
    public double Similarity { get; set; }
}

public class SessionLiveState
{
    public Guid SessionId { get; set; }
    public string Status { get; set; } = "created";
    public string Language { get; set; } = "en";
    public DateTime? StartedAt { get; set; }
    public DetectedQuestion? LatestQuestion { get; set; }
    public AiResponse? LatestResponse { get; set; }
    public IReadOnlyList<TranscriptSegment> RecentTranscript { get; set; } = Array.Empty<TranscriptSegment>();
    public IReadOnlyList<SessionNoteRecord> Notes { get; set; } = Array.Empty<SessionNoteRecord>();
    public SessionSummaryRecord? Summary { get; set; }
}

public class DocumentChunkUpsert
{
    public int ChunkIndex { get; set; }
    public string ChunkText { get; set; } = string.Empty;
    public int? TokenCount { get; set; }
    public string? EmbeddingLiteral { get; set; }
}

public class ScreenAnalysisResult
{
    public ScreenCaptureRecord Capture { get; set; } = new();
    public DetectedQuestion? DetectedQuestion { get; set; }
    public AiResponse? Response { get; set; }
}

public class AudioTranscriptionResult
{
    public string Provider { get; set; } = "local";
    public string Model { get; set; } = "local";
    public string TranscriptText { get; set; } = string.Empty;
    public TranscriptSegment Segment { get; set; } = new();
}
