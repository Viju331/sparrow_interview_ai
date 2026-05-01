using Microsoft.AspNetCore.Mvc;
using SparrowInterviewAI.Api.Models;
using SparrowInterviewAI.Api.Repositories;
using SparrowInterviewAI.Api.Services;

namespace SparrowInterviewAI.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SessionsController : ControllerBase
{
    private readonly SessionRepository _sessions;
    private readonly SessionAuthService _auth;

    public SessionsController(SessionRepository sessions, SessionAuthService auth)
    {
        _sessions = sessions;
        _auth = auth;
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var session = await _sessions.GetByIdAsync(id);
        if (session is null) return NotFound();

        if (!ValidateOwnership(session.UserId))
            return Forbid();

        return Ok(session);
    }

    [HttpGet("user/{userId:guid}")]
    public async Task<IActionResult> GetByUser(Guid userId)
    {
        if (!ValidateOwnership(userId))
            return Forbid();

        var sessions = await _sessions.GetByUserAsync(userId);
        return Ok(sessions);
    }

    [HttpPost]
    public async Task<IActionResult> Start([FromBody] CreateSessionRequest request)
    {
        if (request.UserId == Guid.Empty)
            return BadRequest("A valid userId is required.");

        if (!ValidateOwnership(request.UserId))
            return Forbid();

        var session = await _sessions.StartSessionAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = session.Id }, session);
    }

    [HttpPost("{id:guid}/end")]
    public async Task<IActionResult> End(Guid id)
    {
        if (id == Guid.Empty)
            return BadRequest("A valid session id is required.");

        await _sessions.EndSessionAsync(id);
        return NoContent();
    }

    [HttpPost("{id:guid}/pause")]
    public async Task<IActionResult> Pause(Guid id)
    {
        if (id == Guid.Empty)
            return BadRequest("A valid session id is required.");

        await _sessions.UpdateStatusAsync(id, "paused");
        return NoContent();
    }

    [HttpPost("{id:guid}/resume")]
    public async Task<IActionResult> Resume(Guid id)
    {
        if (id == Guid.Empty)
            return BadRequest("A valid session id is required.");

        await _sessions.UpdateStatusAsync(id, "active");
        return NoContent();
    }

    [HttpGet("{id:guid}/transcript")]
    public async Task<IActionResult> GetTranscript(Guid id)
    {
        var segments = await _sessions.GetTranscriptAsync(id);
        return Ok(segments);
    }

    private bool ValidateOwnership(Guid userId)
    {
        var token = Request.Headers.Authorization.FirstOrDefault()?.Replace("Bearer ", "");
        if (string.IsNullOrWhiteSpace(token))
            return true; // Allow access when no token is provided (backward compat / dev mode)

        var resolvedUserId = SessionAuthService.ResolveUserId(token);
        return resolvedUserId is null || resolvedUserId == userId;
    }
}
