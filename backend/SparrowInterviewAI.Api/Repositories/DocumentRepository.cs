using Dapper;
using SparrowInterviewAI.Api.Configuration;
using SparrowInterviewAI.Api.Models;
using System.Data;

namespace SparrowInterviewAI.Api.Repositories;

public class DocumentRepository
{
    private readonly DbConnectionFactory _db;

    public DocumentRepository(DbConnectionFactory db) => _db = db;

    public async Task<IEnumerable<Document>> GetByUserAsync(Guid userId)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<Document>(
            @"SELECT id, user_id, document_type, title, original_file_name, mime_type,
                     file_size_bytes, storage_provider, storage_path, parse_status,
                     parsed_text, metadata_json, created_at, updated_at
              FROM documents
              WHERE user_id = @UserId
              ORDER BY created_at DESC",
            new { UserId = userId });
    }

    public async Task<Document> CreateAsync(Guid userId, string documentType, string filename, string? mimeType, long? fileSize, string storagePath)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleAsync<Document>(
            @"INSERT INTO documents (user_id, document_type, original_file_name, mime_type, file_size_bytes, storage_path)
              VALUES (@UserId, @DocumentType, @Filename, @MimeType, @FileSize, @StoragePath)
              RETURNING id, user_id, document_type, title, original_file_name, mime_type,
                        file_size_bytes, storage_provider, storage_path, parse_status,
                        parsed_text, metadata_json, created_at, updated_at",
            new { UserId = userId, DocumentType = documentType, Filename = filename, MimeType = mimeType, FileSize = fileSize, StoragePath = storagePath });
    }

    public async Task UpdateParseStatusAsync(Guid documentId, string status)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            "UPDATE documents SET parse_status = @Status, updated_at = now() WHERE id = @Id",
            new { Id = documentId, Status = status });
    }

    public async Task UpdateParsedContentAsync(Guid documentId, string parsedText, string status, string? profileSummary = null)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            @"UPDATE documents
              SET parsed_text = @ParsedText,
                  parse_status = @Status,
                  metadata_json = CASE
                      WHEN @ProfileSummary IS NULL THEN metadata_json
                      ELSE jsonb_set(
                          COALESCE(metadata_json, '{}'::jsonb),
                          '{profileSummary}',
                          to_jsonb(CAST(@ProfileSummary AS text)),
                          true
                      )
                  END,
                  updated_at = NOW()
              WHERE id = @DocumentId",
            new
            {
                DocumentId = documentId,
                ParsedText = parsedText,
                Status = status,
                ProfileSummary = profileSummary
            });
    }

    public async Task<Document?> GetByIdAsync(Guid documentId)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleOrDefaultAsync<Document>(
            @"SELECT id, user_id, document_type, title, original_file_name, mime_type,
                     file_size_bytes, storage_provider, storage_path, parse_status,
                     parsed_text, metadata_json, created_at, updated_at
              FROM documents
              WHERE id = @DocumentId",
            new { DocumentId = documentId });
    }

    public async Task ReplaceChunksAsync(Guid documentId, IReadOnlyCollection<DocumentChunkUpsert> chunks)
    {
        using var conn = _db.CreateConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        await conn.ExecuteAsync(
            "DELETE FROM document_chunks WHERE document_id = @DocumentId",
            new { DocumentId = documentId },
            tx);

        const string sql = """
            INSERT INTO document_chunks (
                document_id,
                chunk_index,
                chunk_text,
                token_count,
                embedding,
                metadata_json
            )
            VALUES (
                @DocumentId,
                @ChunkIndex,
                @ChunkText,
                @TokenCount,
                CASE
                    WHEN @EmbeddingLiteral IS NULL THEN NULL
                    ELSE CAST(@EmbeddingLiteral AS vector(1536))
                END,
                '{}'::jsonb
            )
            """;

        foreach (var chunk in chunks)
        {
            await conn.ExecuteAsync(
                sql,
                new
                {
                    DocumentId = documentId,
                    chunk.ChunkIndex,
                    chunk.ChunkText,
                    chunk.TokenCount,
                    chunk.EmbeddingLiteral
                },
                tx);
        }

        tx.Commit();
    }

    public async Task<IReadOnlyList<RelevantDocumentChunk>> SearchRelevantChunksAsync(Guid userId, string queryText, string? queryVectorLiteral, int limit = 5)
    {
        using var conn = _db.CreateConnection();

        if (!string.IsNullOrWhiteSpace(queryVectorLiteral))
        {
            try
            {
                var vectorMatches = await conn.QueryAsync<RelevantDocumentChunk>(
                    @"SELECT chunk_id, document_id, document_type, chunk_text, similarity
                      FROM match_document_chunks(
                        p_user_id => @UserId,
                        p_query_embedding => CAST(@Embedding AS vector(1536)),
                        p_match_count => @Limit
                      )",
                    new
                    {
                        UserId = userId,
                        Embedding = queryVectorLiteral,
                        Limit = limit
                    });

                var vectorList = vectorMatches.ToList();
                if (vectorList.Count > 0)
                {
                    return vectorList;
                }
            }
            catch
            {
                // Fall back to lexical search when pgvector is unavailable or not configured.
            }
        }

        var patterns = queryText
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(term => term.Length > 2)
            .Take(8)
            .Select(term => $"%{term}%")
            .ToArray();

        if (patterns.Length == 0)
        {
            return Array.Empty<RelevantDocumentChunk>();
        }

        var lexicalMatches = await conn.QueryAsync<RelevantDocumentChunk>(
            @"SELECT
                  dc.id AS chunk_id,
                  dc.document_id,
                  d.document_type,
                  dc.chunk_text,
                  0.0 AS similarity
              FROM document_chunks dc
              INNER JOIN documents d ON d.id = dc.document_id
              WHERE d.user_id = @UserId
                AND EXISTS (
                    SELECT 1
                    FROM unnest(@Patterns) pattern
                    WHERE dc.chunk_text ILIKE pattern
                )
              ORDER BY dc.created_at DESC
              LIMIT @Limit",
            new
            {
                UserId = userId,
                Patterns = patterns,
                Limit = limit
            });

        return lexicalMatches.ToList();
    }

    public async Task<string?> GetLatestProfileSummaryAsync(Guid userId)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleOrDefaultAsync<string?>(
            @"SELECT metadata_json ->> 'profileSummary'
              FROM documents
              WHERE user_id = @UserId
                AND document_type = 'resume'
              ORDER BY created_at DESC
              LIMIT 1",
            new { UserId = userId });
    }
}
