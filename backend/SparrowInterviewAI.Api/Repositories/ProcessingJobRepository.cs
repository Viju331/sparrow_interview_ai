using Dapper;
using SparrowInterviewAI.Api.Configuration;

namespace SparrowInterviewAI.Api.Repositories;

public class ProcessingJobRepository
{
    private readonly DbConnectionFactory _db;

    public ProcessingJobRepository(DbConnectionFactory db) => _db = db;

    public async Task<Guid> EnqueueAsync(string jobType, string entityType, Guid entityId, string? payloadJson = null)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleAsync<Guid>(
            @"INSERT INTO processing_jobs (job_type, entity_type, entity_id, payload_json)
              VALUES (@JobType, @EntityType, @EntityId, CAST(@PayloadJson AS jsonb))
              RETURNING id",
            new
            {
                JobType = jobType,
                EntityType = entityType,
                EntityId = entityId,
                PayloadJson = payloadJson ?? "{}"
            });
    }

    public async Task<ProcessingJobRecord?> DequeueAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleOrDefaultAsync<ProcessingJobRecord>(
            @"UPDATE processing_jobs
              SET status = 'running', attempts = attempts + 1
              WHERE id = (
                  SELECT id FROM processing_jobs
                  WHERE status = 'queued'
                  ORDER BY created_at ASC
                  LIMIT 1
                  FOR UPDATE SKIP LOCKED
              )
              RETURNING id, job_type, entity_type, entity_id, status, attempts,
                        last_error, payload_json::text AS payload_json, created_at, updated_at");
    }

    public async Task MarkCompletedAsync(Guid jobId)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            "UPDATE processing_jobs SET status = 'completed' WHERE id = @Id",
            new { Id = jobId });
    }

    public async Task MarkFailedAsync(Guid jobId, string error)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            "UPDATE processing_jobs SET status = 'failed', last_error = @Error WHERE id = @Id",
            new { Id = jobId, Error = error });
    }
}

public class ProcessingJobRecord
{
    public Guid Id { get; set; }
    public string JobType { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public Guid EntityId { get; set; }
    public string Status { get; set; } = "queued";
    public int Attempts { get; set; }
    public string? LastError { get; set; }
    public string PayloadJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
