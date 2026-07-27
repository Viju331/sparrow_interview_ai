using Microsoft.Extensions.Options;
using SparrowInterviewAI.Api.Configuration;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace SparrowInterviewAI.Api.Services;

public class ExternalProviderService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>A single turn in a conversation to pass as history to AI calls.</summary>
    public record ConversationMessage(string Role, string Content);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ProviderOptions _options;
    private readonly ILogger<ExternalProviderService> _logger;

    public ExternalProviderService(
        IHttpClientFactory httpClientFactory,
        IOptions<ProviderOptions> options,
        ILogger<ExternalProviderService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;
    }

    public string ResolveAiProvider(string? requestedProvider)
        => NormalizeProvider(requestedProvider, _options.DefaultAiProvider);

    public string ResolveTranscriptionProvider(string? requestedProvider)
        => NormalizeProvider(requestedProvider, _options.DefaultTranscriptionProvider);

    public string ResolveOcrProvider(string? requestedProvider)
        => NormalizeProvider(requestedProvider, _options.DefaultOcrProvider);

    public bool SupportsOpenAi => !string.IsNullOrWhiteSpace(_options.OpenAi.ApiKey);
    public bool SupportsAzureVision =>
        !string.IsNullOrWhiteSpace(_options.AzureVision.Endpoint)
        && !string.IsNullOrWhiteSpace(_options.AzureVision.ApiKey);
    public bool SupportsGitHub => !string.IsNullOrWhiteSpace(_options.GitHubModels.Token);
    public bool SupportsGemini => !string.IsNullOrWhiteSpace(_options.Gemini.ApiKey);
    public bool SupportsGroq => !string.IsNullOrWhiteSpace(_options.Groq.ApiKey);
    public bool SupportsLocalWhisper => _options.LocalWhisper.IsEnabled && !string.IsNullOrWhiteSpace(_options.LocalWhisper.BaseUrl);
    public bool SupportsPaddleOcr => _options.PaddleOcr.IsEnabled && !string.IsNullOrWhiteSpace(_options.PaddleOcr.BaseUrl);

    // ─── Public text-generation entry points ──────────────────────────────

    public Task<string?> TryGenerateTextAsync(
        string? provider,
        string systemPrompt,
        string userPrompt,
        IReadOnlyList<ConversationMessage>? history = null,
        CancellationToken cancellationToken = default)
    {
        return ResolveAiProvider(provider) switch
        {
            "openai" when SupportsOpenAi =>
                GenerateViaOpenAiResponsesAsync(systemPrompt, userPrompt, history, cancellationToken),
            "github" when SupportsGitHub =>
                GenerateViaChatCompletionsAsync(
                    BuildGitHubUrl("chat/completions"), _options.GitHubModels.ChatModel,
                    AddGitHubHeaders, systemPrompt, userPrompt, history, cancellationToken),
            "gemini" when SupportsGemini =>
                GenerateViaChatCompletionsAsync(
                    BuildGeminiUrl("chat/completions"), _options.Gemini.ChatModel,
                    AddGeminiHeaders, systemPrompt, userPrompt, history, cancellationToken),
            _ => Task.FromResult<string?>(null)
        };
    }

    // ─── Private: OpenAI Responses API (non-streaming) ────────────────────

    private async Task<string?> GenerateViaOpenAiResponsesAsync(
        string systemPrompt,
        string userPrompt,
        IReadOnlyList<ConversationMessage>? history,
        CancellationToken cancellationToken)
    {
        var inputList = new List<object>
        {
            new { role = "system", content = new object[] { new { type = "input_text", text = systemPrompt } } }
        };

        if (history != null)
            foreach (var msg in history)
            {
                var contentType = msg.Role == "assistant" ? "output_text" : "input_text";
                inputList.Add(new { role = msg.Role, content = new object[] { new { type = contentType, text = msg.Content } } });
            }

        inputList.Add(new { role = "user", content = new object[] { new { type = "input_text", text = userPrompt } } });

        var payload = new { model = _options.OpenAi.ChatModel, input = inputList };

        using var request = new HttpRequestMessage(HttpMethod.Post, BuildOpenAiUrl("responses"))
        {
            Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json")
        };

        AddOpenAiHeaders(request);
        using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("OpenAI text generation failed with status {StatusCode}: {Body}", response.StatusCode, body);
            return null;
        }

        using var json = JsonDocument.Parse(body);
        return ParseOpenAiOutputText(json.RootElement);
    }

    // ─── Private: OpenAI-compatible Chat Completions (GitHub Models + Gemini) ──

    private async Task<string?> GenerateViaChatCompletionsAsync(
        string url,
        string model,
        Action<HttpRequestMessage> addHeaders,
        string systemPrompt,
        string userPrompt,
        IReadOnlyList<ConversationMessage>? history,
        CancellationToken cancellationToken)
    {
        var messages = new List<object> { new { role = "system", content = systemPrompt } };
        if (history != null)
            foreach (var msg in history)
                messages.Add(new { role = msg.Role, content = msg.Content });
        messages.Add(new { role = "user", content = userPrompt });
        var serialized = JsonSerializer.Serialize(new { model, messages }, JsonOptions);

        int[] retryDelaysMs = [1000, 2000, 4000];
        for (int attempt = 0; attempt <= retryDelaysMs.Length; attempt++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(serialized, Encoding.UTF8, "application/json")
            };
            addHeaders(request);

            using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if ((int)response.StatusCode == 503 && attempt < retryDelaysMs.Length)
            {
                _logger.LogWarning("Chat Completions 503 on attempt {Attempt}, retrying in {Delay}ms...", attempt + 1, retryDelaysMs[attempt]);
                await Task.Delay(retryDelaysMs[attempt], cancellationToken);
                continue;
            }

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Chat Completions call to {Url} failed with {StatusCode}: {Body}", url, response.StatusCode, body);
                return null;
            }

            using var json = JsonDocument.Parse(body);
            return ParseChatCompletionsContent(json.RootElement);
        }

        return null;
    }

    private static string? ParseChatCompletionsContent(JsonElement root)
    {
        if (!root.TryGetProperty("choices", out var choices)
            || choices.ValueKind != JsonValueKind.Array
            || choices.GetArrayLength() == 0)
        {
            return null;
        }

        var first = choices[0];
        if (first.TryGetProperty("message", out var message)
            && message.TryGetProperty("content", out var content)
            && content.ValueKind == JsonValueKind.String)
        {
            return content.GetString()?.Trim();
        }

        return null;
    }

    public async Task<string?> TryGenerateProfileSummaryAsync(string parsedText, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(parsedText))
        {
            return null;
        }

        var prompt = """
            Summarize this candidate profile in 3 concise sentences.
            Focus on likely role fit, strongest experience themes, and notable technical strengths.
            Do not invent facts. Keep it resume-grounded and recruiter-friendly.
            """;

        // Use whichever AI provider is configured (OpenAI, GitHub Models, or Gemini).
        return await TryGenerateTextAsync(_options.DefaultAiProvider, prompt, parsedText, history: null, cancellationToken);
    }

    public async Task<float[]?> TryCreateEmbeddingAsync(string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        // Prefer OpenAI embeddings (1536 dims, no padding needed).
        // Fall back to Gemini text-embedding-004 (768 dims, padded to 1536).
        // Note: do not mix embedding models in the same database — cosine similarity
        // across different embedding spaces is meaningless.
        string embeddingUrl;
        string model;
        Action<HttpRequestMessage> addHeaders;

        if (SupportsOpenAi)
        {
            embeddingUrl = BuildOpenAiUrl("embeddings");
            model = _options.OpenAi.EmbeddingModel;
            addHeaders = AddOpenAiHeaders;
        }
        else if (SupportsGemini)
        {
            // Gemini does not support embeddings via the OpenAI-compat endpoint.
            // Use the native embedContent API instead.
            return await TryCreateEmbeddingWithGeminiNativeAsync(text, cancellationToken);
        }
        else
        {
            return null;
        }

        var payload = new { model, input = text };
        using var request = new HttpRequestMessage(HttpMethod.Post, embeddingUrl)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json")
        };

        addHeaders(request);
        using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Embedding request to {Url} failed with {StatusCode}: {Body}", embeddingUrl, response.StatusCode, body);
            return null;
        }

        using var json = JsonDocument.Parse(body);
        if (!json.RootElement.TryGetProperty("data", out var data)
            || data.ValueKind != JsonValueKind.Array
            || data.GetArrayLength() == 0)
        {
            return null;
        }

        var embedding = data[0].GetProperty("embedding");
        var vector = new float[embedding.GetArrayLength()];
        var index = 0;
        foreach (var item in embedding.EnumerateArray())
        {
            vector[index++] = item.GetSingle();
        }

        return NormalizeVector(vector, HashedEmbeddingService.Dimensions);
    }

    private async Task<float[]?> TryCreateEmbeddingWithGeminiNativeAsync(string text, CancellationToken cancellationToken)
    {
        var model = _options.Gemini.EmbeddingModel;
        var nativeBaseUrl = _options.Gemini.BaseUrl
            .Replace("/openai", string.Empty, StringComparison.OrdinalIgnoreCase)
            .TrimEnd('/');
        var url = $"{nativeBaseUrl}/models/{model}:embedContent?key={_options.Gemini.ApiKey}";

        var requestBody = new
        {
            content = new
            {
                parts = new[] { new { text } }
            }
        };

        var json = JsonSerializer.Serialize(requestBody, JsonOptions);
        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };

        using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Gemini native embedding failed {StatusCode}: {Body}", response.StatusCode, body);
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            var values = doc.RootElement.GetProperty("embedding").GetProperty("values");
            var vector = new float[values.GetArrayLength()];
            var index = 0;
            foreach (var item in values.EnumerateArray())
            {
                vector[index++] = item.GetSingle();
            }
            return NormalizeVector(vector, HashedEmbeddingService.Dimensions);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse Gemini embedding response: {Body}", body);
            return null;
        }
    }

    public async Task<(string? Text, string Provider, string Model)> TryTranscribeAudioAsync(
        string? provider,
        Stream audioStream,
        string fileName,
        string? contentType,
        string language,
        CancellationToken cancellationToken = default)
    {
        var resolved = ResolveTranscriptionProvider(provider);

        string transcriptionUrl;
        string model;
        Action<HttpRequestMessage> addHeaders;
        string providerLabel;

        if (resolved == "openai-transcribe" || resolved == "openai")
        {
            if (!SupportsOpenAi) return (null, "openai", _options.OpenAi.TranscriptionModel);
            transcriptionUrl = BuildOpenAiUrl("audio/transcriptions");
            model = _options.OpenAi.TranscriptionModel;
            addHeaders = AddOpenAiHeaders;
            providerLabel = "openai";
        }
        else if (resolved == "gemini")
        {
            // Gemini's OpenAI-compat endpoint does NOT support /audio/transcriptions.
            // Use the native generateContent API instead.
            if (!SupportsGemini) return (null, "gemini", _options.Gemini.TranscriptionModel);
            return await TranscribeWithGeminiNativeAsync(audioStream, contentType, language, cancellationToken);
        }
        else if (resolved == "github")
        {
            if (!SupportsGitHub) return (null, "github", _options.GitHubModels.ChatModel);
            // GitHub Models does not support audio transcription
            return (null, "local", "local");
        }
        else if (resolved == "groq")
        {
            if (!SupportsGroq) return (null, "groq", _options.Groq.TranscriptionModel);
            transcriptionUrl = $"{_options.Groq.BaseUrl.TrimEnd('/')}/audio/transcriptions";
            model = _options.Groq.TranscriptionModel;
            addHeaders = AddGroqHeaders;
            providerLabel = "groq";
        }
        else if (resolved == "local-whisper" || resolved == "whisper-cpp")
        {
            if (!SupportsLocalWhisper) return (null, "local-whisper", _options.LocalWhisper.TranscriptionModel);
            transcriptionUrl = $"{_options.LocalWhisper.BaseUrl.TrimEnd('/')}/audio/transcriptions";
            model = _options.LocalWhisper.TranscriptionModel;
            addHeaders = _ => { }; // local server — no auth header
            providerLabel = "local-whisper";
        }
        else
        {
            // "local" or unrecognised — caller handles null gracefully
            return (null, "local", "local");
        }

        using var form = new MultipartFormDataContent();
        using var audioContent = new StreamContent(audioStream);
        audioContent.Headers.ContentType = MediaTypeHeaderValue.Parse(
            string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType);
        form.Add(audioContent, "file", fileName);
        form.Add(new StringContent(model), "model");
        form.Add(new StringContent(language), "language");
        form.Add(new StringContent("text"), "response_format");

        using var request = new HttpRequestMessage(HttpMethod.Post, transcriptionUrl) { Content = form };
        addHeaders(request);

        using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("{Provider} transcription failed {StatusCode}: {Body}", providerLabel, response.StatusCode, body);
            return (null, providerLabel, model);
        }

        return (body.Trim(), providerLabel, model);
    }

    private async Task<(string? Text, string Provider, string Model)> TranscribeWithGeminiNativeAsync(
        Stream audioStream,
        string? contentType,
        string language,
        CancellationToken cancellationToken)
    {
        var model = _options.Gemini.TranscriptionModel;
        // Native Gemini URL bypasses the /openai compat base and uses the key as query param
        var nativeBaseUrl = _options.Gemini.BaseUrl
            .Replace("/openai", string.Empty, StringComparison.OrdinalIgnoreCase)
            .TrimEnd('/');
        var url = $"{nativeBaseUrl}/models/{model}:generateContent?key={_options.Gemini.ApiKey}";

        using var memStream = new MemoryStream();
        await audioStream.CopyToAsync(memStream, cancellationToken);
        var audioBase64 = Convert.ToBase64String(memStream.ToArray());
        // Strip codec parameters — Gemini only accepts the base MIME type (e.g. "audio/webm", not "audio/webm;codecs=opus")
        var rawMime = string.IsNullOrWhiteSpace(contentType) ? "audio/webm" : contentType;
        var mimeType = rawMime.Contains(';') ? rawMime[..rawMime.IndexOf(';')].Trim() : rawMime;

        var requestBody = new
        {
            contents = new[]
            {
                new
                {
                    parts = new object[]
                    {
                        new { text = $"Transcribe this audio accurately. Return only the spoken words verbatim, nothing else. Language: {language}." },
                        new { inline_data = new { mime_type = mimeType, data = audioBase64 } }
                    }
                }
            }
        };

        var json = JsonSerializer.Serialize(requestBody, JsonOptions);
        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };

        using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        _logger.LogInformation("Gemini transcription response {StatusCode}: {Body}", (int)response.StatusCode, body.Length > 500 ? body[..500] : body);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Gemini native transcription failed {StatusCode}: {Body}", response.StatusCode, body);
            return (null, "gemini", model);
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            var candidates = doc.RootElement.GetProperty("candidates");
            if (candidates.GetArrayLength() == 0)
            {
                _logger.LogWarning("Gemini transcription returned zero candidates. Body: {Body}", body);
                return (null, "gemini", model);
            }
            var text = candidates[0]
                .GetProperty("content")
                .GetProperty("parts")[0]
                .GetProperty("text")
                .GetString();
            _logger.LogInformation("Gemini transcribed: {Text}", text);
            return (text?.Trim(), "gemini", model);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse Gemini transcription response: {Body}", body);
            return (null, "gemini", model);
        }
    }

    public async Task<(string? Text, string Provider, string Model)> TryExtractTextAsync(
        string? provider,
        string filePath,
        string? language,
        CancellationToken cancellationToken = default)
    {
        var resolved = ResolveOcrProvider(provider);

        if (resolved == "azure-vision" && SupportsAzureVision)
        {
            return (
                await ExtractWithAzureVisionAsync(filePath, language, cancellationToken),
                "azure-vision",
                "imageanalysis-read");
        }

        if (resolved == "openai-vision" && SupportsOpenAi)
        {
            return (
                await ExtractWithOpenAiVisionAsync(filePath, cancellationToken),
                "openai-vision",
                _options.OpenAi.VisionModel);
        }

        if (resolved == "github-vision" && SupportsGitHub)
        {
            return (
                await ExtractWithChatCompletionsVisionAsync(
                    BuildGitHubUrl("chat/completions"), _options.GitHubModels.VisionModel,
                    AddGitHubHeaders, filePath, cancellationToken),
                "github-vision",
                _options.GitHubModels.VisionModel);
        }

        if (resolved == "gemini-vision" && SupportsGemini)
        {
            return (
                await ExtractWithChatCompletionsVisionAsync(
                    BuildGeminiUrl("chat/completions"), _options.Gemini.VisionModel,
                    AddGeminiHeaders, filePath, cancellationToken),
                "gemini-vision",
                _options.Gemini.VisionModel);
        }

        if (resolved == "paddle-ocr" && SupportsPaddleOcr)
        {
            return (
                await ExtractWithPaddleOcrAsync(filePath, language, cancellationToken),
                "paddle-ocr",
                "paddleocr");
        }

        return (null, "local", "local");
    }

    // ─── Private: Chat Completions vision OCR (GitHub Models + Gemini) ────

    private async Task<string?> ExtractWithChatCompletionsVisionAsync(
        string url,
        string model,
        Action<HttpRequestMessage> addHeaders,
        string filePath,
        CancellationToken cancellationToken)
    {
        if (!File.Exists(filePath))
        {
            return null;
        }

        var bytes = await File.ReadAllBytesAsync(filePath, cancellationToken);
        var mimeType = GetMimeType(filePath);
        var dataUrl = $"data:{mimeType};base64,{Convert.ToBase64String(bytes)}";

        var payload = new
        {
            model,
            messages = new object[]
            {
                new
                {
                    role = "system",
                    content = "Extract all visible text from the screenshot. Return plain text only with line breaks preserved. Do not add commentary."
                },
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "text", text = "Extract the readable interview question, code, errors, and relevant UI text from this image." },
                        new { type = "image_url", image_url = new { url = dataUrl } }
                    }
                }
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json")
        };

        addHeaders(request);
        using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Vision OCR call to {Url} failed with {StatusCode}: {Body}", url, response.StatusCode, body);
            return null;
        }

        using var json = JsonDocument.Parse(body);
        return ParseChatCompletionsContent(json.RootElement);
    }

    private async Task<string?> ExtractWithOpenAiVisionAsync(string filePath, CancellationToken cancellationToken)
    {
        if (!File.Exists(filePath))
        {
            return null;
        }

        var bytes = await File.ReadAllBytesAsync(filePath, cancellationToken);
        var mimeType = GetMimeType(filePath);
        var dataUrl = $"data:{mimeType};base64,{Convert.ToBase64String(bytes)}";

        var payload = new
        {
            model = _options.OpenAi.VisionModel,
            input = new object[]
            {
                new
                {
                    role = "system",
                    content = new object[]
                    {
                        new
                        {
                            type = "input_text",
                            text = "Extract all visible text from the screenshot. Return plain text only with line breaks preserved where helpful. Do not add commentary."
                        }
                    }
                },
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "input_text", text = "Extract the readable interview question, code, errors, and relevant UI text from this image." },
                        new { type = "input_image", image_url = dataUrl }
                    }
                }
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, BuildOpenAiUrl("responses"))
        {
            Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json")
        };

        AddOpenAiHeaders(request);
        using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("OpenAI vision OCR failed with status {StatusCode}: {Body}", response.StatusCode, body);
            return null;
        }

        using var json = JsonDocument.Parse(body);
        return ParseOpenAiOutputText(json.RootElement);
    }

    private async Task<string?> ExtractWithAzureVisionAsync(string filePath, string? language, CancellationToken cancellationToken)
    {
        if (!File.Exists(filePath))
        {
            return null;
        }

        var endpoint = _options.AzureVision.Endpoint.TrimEnd('/');
        var requestUri = $"{endpoint}/computervision/imageanalysis:analyze?overload=stream&features=read&language={Uri.EscapeDataString(string.IsNullOrWhiteSpace(language) ? _options.AzureVision.DefaultLanguage : language)}&api-version={_options.AzureVision.ApiVersion}";

        await using var fileStream = File.OpenRead(filePath);
        using var streamContent = new StreamContent(fileStream);
        streamContent.Headers.ContentType = MediaTypeHeaderValue.Parse(GetMimeType(filePath));

        using var request = new HttpRequestMessage(HttpMethod.Post, requestUri)
        {
            Content = streamContent
        };

        request.Headers.Add("Ocp-Apim-Subscription-Key", _options.AzureVision.ApiKey);

        using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Azure Vision OCR failed with status {StatusCode}: {Body}", response.StatusCode, body);
            return null;
        }

        using var json = JsonDocument.Parse(body);
        if (!json.RootElement.TryGetProperty("readResult", out var readResult)
            || !readResult.TryGetProperty("blocks", out var blocks)
            || blocks.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var lines = new List<string>();
        foreach (var block in blocks.EnumerateArray())
        {
            if (!block.TryGetProperty("lines", out var blockLines) || blockLines.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var line in blockLines.EnumerateArray())
            {
                if (line.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
                {
                    var value = text.GetString();
                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        lines.Add(value.Trim());
                    }
                }
            }
        }

        return lines.Count == 0 ? null : string.Join(Environment.NewLine, lines);
    }

    private async Task<string?> ExtractWithPaddleOcrAsync(string filePath, string? language, CancellationToken cancellationToken)
    {
        if (!File.Exists(filePath))
        {
            return null;
        }

        var url = $"{_options.PaddleOcr.BaseUrl.TrimEnd('/')}/ocr";

        await using var fileStream = File.OpenRead(filePath);
        using var form = new MultipartFormDataContent();

        using var fileContent = new StreamContent(fileStream);
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse(GetMimeType(filePath));
        form.Add(fileContent, "file", Path.GetFileName(filePath));

        if (!string.IsNullOrWhiteSpace(language))
            form.Add(new StringContent(language), "language");

        using var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = form };
        using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("PaddleOCR failed with {StatusCode}: {Body}", response.StatusCode, body);
            return null;
        }

        try
        {
            using var json = JsonDocument.Parse(body);
            return json.RootElement.TryGetProperty("text", out var text)
                ? text.GetString()?.Trim()
                : null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse PaddleOCR response: {Body}", body);
            return null;
        }
    }

    private static string? ParseOpenAiOutputText(JsonElement root)
    {
        if (root.TryGetProperty("output_text", out var outputText) && outputText.ValueKind == JsonValueKind.String)
        {
            return outputText.GetString()?.Trim();
        }

        if (!root.TryGetProperty("output", out var output) || output.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var builder = new StringBuilder();
        foreach (var item in output.EnumerateArray())
        {
            if (!item.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var part in content.EnumerateArray())
            {
                if (part.TryGetProperty("type", out var type)
                    && type.ValueKind == JsonValueKind.String
                    && type.GetString() == "output_text"
                    && part.TryGetProperty("text", out var text)
                    && text.ValueKind == JsonValueKind.String)
                {
                    builder.AppendLine(text.GetString());
                }
            }
        }

        return builder.Length == 0 ? null : builder.ToString().Trim();
    }

    private static string NormalizeProvider(string? requestedProvider, string defaultProvider)
        => string.IsNullOrWhiteSpace(requestedProvider)
            ? defaultProvider.Trim().ToLowerInvariant()
            : requestedProvider.Trim().ToLowerInvariant();

    // ─── URL + header builders ────────────────────────────────────────────

    private string BuildOpenAiUrl(string relativePath)
        => $"{_options.OpenAi.BaseUrl.TrimEnd('/')}/{relativePath.TrimStart('/')}";

    private string BuildGitHubUrl(string relativePath)
        => $"{_options.GitHubModels.BaseUrl.TrimEnd('/')}/{relativePath.TrimStart('/')}";

    private string BuildGeminiUrl(string relativePath)
        => $"{_options.Gemini.BaseUrl.TrimEnd('/')}/{relativePath.TrimStart('/')}";

    private void AddOpenAiHeaders(HttpRequestMessage request)
        => request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.OpenAi.ApiKey);

    private void AddGitHubHeaders(HttpRequestMessage request)
    {
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.GitHubModels.Token);
        request.Headers.Accept.ParseAdd("application/vnd.github+json");
        request.Headers.Add("X-GitHub-Api-Version", "2022-11-28");
    }

    private void AddGeminiHeaders(HttpRequestMessage request)
        => request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.Gemini.ApiKey);

    private void AddGroqHeaders(HttpRequestMessage request)
        => request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.Groq.ApiKey);

    // ─── Streaming: public entry point ───────────────────────────────────

    public async IAsyncEnumerable<string> TryGenerateTextStreamAsync(
        string? provider,
        string systemPrompt,
        string userPrompt,
        IReadOnlyList<ConversationMessage>? history = null,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var resolved = ResolveAiProvider(provider);

        if (resolved == "openai" && SupportsOpenAi)
        {
            await foreach (var token in StreamViaOpenAiResponsesAsync(systemPrompt, userPrompt, history, cancellationToken))
                yield return token;
        }
        else if (resolved == "github" && SupportsGitHub)
        {
            await foreach (var token in StreamViaChatCompletionsAsync(
                BuildGitHubUrl("chat/completions"), _options.GitHubModels.ChatModel,
                AddGitHubHeaders, systemPrompt, userPrompt, history, cancellationToken))
                yield return token;
        }
        else if (resolved == "gemini" && SupportsGemini)
        {
            await foreach (var token in StreamViaChatCompletionsAsync(
                BuildGeminiUrl("chat/completions"), _options.Gemini.ChatModel,
                AddGeminiHeaders, systemPrompt, userPrompt, history, cancellationToken))
                yield return token;
        }
    }

    // ─── Streaming: OpenAI Responses API (SSE with response.output_text.delta) ──

    private async IAsyncEnumerable<string> StreamViaOpenAiResponsesAsync(
        string systemPrompt,
        string userPrompt,
        IReadOnlyList<ConversationMessage>? history,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var inputList = new List<object>
        {
            new { role = "system", content = new object[] { new { type = "input_text", text = systemPrompt } } }
        };

        if (history != null)
            foreach (var msg in history)
            {
                var contentType = msg.Role == "assistant" ? "output_text" : "input_text";
                inputList.Add(new { role = msg.Role, content = new object[] { new { type = contentType, text = msg.Content } } });
            }

        inputList.Add(new { role = "user", content = new object[] { new { type = "input_text", text = userPrompt } } });

        var payload = new { model = _options.OpenAi.ChatModel, stream = true, input = inputList };

        using var request = new HttpRequestMessage(HttpMethod.Post, BuildOpenAiUrl("responses"))
        {
            Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json")
        };

        AddOpenAiHeaders(request);

        using var response = await _httpClientFactory.CreateClient()
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("OpenAI streaming failed with status {StatusCode}", response.StatusCode);
            yield break;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream, Encoding.UTF8);

        while (true)
        {
            var line = await reader.ReadLineAsync(cancellationToken);
            if (line is null) break;
            if (string.IsNullOrWhiteSpace(line) || !line.StartsWith("data: ")) continue;

            var data = line["data: ".Length..];
            if (data == "[DONE]") break;

            string? delta = null;
            try
            {
                using var json = JsonDocument.Parse(data);
                if (json.RootElement.TryGetProperty("type", out var eventType)
                    && eventType.GetString() == "response.output_text.delta"
                    && json.RootElement.TryGetProperty("delta", out var deltaEl)
                    && deltaEl.ValueKind == JsonValueKind.String)
                {
                    delta = deltaEl.GetString();
                }
            }
            catch { /* skip malformed SSE events */ }

            if (!string.IsNullOrEmpty(delta))
                yield return delta;
        }
    }

    // ─── Streaming: OpenAI-compatible Chat Completions SSE (GitHub + Gemini) ──

    private async IAsyncEnumerable<string> StreamViaChatCompletionsAsync(
        string url,
        string model,
        Action<HttpRequestMessage> addHeaders,
        string systemPrompt,
        string userPrompt,
        IReadOnlyList<ConversationMessage>? history,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var messages = new List<object> { new { role = "system", content = systemPrompt } };
        if (history != null)
            foreach (var msg in history)
                messages.Add(new { role = msg.Role, content = msg.Content });
        messages.Add(new { role = "user", content = userPrompt });
        var payload = new { model, stream = true, messages };

        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json")
        };

        addHeaders(request);

        using var response = await _httpClientFactory.CreateClient()
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Chat Completions streaming to {Url} failed with {StatusCode}", url, response.StatusCode);
            yield break;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream, Encoding.UTF8);

        while (true)
        {
            var line = await reader.ReadLineAsync(cancellationToken);
            if (line is null) break;
            if (string.IsNullOrWhiteSpace(line) || !line.StartsWith("data: ")) continue;

            var data = line["data: ".Length..];
            if (data == "[DONE]") break;

            string? delta = null;
            try
            {
                using var json = JsonDocument.Parse(data);
                // Chat Completions SSE: choices[0].delta.content
                if (json.RootElement.TryGetProperty("choices", out var choices)
                    && choices.ValueKind == JsonValueKind.Array
                    && choices.GetArrayLength() > 0
                    && choices[0].TryGetProperty("delta", out var deltaObj)
                    && deltaObj.TryGetProperty("content", out var contentEl)
                    && contentEl.ValueKind == JsonValueKind.String)
                {
                    delta = contentEl.GetString();
                }
            }
            catch { /* skip malformed SSE events */ }

            if (!string.IsNullOrEmpty(delta))
                yield return delta;
        }
    }

    private static string GetMimeType(string path)
        => Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".bmp" => "image/bmp",
            ".gif" => "image/gif",
            ".tif" or ".tiff" => "image/tiff",
            ".webm" => "audio/webm",
            ".wav" => "audio/wav",
            ".mp3" => "audio/mpeg",
            _ => "application/octet-stream"
        };

    private static float[] NormalizeVector(float[] vector, int targetLength)
    {
        if (vector.Length == targetLength)
        {
            return vector;
        }

        var normalized = new float[targetLength];
        Array.Copy(vector, normalized, Math.Min(vector.Length, targetLength));
        return normalized;
    }
}
