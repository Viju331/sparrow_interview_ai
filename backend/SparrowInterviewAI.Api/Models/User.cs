namespace SparrowInterviewAI.Api.Models;

public class User
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string PreferredLanguage { get; set; } = "en";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class UserProfile
{
    public Guid UserId { get; set; }
    public string? TargetRole { get; set; }
    public string? CompanyName { get; set; }
    public string? JobDescription { get; set; }
    public string? CustomInstructions { get; set; }
    public string? Timezone { get; set; }
    public bool OnboardingCompleted { get; set; }
    public DateTime? OnboardingCompletedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class CreateUserRequest
{
    public string FullName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string Language { get; set; } = "en";
    public string? TargetRole { get; set; }
    public string? CompanyName { get; set; }
    public string? JobDescription { get; set; }
    public string? CustomInstructions { get; set; }
}
