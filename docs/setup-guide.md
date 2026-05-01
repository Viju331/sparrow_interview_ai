# SparrowInterviewAI – Setup Guide

## Prerequisites

| Tool        | Version                     |
| ----------- | --------------------------- |
| .NET SDK    | 10.0+                       |
| Node.js     | 20 LTS+                     |
| PostgreSQL  | 16+ with pgvector extension |
| Angular CLI | 19+                         |

## 1. Database

Create a PostgreSQL database and enable the pgvector extension:

```sql
CREATE DATABASE sparrow_interview_ai;
```

Database migrations run automatically on API startup via DbUp. The SQL scripts in `database/postgresql/` are applied in order (`000_enable_extensions.sql`, `001_initial_schema.sql`, `002_seed_data.sql`).

## 2. Backend API

```bash
cd backend/SparrowInterviewAI.Api
```

Set the connection string in `appsettings.Development.json`:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=sparrow_interview_ai;Username=postgres;Password=YOUR_PASSWORD"
  }
}
```

Configure provider keys via environment variables or `appsettings.Development.json`:

```json
{
  "Providers": {
    "OpenAiApiKey": "sk-...",
    "OpenAiModel": "gpt-4o",
    "DefaultAiProvider": "openai",
    "DefaultTranscriptionProvider": "browser-speech",
    "DefaultOcrProvider": "local"
  }
}
```

Run:

```bash
dotnet run
```

The API starts on `https://localhost:7100` (HTTPS) and `http://localhost:5100` (HTTP).

## 3. Desktop App (Angular + Electron)

```bash
cd desktop
npm install
```

### Development (browser)

```bash
npx ng serve
```

Open `http://localhost:4200`.

### Development (Electron)

```bash
npx ng build
npx electron electron/main.js
```

### Production build

```bash
npm run build     # Angular production build
npm run dist      # electron-builder package
```

Output goes to `desktop/release/`.

## 4. Mobile Companion

The mobile companion connects via SignalR using a session connection token. Open the companion URL shown on the desktop Mobile tab in a phone browser on the same network.

## 5. Environment Variables

| Variable                 | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `OPENAI_API_KEY`         | OpenAI API key (overrides appsettings)               |
| `ASPNETCORE_ENVIRONMENT` | `Development` or `Production`                        |
| `DATABASE_URL`           | PostgreSQL connection string (overrides appsettings) |

## 6. Verify

1. Start the API – migrations run automatically, console shows DbUp output.
2. Start the desktop app – navigate to Onboarding, create a user.
3. Upload a resume, start a session, and verify transcription and AI answers work.
