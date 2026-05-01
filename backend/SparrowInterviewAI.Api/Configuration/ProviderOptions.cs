namespace SparrowInterviewAI.Api.Configuration;

public sealed class ProviderOptions
{
    public string DefaultAiProvider { get; set; } = "local";
    public string DefaultTranscriptionProvider { get; set; } = "browser-speech";
    public string DefaultOcrProvider { get; set; } = "local";
    public OpenAiProviderOptions OpenAi { get; set; } = new();
    public AzureVisionProviderOptions AzureVision { get; set; } = new();
    public GitHubModelsProviderOptions GitHubModels { get; set; } = new();
    public GeminiProviderOptions Gemini { get; set; } = new();
}

public sealed class OpenAiProviderOptions
{
    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://api.openai.com/v1";
    public string ChatModel { get; set; } = "gpt-4.1-mini";
    public string VisionModel { get; set; } = "gpt-4.1-mini";
    public string TranscriptionModel { get; set; } = "gpt-4o-transcribe";
    public string EmbeddingModel { get; set; } = "text-embedding-3-small";
}

public sealed class AzureVisionProviderOptions
{
    public string Endpoint { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string ApiVersion { get; set; } = "2024-02-01";
    public string DefaultLanguage { get; set; } = "en";
}

/// <summary>
/// GitHub Models inference — uses OpenAI-compatible Chat Completions API.
/// Set Token to a GitHub Personal Access Token with models:read scope.
/// </summary>
public sealed class GitHubModelsProviderOptions
{
    public string Token { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://models.github.ai/inference";
    public string ChatModel { get; set; } = "openai/gpt-4.1-mini";
    public string VisionModel { get; set; } = "openai/gpt-4.1-mini";
}

/// <summary>
/// Google Gemini — uses the OpenAI-compatible endpoint provided by Google.
/// Set ApiKey to a Gemini API key from Google AI Studio (aistudio.google.com).
/// Note: Gemini text-embedding-004 outputs 768 dims and will be padded to 1536
/// for pgvector compatibility. Do not mix embedding models in the same database.
/// </summary>
public sealed class GeminiProviderOptions
{
    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://generativelanguage.googleapis.com/v1beta/openai";
    public string ChatModel { get; set; } = "gemini-2.0-flash";
    public string VisionModel { get; set; } = "gemini-2.0-flash";
    public string TranscriptionModel { get; set; } = "gemini-2.5-flash";
    public string EmbeddingModel { get; set; } = "text-embedding-004";
}
