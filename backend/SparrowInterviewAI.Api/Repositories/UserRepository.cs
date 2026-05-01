using Dapper;
using SparrowInterviewAI.Api.Configuration;
using SparrowInterviewAI.Api.Models;

namespace SparrowInterviewAI.Api.Repositories;

public class UserRepository
{
    private readonly DbConnectionFactory _db;

    public UserRepository(DbConnectionFactory db) => _db = db;

    public async Task<User?> GetByIdAsync(Guid id)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleOrDefaultAsync<User>(
            "SELECT id, full_name, email, preferred_language, created_at, updated_at FROM users WHERE id = @Id",
            new { Id = id });
    }

    public async Task<User> CreateAsync(CreateUserRequest request)
    {
        using var conn = _db.CreateConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        var user = await conn.QuerySingleAsync<User>(
            @"INSERT INTO users (full_name, email, preferred_language)
              VALUES (@FullName, @Email, @Language)
              RETURNING id, full_name, email, preferred_language, created_at, updated_at",
            new { request.FullName, request.Email, request.Language },
            tx);

        await conn.ExecuteAsync(
            @"INSERT INTO user_profiles (
                    user_id,
                    target_role,
                    company_name,
                    job_description,
                    custom_instructions,
                    onboarding_completed,
                    onboarding_completed_at
              )
              VALUES (
                    @UserId,
                    @TargetRole,
                    @CompanyName,
                    @JobDescription,
                    @CustomInstructions,
                    TRUE,
                    NOW()
              )",
            new
            {
                UserId = user.Id,
                request.TargetRole,
                request.CompanyName,
                request.JobDescription,
                request.CustomInstructions
            },
            tx);

        tx.Commit();
        return user;
    }

    public async Task<UserProfile?> GetProfileAsync(Guid userId)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleOrDefaultAsync<UserProfile>(
            @"SELECT user_id, target_role, company_name, job_description,
                     custom_instructions, timezone, onboarding_completed,
                     onboarding_completed_at, created_at, updated_at
              FROM user_profiles WHERE user_id = @UserId",
            new { UserId = userId });
    }
}
