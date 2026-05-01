using Microsoft.AspNetCore.SignalR;

namespace SparrowInterviewAI.Api.Hubs;

public class SessionHub : Hub
{
    public async Task JoinSession(string sessionId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, sessionId);
        await Clients.Caller.SendAsync("SessionJoined", sessionId);
    }

    public async Task LeaveSession(string sessionId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, sessionId);
    }

    public async Task SendTranscriptUpdate(string sessionId, object segment)
    {
        await Clients.Group(sessionId).SendAsync("TranscriptUpdate", segment);
    }

    public async Task SendQuestionDetected(string sessionId, object question)
    {
        await Clients.Group(sessionId).SendAsync("QuestionDetected", question);
    }

    public async Task SendAnswerStream(string sessionId, string chunk)
    {
        await Clients.Group(sessionId).SendAsync("AnswerStream", chunk);
    }

    public async Task SendAnswerComplete(string sessionId, object response)
    {
        await Clients.Group(sessionId).SendAsync("AnswerComplete", response);
    }

    public async Task SendSessionStatusChanged(string sessionId, string status)
    {
        await Clients.Group(sessionId).SendAsync("SessionStatusChanged", status);
    }
}
