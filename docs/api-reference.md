# SparrowInterviewAI – API Reference

Base URL: `http://localhost:5082` (dev) or your production host.

All endpoints accept and return JSON unless noted. Authenticated endpoints accept a `Bearer` token in the `Authorization` header (base64-encoded user ID).

---

## Users

### POST /api/users

Create a new user and receive an auth token.

**Body:**

```json
{
  "fullName": "Jane Developer",
  "email": "jane@example.com",
  "language": "en",
  "targetRole": "Senior Backend Engineer",
  "companyName": "Acme Corp",
  "jobDescription": "...",
  "customInstructions": "..."
}
```

**Response:** `201 Created`

```json
{
  "id": "uuid",
  "fullName": "Jane Developer",
  "preferredLanguage": "en",
  "createdAt": "2026-01-01T00:00:00Z",
  "token": "base64-token"
}
```

### GET /api/users/{id}

Get user by ID.

### GET /api/users/{id}/profile

Get user profile (target role, company, job description, custom instructions).

### GET /api/users/{id}/settings

Get all stored app settings for a user (key-value pairs as JSON).

### PUT /api/users/{id}/settings/{settingKey}

Upsert a single setting. Body is the raw JSON value.

### GET /api/users/{id}/hotkeys

Get hotkey bindings for a user.

### PUT /api/users/{id}/hotkeys

Upsert all hotkey bindings.

**Body:**

```json
[
  {
    "actionName": "Generate Answer",
    "keyCombo": "Ctrl + Enter",
    "isEnabled": true
  }
]
```

---

## Documents

### POST /api/documents/upload

Upload a document (multipart/form-data).

**Form fields:** `userId`, `documentType` (`resume` | `supporting`), `file`.

### GET /api/documents/user/{userId}

List documents for a user.

---

## Sessions

### POST /api/sessions

Start a new interview session. Auth token validated against `userId`.

**Body:**

```json
{
  "userId": "uuid",
  "title": "Live Interview Session",
  "sourceApp": "desktop",
  "sessionMode": "live",
  "language": "en"
}
```

### GET /api/sessions/{id}

Get session details. Auth token validated.

### GET /api/sessions/user/{userId}

List sessions for a user. Auth token validated.

### POST /api/sessions/{id}/end

End an active session.

### POST /api/sessions/{id}/pause

Pause a session.

### POST /api/sessions/{id}/resume

Resume a paused session.

### GET /api/sessions/{id}/transcript

Get all transcript segments for a session.

---

## Session Runtime

### POST /api/sessions/{sessionId}/transcript-segments

Submit a transcript segment.

**Body:**

```json
{
  "transcriptText": "Tell me about yourself.",
  "sourceType": "microphone",
  "sequenceNo": 1,
  "isPartial": false
}
```

Source types: `mic`, `microphone`, `microphone_external`, `system_audio`, `manual`.

### POST /api/sessions/{sessionId}/generate-answer

Generate an AI answer. Streams tokens via SignalR `AnswerStream` events, then sends `AnswerComplete`.

**Body:**

```json
{
  "questionText": "Tell me about a leadership challenge.",
  "promptModifier": "Keep it concise",
  "responseType": "manual",
  "provider": "openai"
}
```

### POST /api/sessions/{sessionId}/screen-analysis

Submit a screen capture for OCR + AI analysis (multipart/form-data).

**Form fields:** `screenshot`, `captureType`, `windowTitle`, `appName`, `extractedText`, `promptModifier`, `ocrProvider`, `aiProvider`.

### POST /api/sessions/{sessionId}/transcribe-audio

Transcribe an audio chunk via OpenAI Whisper (multipart/form-data).

**Form fields:** `audio`, `language`, `sequenceNo`, `sourceType`, `provider`.

### POST /api/sessions/{sessionId}/notes

Add a session note.

**Body:**

```json
{
  "noteType": "session_note",
  "content": "Interviewer focused on system design questions."
}
```

### POST /api/sessions/{sessionId}/summary

Generate a session summary with all questions, answers, weak areas, and action items.

**Body:**

```json
{
  "provider": "openai"
}
```

### GET /api/sessions/{sessionId}/live-state

Get the full live state: status, latest question, latest response, recent transcript, notes, summary.

### POST /api/sessions/{sessionId}/mobile-companion

Create a mobile companion link.

**Body:**

```json
{
  "deviceName": "Phone Browser",
  "deviceType": "mobile-web"
}
```

---

## Mobile Companion

### GET /api/mobile/{token}

Get current live session state for a mobile companion token.

---

## SignalR Hub

**Endpoint:** `/hubs/session`

### Client → Server

| Method         | Parameters  | Description                                |
| -------------- | ----------- | ------------------------------------------ |
| `JoinSession`  | `sessionId` | Join a session group for real-time updates |
| `LeaveSession` | `sessionId` | Leave a session group                      |

### Server → Client

| Event                  | Payload                    | Description                                       |
| ---------------------- | -------------------------- | ------------------------------------------------- |
| `TranscriptUpdate`     | `TranscriptSegment`        | New or updated transcript segment                 |
| `QuestionDetected`     | `DetectedQuestion`         | Newly detected interview question                 |
| `AnswerStream`         | `string` (token)           | Single token from streaming AI answer             |
| `AnswerComplete`       | `AiResponse`               | Complete AI answer after streaming finishes       |
| `SessionStatusChanged` | `string` (status)          | Session status change (active, paused, completed) |
| `LiveStateUpdated`     | `SessionLiveState`         | Full state refresh                                |
| `ScreenCaptureShared`  | `string` (base64 data URL) | Screen capture thumbnail for mobile companion     |
