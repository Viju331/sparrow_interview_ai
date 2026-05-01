using SparrowInterviewAI.Api.Services;

namespace SparrowInterviewAI.Api.Tests;

public class SessionAuthServiceTests
{
    [Fact]
    public void GenerateUserToken_ReturnsNonEmptyString()
    {
        var userId = Guid.NewGuid();
        var token = SessionAuthService.GenerateUserToken(userId);

        Assert.False(string.IsNullOrWhiteSpace(token));
    }

    [Fact]
    public void ResolveUserId_RoundTrips_WithGenerateUserToken()
    {
        var userId = Guid.NewGuid();
        var token = SessionAuthService.GenerateUserToken(userId);

        var resolved = SessionAuthService.ResolveUserId(token);

        Assert.NotNull(resolved);
        Assert.Equal(userId, resolved.Value);
    }

    [Fact]
    public void ResolveUserId_ReturnsNull_ForNullOrEmptyToken()
    {
        Assert.Null(SessionAuthService.ResolveUserId(null));
        Assert.Null(SessionAuthService.ResolveUserId(""));
        Assert.Null(SessionAuthService.ResolveUserId("   "));
    }

    [Fact]
    public void ResolveUserId_ReturnsNull_ForInvalidBase64()
    {
        Assert.Null(SessionAuthService.ResolveUserId("not-valid-base64!@#"));
    }

    [Fact]
    public void ResolveUserId_ReturnsNull_ForWrongLengthBytes()
    {
        var shortToken = Convert.ToBase64String(new byte[] { 1, 2, 3 });
        Assert.Null(SessionAuthService.ResolveUserId(shortToken));
    }

    [Fact]
    public void GenerateUserToken_DifferentUsers_ProduceDifferentTokens()
    {
        var token1 = SessionAuthService.GenerateUserToken(Guid.NewGuid());
        var token2 = SessionAuthService.GenerateUserToken(Guid.NewGuid());

        Assert.NotEqual(token1, token2);
    }
}
