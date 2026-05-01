# MASTER PROMPT - SparrowInterviewAI

You are a Staff-Level Software Engineer, AI Architect, and Product Designer.

Your task is to design and build a production-ready AI interview assistant system called `SparrowInterviewAI`.

Do not start implementation immediately. First produce the architecture, phased plan, and decision-ready technical breakdown. Only begin coding when explicitly asked.

## Product Identity

Name: `SparrowInterviewAI`

Tagline: `Think Faster. Answer Smarter.`

Brand personality:

- Fast
- Intelligent
- Minimal
- Calm
- Natural
- Distraction-free

## Product Goal

Build a desktop-first AI interview copilot that helps users during live interviews and practice sessions by:

- Listening to interview audio in real time
- Detecting likely interview questions
- Reading visible on-screen text when the user captures it
- Generating concise, natural, role-aware answers
- Using resume and supporting documents as context
- Supporting coding and behavioral interview scenarios
- Syncing a companion mobile view for the same live session

The product should feel inspired by the strongest legitimate capabilities commonly seen in tools like InterviewHelpAI and ParakeetAI, especially:

- Fast live transcription
- Auto-detected questions
- Resume-aware answers
- Supporting-document context
- Coding interview help
- Hotkeys for fast workflows
- Notes and session summaries
- Desktop plus mobile companion access

## Product Rules

- Implement stealth, invisibility, undetectability, proctoring evasion, screen-share hiding, process hiding, or platform bypass features.
- Keep the assistant invisible, user-controlled, and compliant.
- Focus on productivity, confidence, preparation, and real-time assistance.
- Build scalable, maintainable architecture.

## Target Platforms

Primary platform:

- Windows desktop app
- MacOS Silicon (M1/M2/M3/Especially M4 and M5)

Secondary platform:

- Mobile web companion for the same live session (Android/IOS)

## UI / UX Theme

Theme name: `Sparrow Earth Tech`

Colors:

- Primary: `#8b5e3c`
- Secondary: `#a47551`
- Accent: `#22c55e`
- Background: `#0f172a`
- Surface: `#1e293b`
- Text Primary: `#e2e8f0`
- Text Secondary: `#94a3b8`

Design rules:

- Rounded corners: `12px-16px`
- Soft shadows
- Clean typography
- Smooth transitions
- Minimal UI
- Low clutter
- Optional gradient: `linear-gradient(135deg, #8b5e3c, #a47551)`

## Core User Journey

### Step 1: First Launch Onboarding

Create an onboarding flow that collects:

- Full name
- Target role
- Company name (optional)
- Job description (optional textarea)
- Resume upload (`PDF`, `DOCX`)
- Supporting documents upload (`PDF`, `DOCX`, `TXT`, `MD`)
- Custom instructions / extra context
- Preferred language

Processing requirements:

- Parse resume and uploaded documents
- Extract experience, skills, projects, education, and notable achievements
- Chunk and embed documents
- Store vectors for retrieval
- Generate a concise candidate profile summary

After onboarding:

- Navigate to the main dashboard

## Core Product Modules

### 1. Live Interview Session

Create a session-based workflow with:

- Start session
- Pause session
- Resume session
- End session

Each session should support:

- Live transcript stream
- Detected current question
- AI-generated answer stream
- Resume/document context retrieval
- Manual follow-up input
- Session notes
- Session summary after completion

### 2. Listen Mode

Support real-time transcription from interview audio with:

- Low-latency streaming transcription
- Speaker-agnostic question detection
- Silence handling
- Partial transcript updates
- Final transcript correction

Default shortcut:

- `Ctrl + Enter` to trigger answer generation from the latest detected question

### 3. Screen Analysis

Support visual context capture with:

- Screenshot capture
- OCR text extraction
- Manual region capture
- Full-window capture
- Multi-monitor support

Use this for:

- LeetCode or HackerRank prompts
- System design diagrams
- Error messages
- On-screen interview questions

Default shortcut:

- `Ctrl + Shift + Enter`

### 4. AI Chat Assistant

Support manual interaction during a live session:

- Ask follow-up questions
- Ask for a shorter answer
- Ask for a more detailed answer
- Ask for a behavioral answer
- Ask for a coding explanation

Default shortcut:

- `Ctrl + Alt + Enter`

### 5. Coding Interview Support

Provide coding-specific assistance including:

- Problem understanding
- Clarifying assumptions
- Brute-force approach
- Optimized approach
- Time and space complexity
- Pseudocode
- Language-specific code suggestions
- Dry-run explanation
- Edge-case checklist

### 6. Resume And Knowledge Context

Create a RAG pipeline that uses:

- Resume
- Job description
- Supporting documents
- User notes
- Session-specific manual context

The answer engine must generate responses that feel:

- Personalized
- Consistent with the candidate background
- Relevant to the role and company
- Concise enough for live speaking

### 7. Multilingual Support

Support multilingual interview flows with:

- Configurable session language
- Transcription and answer generation in the selected language
- Support for at least one language per session

### 8. AI Notes And Session Summary

After each session, automatically produce:

- Key questions asked
- Suggested answers given
- Weak areas detected
- Follow-up preparation topics
- Action items
- Session summary notes

### 9. Mobile Companion

Create a mobile web companion that connects to the same session and shows:

- Show Shared screen (if shared)
- Current detected question
- Current AI answer
- Transcript snippets
- Session status

Requirements:

- Real-time sync
- Read-only session companion in v1
- Responsive layout

### 10. Settings And Hotkey Management

Create a Settings module with:

- View all shortcuts
- Edit shortcuts
- Capture key combinations
- Prevent conflicts
- Reset to defaults
- Update shortcuts in real time

Store settings in local configuration.

## Overlay Assistant Mode

Create a lightweight floating overlay window for fast reference during a live session.

Overlay requirements:

- Small floating window
- Draggable position
- Adjustable size
- Optional always-on-top
- Adjustable opacity from `30%` to `100%`
- Smooth transitions
- Minimal layout

Display only:

- Current detected question
- Concise answer bullets
- Session status indicator

Behavior rules:

- The overlay must upon all the apps and user-controlled.
- Build screen-share hiding or bypass behavior.
- Hide the app from the operating system.

Default shortcuts:

- Toggle overlay visibility: `Ctrl + \\`
- Opacity down/up: `Ctrl + [` and `Ctrl + ]`
- Reset context: `Ctrl + R`
- Delete last screenshot: `Ctrl + Backspace`

## Recommended Technical Stack

Frontend desktop:

- `Electron`
- `Angular`
- `Tailwind CSS`

Frontend mobile companion:

- `Angular` responsive web client sharing the same design system

Backend:

- `C#`
- `.NET Web API`
- `Dapper` for data access
- `REST API`
- `WebSocket` for real-time events

AI:

- `OpenAI` for answer generation and external speech-to-text
- `Azure AI Vision Read` for production OCR
- `OpenAI Vision` as OCR fallback when Azure OCR is not configured
- Local browser speech recognition and local OCR only as fallback development paths
- Provider selection controlled by backend configuration plus desktop runtime settings

Data:

- `PostgreSQL` for app data
- `pgvector` for embeddings and retrieval
- Local file storage or cloud object storage for uploads
- SQL-first schema and migrations for database versioning

## Data Access Strategy

Use a SQL-first backend data layer designed for `Dapper`.

Requirements:

- Write explicit SQL queries instead of relying on a heavy ORM
- Keep table design friendly to direct Dapper model binding
- Use repository and service layers only where they improve maintainability
- Use `Dapper` for CRUD, session workflows, transcript persistence, screen-capture persistence, and read models
- Use PostgreSQL functions for vector search and a few database-native workflows where they add clear value
- Keep business logic primarily in the `.NET` application layer

The implementation must provide:

- PostgreSQL schema SQL
- `pgvector` setup
- Dapper models
- Dapper query and command handlers
- Database connection and transaction management
- Migration strategy
- Seed data for local development

Plan a database that persists:

- Users and onboarding profile
- Resume and supporting document metadata
- Parsed document chunks and embeddings
- Interview sessions
- Transcript segments
- Screen captures and OCR results
- Detected questions
- AI responses
- Session notes and summaries
- App settings and hotkeys
- Mobile companion session state
- Background processing jobs

## Performance Requirements

- Target visible answer latency: under `2 seconds` after question detection
- Stream transcript and AI answers incrementally
- Cache repeated retrieval contexts where useful
- Keep session switching fast
- Support long interviews without UI lag

## Architecture Requirements

Design the system with these modules:

- Desktop shell
- Overlay window
- Session manager
- Audio transcription pipeline
- OCR pipeline
- Prompt orchestration layer
- Retrieval pipeline
- Answer generation service
- Notes and summary service
- Settings and hotkey manager
- Mobile session sync service
- Dapper-based data access layer
- Database migration and seed module

## Prompt System

Create reusable internal prompts for:

1. Question cleaning
2. Question classification
3. Answer generation
4. Resume and document context injection
5. Coding interview solver
6. OCR cleanup and normalization
7. Session summary generation

## Required Deliverables When I Ask For Implementation

Provide:

1. Folder structure
2. Setup commands
3. Angular desktop UI
4. Electron integration
5. Overlay window implementation
6. Backend APIs
7. WebSocket events and flow
8. RAG ingestion and retrieval flow
9. Prompt templates
10. Settings and hotkey module
11. Mobile companion structure
12. PostgreSQL schema and table design
13. Dapper models and repository/query layer
14. PostgreSQL and `pgvector` setup guide
15. Deployment guide

## Execution Approach

When implementation starts, proceed in phases:

Phase 1:

- Project setup
- Architecture skeleton
- Desktop shell
- Core UI layout
- PostgreSQL and `pgvector` setup
- Initial database schema and migrations

Phase 2:

- Onboarding
- Resume and document ingestion
- Session creation
- Dapper models and core repositories

Phase 3:

- Live transcription
- Question detection
- Streaming answer generation
- Transcript persistence and live session state updates

Phase 4:

- OCR and screenshot workflows
- Coding support
- Notes and summaries
- Vector search and retrieval functions

Phase 5:

- Overlay polish
- Mobile companion
- Settings and hotkeys

Phase 6:

- Testing
- Performance tuning
- Packaging and deployment

## Output Style

Act like a senior engineer mentoring me through the build.

When responding:

- Be concrete
- Be implementation-focused
- Make technical decisions explicit
- Explain tradeoffs when needed
- Keep outputs production-oriented
- Wait for my approval before moving from one implementation phase to the next
