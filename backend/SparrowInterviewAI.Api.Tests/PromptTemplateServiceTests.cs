using SparrowInterviewAI.Api.Services;

namespace SparrowInterviewAI.Api.Tests;

public class PromptTemplateServiceTests
{
    private readonly PromptTemplateService _prompts = new();

    [Fact]
    public void SessionSummaryGuidance_ContainsRequiredSections()
    {
        var guidance = _prompts.SessionSummaryGuidance;

        Assert.Contains("KEY QUESTIONS ASKED", guidance);
        Assert.Contains("SUGGESTED ANSWERS", guidance);
        Assert.Contains("WEAK AREAS", guidance);
        Assert.Contains("FOLLOW-UP PREPARATION", guidance);
        Assert.Contains("ACTION ITEMS", guidance);
        Assert.Contains("SESSION OVERVIEW", guidance);
    }

    [Fact]
    public void BuildCodingAnswer_ContainsStructuredSectionDelimiters()
    {
        var result = _prompts.BuildCodingAnswer("Two Sum problem", "C# developer with 5 years", null);

        Assert.Contains("===PROBLEM_UNDERSTANDING===", result);
        Assert.Contains("===ASSUMPTIONS===", result);
        Assert.Contains("===BRUTE_FORCE===", result);
        Assert.Contains("===OPTIMIZED===", result);
        Assert.Contains("===COMPLEXITY===", result);
        Assert.Contains("===CODE===", result);
        Assert.Contains("===DRY_RUN===", result);
        Assert.Contains("===EDGE_CASES===", result);
    }

    [Fact]
    public void BuildBehavioralAnswer_ContainsSTARReference()
    {
        var result = _prompts.BuildBehavioralAnswer("Tell me about a leadership challenge", "Lead engineer", null);

        Assert.Contains("STAR", result);
    }

    [Fact]
    public void BuildSystemDesignAnswer_ContainsDesignComponents()
    {
        var result = _prompts.BuildSystemDesignAnswer("Design a URL shortener", "Backend engineer", null);

        Assert.Contains("requirements", result);
        Assert.Contains("tradeoffs", result);
    }

    [Fact]
    public void AnswerGuidance_IsNotEmpty()
    {
        Assert.False(string.IsNullOrWhiteSpace(_prompts.AnswerGuidance));
    }

    [Fact]
    public void QuestionCleaningGuidance_IsNotEmpty()
    {
        Assert.False(string.IsNullOrWhiteSpace(_prompts.QuestionCleaningGuidance));
    }

    [Fact]
    public void BuildCodingAnswer_IncludesPromptModifier_WhenProvided()
    {
        var result = _prompts.BuildCodingAnswer("Reverse a linked list", "context", "Use Python");

        Assert.Contains("Use Python", result);
    }
}
