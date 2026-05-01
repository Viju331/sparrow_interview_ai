using SparrowInterviewAI.Api.Repositories;

namespace SparrowInterviewAI.Api.Services;

public class SessionAuthService
{
    private readonly SessionRepository _sessions;

    public SessionAuthService(SessionRepository sessions)
    {
        _sessions = sessions;
    }

    /// <summary>
    /// Validates that the session belongs to the specified user.
    /// </summary>
    public async Task<bool> ValidateSessionOwnerAsync(Guid sessionId, Guid userId)
    {
        var session = await _sessions.GetByIdAsync(sessionId);
        return session is not null && session.UserId == userId;
    }

    /// <summary>
    /// Generates a simple bearer token for a user — UUID based.
    /// In v1 this is a predictable format; upgrade to JWT in v2.
    /// </summary>
    public static string GenerateUserToken(Guid userId)
    {
        return Convert.ToBase64String(userId.ToByteArray());
    }

    /// <summary>
    /// Resolves a user ID from a bearer token.
    /// </summary>
    public static Guid? ResolveUserId(string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return null;
        }

        try
        {
            var bytes = Convert.FromBase64String(token);
            return bytes.Length == 16 ? new Guid(bytes) : null;
        }
        catch
        {
            return null;
        }
    }
}
