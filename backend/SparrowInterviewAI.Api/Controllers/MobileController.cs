using Microsoft.AspNetCore.Mvc;
using SparrowInterviewAI.Api.Services;

namespace SparrowInterviewAI.Api.Controllers;

[ApiController]
[Route("api/mobile")]
public class MobileController : ControllerBase
{
    private readonly SessionRuntimeService _runtime;

    public MobileController(SessionRuntimeService runtime)
    {
        _runtime = runtime;
    }

    [HttpGet("{token}")]
    public async Task<IActionResult> GetState(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return BadRequest("A valid mobile token is required.");
        }

        var state = await _runtime.GetMobileStateAsync(token);
        return state is null ? NotFound() : Ok(state);
    }
}
