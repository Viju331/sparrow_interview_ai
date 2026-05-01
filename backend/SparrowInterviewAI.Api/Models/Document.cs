namespace SparrowInterviewAI.Api.Models;

public class Document
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string DocumentType { get; set; } = "supporting";
    public string? Title { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string? MimeType { get; set; }
    public long? FileSizeBytes { get; set; }
    public string StorageProvider { get; set; } = "local";
    public string? StoragePath { get; set; }
    public string ParseStatus { get; set; } = "pending";
    public string? ParsedText { get; set; }
    public string MetadataJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class DocumentChunk
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public int ChunkIndex { get; set; }
    public string ChunkText { get; set; } = string.Empty;
    public int? TokenCount { get; set; }
    public DateTime CreatedAt { get; set; }
}
