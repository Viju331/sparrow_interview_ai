using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using SparrowInterviewAI.Api.Models;
using SparrowInterviewAI.Api.Repositories;
using System.Text;
using UglyToad.PdfPig;
using DocumentModel = SparrowInterviewAI.Api.Models.Document;

namespace SparrowInterviewAI.Api.Services;

public class DocumentIngestionService
{
    private readonly DocumentRepository _documents;
    private readonly HashedEmbeddingService _embeddings;
    private readonly ExternalProviderService _providers;

    public DocumentIngestionService(
        DocumentRepository documents,
        HashedEmbeddingService embeddings,
        ExternalProviderService providers)
    {
        _documents = documents;
        _embeddings = embeddings;
        _providers = providers;
    }

    public async Task<DocumentModel> ProcessAsync(DocumentModel document)
    {
        await _documents.UpdateParseStatusAsync(document.Id, "processing");

        try
        {
            var parsedText = await ExtractTextAsync(document.StoragePath, document.MimeType);
            if (string.IsNullOrWhiteSpace(parsedText))
            {
                await _documents.UpdateParseStatusAsync(document.Id, "failed");
                return (await _documents.GetByIdAsync(document.Id)) ?? document;
            }

            var summary = document.DocumentType.Equals("resume", StringComparison.OrdinalIgnoreCase)
                ? await _providers.TryGenerateProfileSummaryAsync(parsedText) ?? BuildProfileSummary(parsedText)
                : null;

            await _documents.UpdateParsedContentAsync(document.Id, parsedText, "completed", summary);

            var chunkTexts = ChunkText(parsedText);
            var chunks = new List<DocumentChunkUpsert>(chunkTexts.Count);

            for (var index = 0; index < chunkTexts.Count; index++)
            {
                var chunkText = chunkTexts[index];
                var embedding = await _providers.TryCreateEmbeddingAsync(chunkText) ?? _embeddings.CreateEmbedding(chunkText);
                chunks.Add(new DocumentChunkUpsert
                {
                    ChunkIndex = index,
                    ChunkText = chunkText,
                    TokenCount = Math.Max(1, chunkText.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length),
                    EmbeddingLiteral = _embeddings.ToVectorLiteral(embedding)
                });
            }

            await _documents.ReplaceChunksAsync(document.Id, chunks);
        }
        catch
        {
            await _documents.UpdateParseStatusAsync(document.Id, "failed");
        }

        return (await _documents.GetByIdAsync(document.Id)) ?? document;
    }

    public async Task ReprocessDocumentAsync(Guid documentId)
    {
        var document = await _documents.GetByIdAsync(documentId);
        if (document is null)
        {
            return;
        }

        await ProcessAsync(document);
    }

    private static async Task<string> ExtractTextAsync(string? storagePath, string? mimeType)
    {
        if (string.IsNullOrWhiteSpace(storagePath) || !File.Exists(storagePath))
        {
            return string.Empty;
        }

        var extension = Path.GetExtension(storagePath).ToLowerInvariant();
        return extension switch
        {
            ".txt" or ".md" => await File.ReadAllTextAsync(storagePath),
            ".docx" => ExtractDocxText(storagePath),
            ".pdf" => ExtractPdfText(storagePath),
            _ when string.Equals(mimeType, "text/plain", StringComparison.OrdinalIgnoreCase) => await File.ReadAllTextAsync(storagePath),
            _ => string.Empty
        };
    }

    private static string ExtractDocxText(string path)
    {
        using var document = WordprocessingDocument.Open(path, false);
        var mainPart = document.MainDocumentPart;
        var body = mainPart?.Document?.Body;
        if (body is null)
        {
            return string.Empty;
        }

        return string.Join(
            Environment.NewLine,
            body.Descendants<Text>()
                .Select(node => node.Text?.Trim())
                .Where(text => !string.IsNullOrWhiteSpace(text)));
    }

    private static string ExtractPdfText(string path)
    {
        using var pdf = PdfDocument.Open(path);
        var builder = new StringBuilder();

        foreach (var page in pdf.GetPages())
        {
            builder.AppendLine(page.Text);
        }

        return builder.ToString();
    }

    private static IReadOnlyList<string> ChunkText(string text, int maxLength = 900)
    {
        var segments = text
            .Split(["\r\n\r\n", "\n\n", "\r\n", "\n"], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(segment => !string.IsNullOrWhiteSpace(segment))
            .ToArray();

        if (segments.Length == 0)
        {
            return Array.Empty<string>();
        }

        var chunks = new List<string>();
        var current = new StringBuilder();

        foreach (var segment in segments)
        {
            if (current.Length > 0 && current.Length + segment.Length + Environment.NewLine.Length > maxLength)
            {
                chunks.Add(current.ToString().Trim());
                current.Clear();
            }

            if (segment.Length > maxLength)
            {
                for (var index = 0; index < segment.Length; index += maxLength)
                {
                    chunks.Add(segment.Substring(index, Math.Min(maxLength, segment.Length - index)));
                }

                continue;
            }

            if (current.Length > 0)
            {
                current.AppendLine();
            }

            current.Append(segment);
        }

        if (current.Length > 0)
        {
            chunks.Add(current.ToString().Trim());
        }

        return chunks
            .Where(chunk => !string.IsNullOrWhiteSpace(chunk))
            .ToArray();
    }

    private static string BuildProfileSummary(string parsedText)
    {
        var lines = parsedText
            .Split(["\r\n", "\n"], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(line => line.Length > 20)
            .Take(4)
            .ToArray();

        if (lines.Length == 0)
        {
            return "Candidate profile summary unavailable.";
        }

        return string.Join(" ", lines);
    }
}
