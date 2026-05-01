using Microsoft.AspNetCore.Mvc;
using SparrowInterviewAI.Api.Models;
using SparrowInterviewAI.Api.Services;

namespace SparrowInterviewAI.Api.Controllers;

[ApiController]
[Route("api/sessions/{sessionId:guid}")]
public class SessionRuntimeController : ControllerBase
{
    private readonly SessionRuntimeService _runtime;

    public SessionRuntimeController(SessionRuntimeService runtime)
    {
        _runtime = runtime;
    }

    [HttpPost("transcript-segments")]
    public async Task<IActionResult> AddTranscript(Guid sessionId, [FromBody] TranscriptSegmentRequest request)
    {
        if (sessionId == Guid.Empty)
        {
            return BadRequest("A valid session id is required.");
        }

        if (string.IsNullOrWhiteSpace(request.TranscriptText))
        {
            return BadRequest("Transcript text is required.");
        }

        var segment = await _runtime.IngestTranscriptAsync(sessionId, request);
        return Ok(segment);
    }

    [HttpPost("generate-answer")]
    public async Task<IActionResult> GenerateAnswer(Guid sessionId, [FromBody] GenerateAnswerRequest request)
    {
        if (sessionId == Guid.Empty)
        {
            return BadRequest("A valid session id is required.");
        }

        var response = await _runtime.GenerateAnswerAsync(sessionId, request);
        return Ok(response);
    }

    [HttpPost("transcribe-audio")]
    [RequestSizeLimit(25_000_000)]
    public async Task<IActionResult> TranscribeAudio(
        Guid sessionId,
        [FromForm] IFormFile audio,
        [FromForm] string language = "en",
        [FromForm] long sequenceNo = 0,
        [FromForm] string sourceType = "microphone_external",
        [FromForm] string? provider = null)
    {
        if (sessionId == Guid.Empty)
        {
            return BadRequest("A valid session id is required.");
        }

        if (audio is null || audio.Length == 0)
        {
            return BadRequest("An audio chunk is required.");
        }

        await using var stream = audio.OpenReadStream();
        var result = await _runtime.TranscribeAudioAsync(
            sessionId,
            stream,
            audio.FileName,
            audio.ContentType,
            language,
            sequenceNo,
            sourceType,
            provider);

        return Ok(result);
    }

    [HttpPost("screen-analysis")]
    [RequestSizeLimit(25_000_000)]
    public async Task<IActionResult> AnalyzeScreen(
        Guid sessionId,
        [FromForm] IFormFile screenshot,
        [FromForm] string captureType = "analyze_screen",
        [FromForm] string? windowTitle = null,
        [FromForm] string? appName = null,
        [FromForm] string? extractedText = null,
        [FromForm] string? promptModifier = null,
        [FromForm] string? ocrProvider = null,
        [FromForm] string? aiProvider = null)
    {
        if (sessionId == Guid.Empty)
        {
            return BadRequest("A valid session id is required.");
        }

        if (screenshot is null || screenshot.Length == 0)
        {
            return BadRequest("A screenshot is required.");
        }

        var capturesDir = Path.Combine(Directory.GetCurrentDirectory(), "uploads", sessionId.ToString(), "screen-captures");
        Directory.CreateDirectory(capturesDir);

        var fileName = $"{DateTime.UtcNow:yyyyMMddHHmmss}_{Path.GetFileName(screenshot.FileName)}";
        var filePath = Path.Combine(capturesDir, fileName);

        await using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await screenshot.CopyToAsync(stream);
        }

        var result = await _runtime.AnalyzeScreenAsync(
            sessionId,
            captureType,
            windowTitle,
            appName,
            filePath,
            extractedText,
            promptModifier,
            ocrProvider,
            aiProvider);

        return Ok(result);
    }

    [HttpPost("notes")]
    public async Task<IActionResult> SaveNote(Guid sessionId, [FromBody] SessionNoteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Content))
        {
            return BadRequest("Note content is required.");
        }

        var note = await _runtime.SaveNoteAsync(sessionId, request);
        return Ok(note);
    }

    [HttpGet("live-state")]
    public async Task<IActionResult> GetLiveState(Guid sessionId)
    {
        var state = await _runtime.GetLiveStateAsync(sessionId);
        return Ok(state);
    }

    [HttpPost("summary")]
    public async Task<IActionResult> GenerateSummary(Guid sessionId, [FromBody] GenerateSummaryRequest? request)
    {
        var summary = await _runtime.GenerateSummaryAsync(sessionId, request?.Provider);
        return Ok(summary);
    }

    [HttpPost("mobile-companion")]
    public async Task<IActionResult> CreateMobileCompanion(Guid sessionId, [FromBody] CreateMobileCompanionRequest request)
    {
        var companion = await _runtime.CreateMobileCompanionAsync(sessionId, request);
        return Ok(companion);
    }
}
