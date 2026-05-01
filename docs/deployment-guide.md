# SparrowInterviewAI – Deployment Guide

## Architecture Overview

```
┌──────────────────┐      ┌───────────────────┐      ┌─────────────┐
│  Electron Desktop │─────▶│  .NET 10 API      │─────▶│ PostgreSQL  │
│  (Angular 19)     │      │  + SignalR Hub     │      │ + pgvector  │
└──────────────────┘      └───────────────────┘      └─────────────┘
         ▲                        │
         │                        ▼
┌──────────────────┐      ┌───────────────────┐
│  Mobile Companion │      │  OpenAI API       │
│  (Browser)        │      │  (GPT-4o / Whisper│
└──────────────────┘      └───────────────────┘
```

## Production Configuration

### Backend

1. Set `ASPNETCORE_ENVIRONMENT=Production`.
2. Configure `appsettings.Production.json` or environment variables:

| Setting                                | Description                  |
| -------------------------------------- | ---------------------------- |
| `ConnectionStrings__DefaultConnection` | PostgreSQL connection string |
| `Providers__OpenAiApiKey`              | OpenAI API key               |
| `Cors__AllowedOrigins__0`              | Allowed CORS origin          |

3. Publish:

```bash
cd backend/SparrowInterviewAI.Api
dotnet publish -c Release -o ./publish
```

4. Run behind a reverse proxy (nginx, Caddy) with HTTPS termination.

### Database

- Use PostgreSQL 16+ with `pg_trgm`, `pgcrypto`, and `vector` extensions.
- Migrations are applied automatically on API startup via DbUp.
- Back up the database before deploying new migration scripts.

### Desktop Packaging

electron-builder is configured in `desktop/package.json`:

```bash
cd desktop
npm run dist
```

Produces:

- **Windows:** NSIS installer (`.exe`)
- **macOS:** DMG (`-mac` flag, requires macOS)
- **Linux:** AppImage (`-linux` flag)

macOS builds use `build/entitlements.mac.plist` for microphone, camera, and JIT permissions.

### CORS

The production config allows origins defined in `appsettings.Production.json` → `Cors.AllowedOrigins`. Update these to match your deployment domain.

## Security Checklist

- [ ] Set a strong PostgreSQL password; do not use the default.
- [ ] Store `OpenAiApiKey` in environment variables, not in committed config files.
- [ ] Run the API behind HTTPS (TLS 1.2+).
- [ ] Restrict CORS origins to your desktop app's actual domain.
- [ ] Review auth tokens: the current lightweight token system is suitable for local/single-user use. For multi-user production, integrate a proper identity provider.

## Monitoring

Set `Logging.LogLevel.Default` to `Information` for initial deployment, then reduce to `Warning` once stable.

## Updating

1. Pull latest code.
2. Run `dotnet publish -c Release` for the backend.
3. Run `npm run dist` for the desktop app.
4. DbUp automatically applies any new SQL migration scripts on startup.
