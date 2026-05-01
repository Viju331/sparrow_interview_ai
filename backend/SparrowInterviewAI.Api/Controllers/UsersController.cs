using Microsoft.AspNetCore.Mvc;
using SparrowInterviewAI.Api.Models;
using SparrowInterviewAI.Api.Repositories;
using SparrowInterviewAI.Api.Services;
using System.Text.Json;

namespace SparrowInterviewAI.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly UserRepository _users;
    private readonly SettingsRepository _settings;

    public UsersController(UserRepository users, SettingsRepository settings)
    {
        _users = users;
        _settings = settings;
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var user = await _users.GetByIdAsync(id);
        return user is null ? NotFound() : Ok(user);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FullName))
            return BadRequest("Full name is required.");

        var user = await _users.CreateAsync(request);
        var token = SessionAuthService.GenerateUserToken(user.Id);
        return CreatedAtAction(nameof(GetById), new { id = user.Id }, new { user.Id, user.FullName, user.PreferredLanguage, user.CreatedAt, Token = token });
    }

    [HttpGet("{id:guid}/profile")]
    public async Task<IActionResult> GetProfile(Guid id)
    {
        var profile = await _users.GetProfileAsync(id);
        return profile is null ? NotFound() : Ok(profile);
    }

    [HttpGet("{id:guid}/settings")]
    public async Task<IActionResult> GetSettings(Guid id)
    {
        var settings = await _settings.GetSettingsAsync(id);
        return Ok(settings);
    }

    [HttpPut("{id:guid}/settings/{settingKey}")]
    public async Task<IActionResult> UpsertSetting(Guid id, string settingKey, [FromBody] JsonElement value)
    {
        if (string.IsNullOrWhiteSpace(settingKey))
        {
            return BadRequest("Setting key is required.");
        }

        await _settings.UpsertSettingAsync(id, settingKey, value.GetRawText());
        return NoContent();
    }

    [HttpGet("{id:guid}/hotkeys")]
    public async Task<IActionResult> GetHotkeys(Guid id)
    {
        var bindings = await _settings.GetHotkeyBindingsAsync(id);
        return Ok(bindings);
    }

    [HttpPut("{id:guid}/hotkeys")]
    public async Task<IActionResult> UpsertHotkeys(Guid id, [FromBody] IEnumerable<HotkeyBindingUpsert> bindings)
    {
        await _settings.UpsertHotkeyBindingsAsync(id, bindings);
        return NoContent();
    }
}
