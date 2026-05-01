using Microsoft.AspNetCore.SignalR;
using SparrowInterviewAI.Api.Hubs;
using SparrowInterviewAI.Api.Models;

namespace SparrowInterviewAI.Api.Services;

public class SessionBroadcastService
{
    private readonly IHubContext<SessionHub> _hub;

    public SessionBroadcastService(IHubContext<SessionHub> hub)
    {
        _hub = hub;
    }

    public Task BroadcastTranscriptAsync(Guid sessionId, TranscriptSegment segment)
    {
        return _hub.Clients.Group(sessionId.ToString()).SendAsync("TranscriptUpdate", segment);
    }

    public Task BroadcastQuestionAsync(Guid sessionId, DetectedQuestion question)
    {
        return _hub.Clients.Group(sessionId.ToString()).SendAsync("QuestionDetected", question);
    }

    public Task BroadcastStatusAsync(Guid sessionId, string status)
    {
        return _hub.Clients.Group(sessionId.ToString()).SendAsync("SessionStatusChanged", status);
    }

    public async Task BroadcastAnswerStreamTokenAsync(Guid sessionId, string token)
    {
        await _hub.Clients.Group(sessionId.ToString()).SendAsync("AnswerStream", token);
    }

    public async Task BroadcastAnswerAsync(Guid sessionId, AiResponse response)
    {
        await _hub.Clients.Group(sessionId.ToString()).SendAsync("AnswerComplete", response);
    }

    public Task BroadcastLiveStateAsync(Guid sessionId, SessionLiveState state)
    {
        return _hub.Clients.Group(sessionId.ToString()).SendAsync("LiveStateUpdated", state);
    }

    public Task BroadcastScreenCaptureAsync(Guid sessionId, string base64Thumbnail)
    {
        return _hub.Clients.Group(sessionId.ToString()).SendAsync("ScreenCaptureShared", base64Thumbnail);
    }
}
