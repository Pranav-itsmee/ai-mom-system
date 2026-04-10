# AI MOM System — Project Detail

Complete technical reference for the AI Minutes of Meeting (MOM) System.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Full Pipeline Flow](#2-full-pipeline-flow)
3. [Project Structure](#3-project-structure)
4. [Database Schema](#4-database-schema)
5. [Backend API Reference](#5-backend-api-reference)
6. [Frontend Structure](#6-frontend-structure)
7. [AI Prompts & MOM Format](#7-ai-prompts--mom-format)
8. [Bot Behavior](#8-bot-behavior)
9. [Environment Variables](#9-environment-variables)
10. [Setup & Installation](#10-setup--installation)
11. [Key Constraints & Decisions](#11-key-constraints--decisions)

---

## 1. Architecture Overview

```
Google Calendar API
       ↓  (poll every 30s)
Scheduler detects meeting ±30s window
       ↓
Puppeteer Bot joins Google Meet (2 min before start)
       ↓  (MediaRecorder → .webm chunks)
FFmpeg converts .webm → .mp3 (mono, 16kHz, 128kbps)
       ↓
OpenAI Whisper transcribes + detects language
       ↓
Claude API generates structured MOM JSON
       ↓
MySQL (meetings, moms, mom_key_points, tasks, meeting_attendees)
       ↓
Next.js frontend (view, edit, search, export)
```

**Key architectural decisions:**
- Audio transcription via OpenAI Whisper (`whisper-1`, `verbose_json`) — not Claude (Claude doesn't support audio input)
- Claude receives text transcript only; outputs structured JSON
- No Google Drive intermediate storage — audio goes directly to Whisper
- No user file uploads — all recordings come from the bot exclusively
- `sequelize.sync()` only, never `sync({alter:true})` — causes MySQL "too many keys" error

---

## 2. Full Pipeline Flow

### A. Meeting Detection (every 30 seconds)

`scheduler.service.js` polls `calendar.service.js` which queries the Google Calendar API for events with a Google Meet link starting within the next ±30 seconds. If found and not already tracked, it creates a `meetings` row with `status: scheduled`.

### B. Bot Joins

`meetBot.js` launches a Puppeteer browser with:
- `--use-fake-device-for-media-stream` (silent — no real mic/camera)
- `getUserMedia` overridden to return silent/blank streams
- `headless: 'new'` for invisible mode

The bot navigates to the Meet link, dismisses pre-join dialogs, and waits in the lobby. It does **not** auto-admit itself — admission requires `POST /meetings/:id/admit`.

Once admitted, `recorder.js` starts a `MediaRecorder` inside the page context capturing combined audio (all participants). Chunks are written to a `.webm` file in `TEMP_DIR`.

Meeting end is detected via:
1. `MutationObserver` watching for the end-call overlay (fastest)
2. `page.on('framenavigated')` when Meet redirects away
3. 3-second polling fallback on `document.readyState`

### C. Audio Conversion

`ffmpeg.service.js` converts the `.webm` to mono 16kHz 128kbps MP3 using `fluent-ffmpeg`. The `.webm` is deleted after successful conversion.

### D. Transcription

`claude.service.js → transcribeAudio()` sends the MP3 to OpenAI Whisper with `response_format: verbose_json` which returns the transcript text and a `language` ISO code (`en`, `ja`, etc.).

### E. Language Detection

```
whisperLang === 'ja'  → japanese
/[\u3040-\u30ff\u4e00-\u9fef]/.test(transcript)  → japanese (fallback)
else → english
```

### F. MOM Generation (Claude)

`callClaudeWithTranscript()` sends the transcript with a language-appropriate system prompt to `claude-sonnet-4-6`. Claude returns a JSON object with:
- `participants`, `agenda`, `key_discussion_points`, `decisions`
- `action_items[]` — each with `title`, `description`, `assigned_to`, `deadline`, `priority`
- `summary`

Japanese meetings produce dual-language output: `{ japanese: {...}, english: {...} }`.

### G. Parsing & Normalization

`mom.parser.js` strips markdown fences, parses JSON, validates structure, and returns the raw Claude object.

`normalizeForDB()` in `claude.service.js` converts it to the DB format:
- Key points prefixed: `[Agenda]`, `[Discussion]`, `[Decision]` (JP: `[議題]`, `[議論]`, `[決定]`)
- Japanese meetings get both JP + EN key points concatenated
- `action_items` → `Task` records with `status: pending`

### H. Persistence

`persistMOM()` runs inside a Sequelize transaction:
1. `findOrCreate` on `moms` table
2. Destroys + re-creates all `mom_key_points`
3. Creates `tasks` linked to the MOM
4. Upserts new attendees in `meeting_attendees`
5. Updates `meetings.status` → `completed`

---

## 3. Project Structure

```
ai-mom-system/
├── README.md
├── PROJECTDETAIL.md
├── CLAUDE.md                          # AI assistant instructions
│
├── backend/
│   ├── src/
│   │   ├── server.js                  # Entry — DB auth + sync + HTTP listen
│   │   ├── app.js                     # Express app — middleware + routes
│   │   ├── config/
│   │   │   ├── db.js                  # Sequelize instance
│   │   │   └── googleAuth.js          # Google OAuth2 client (with token refresh)
│   │   ├── models/
│   │   │   ├── index.js               # All models + associations
│   │   │   ├── User.js
│   │   │   ├── Meeting.js
│   │   │   ├── MOM.js
│   │   │   ├── MOMKeyPoint.js
│   │   │   ├── Task.js
│   │   │   └── MeetingAttendee.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── meeting.routes.js      # includes /admit and /waiting
│   │   │   ├── mom.routes.js          # /search and /id/:id before /:meetingId
│   │   │   └── task.routes.js
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── meeting.controller.js
│   │   │   ├── mom.controller.js
│   │   │   └── task.controller.js
│   │   ├── services/
│   │   │   ├── claude.service.js      # Whisper + Claude MOM pipeline
│   │   │   ├── calendar.service.js    # Google Calendar sync
│   │   │   ├── scheduler.service.js   # 30s polling, triggers bot
│   │   │   ├── ffmpeg.service.js      # WebM → MP3
│   │   │   └── mom.parser.js          # Parse + validate Claude JSON
│   │   ├── bot/
│   │   │   ├── meetBot.js             # Puppeteer bot — join, record, monitor
│   │   │   └── recorder.js            # In-page MediaRecorder + chunk writes
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js     # JWT validation
│   │   │   └── errorHandler.js        # Global error handler
│   │   └── utils/
│   │       ├── fileManager.js         # Temp file cleanup
│   │       └── logger.js              # Winston (console + file)
│   ├── scripts/
│   │   └── get-refresh-token.js       # One-time OAuth2 token helper
│   ├── temp/                          # Temp .webm / .mp3 files (gitignored)
│   ├── logs/                          # Winston logs (gitignored)
│   ├── .env
│   └── package.json
│
└── frontend/
    ├── app/
    │   ├── layout.tsx                 # Root layout (Outfit font, Providers)
    │   ├── providers.tsx              # Redux + i18n + ThemeSync
    │   ├── globals.css                # CSS variables, design tokens, utility classes
    │   ├── login/page.tsx
    │   ├── meetings/
    │   │   ├── page.tsx               # Meeting list — stat cards + table
    │   │   └── [id]/page.tsx          # Meeting detail — banners + MOM preview
    │   ├── mom/[id]/
    │   │   ├── page.tsx               # MOM view — 2-column (content + tasks)
    │   │   └── edit/page.tsx          # MOM editor — drag-drop key points
    │   ├── tasks/page.tsx
    │   ├── calendar/page.tsx
    │   └── settings/page.tsx
    ├── components/
    │   ├── layout/
    │   │   ├── Sidebar.tsx            # 240px/70px collapsible nav
    │   │   ├── Topbar.tsx             # Language select + theme + bell + user
    │   │   └── ProtectedLayout.tsx    # Auth guard + layout shell
    │   ├── meetings/
    │   │   ├── MeetingCard.tsx
    │   │   ├── MeetingStatusBadge.tsx
    │   │   └── AdmitButton.tsx
    │   ├── mom/
    │   │   ├── MOMViewer.tsx          # Summary + key points + transcript
    │   │   └── MOMEditor.tsx          # Edit summary + drag-drop reorder
    │   ├── tasks/
    │   │   ├── TaskCard.tsx
    │   │   └── TaskEditor.tsx
    │   └── ui/
    │       ├── ExportButton.tsx
    │       ├── Toast.tsx
    │       └── UserMenu.tsx
    ├── store/
    │   ├── index.ts
    │   └── slices/
    │       ├── authSlice.ts
    │       ├── uiSlice.ts
    │       ├── meetingSlice.ts
    │       ├── momSlice.ts
    │       └── taskSlice.ts
    ├── i18n/
    │   ├── en.json
    │   ├── ja.json
    │   └── index.ts
    ├── hooks/
    │   ├── useWebSocket.ts
    │   └── useTheme.ts
    ├── services/api.ts                # Axios + JWT interceptor + 401 redirect
    ├── tailwind.config.ts
    ├── .env.local
    └── package.json
```

---

## 4. Database Schema

### ERD

```
users ──────────────< meetings (organizer_id)
meetings ───────────  moms (1:1, meeting_id UNIQUE)
moms ───────────────< mom_key_points (mom_id)
moms ───────────────< tasks (mom_id)
meetings ───────────< meeting_attendees (meeting_id)
users ──────────────< tasks (assignee_id, nullable)
users ──────────────  moms (edited_by, nullable)
```

### `users`

| Column | Type | Notes |
|---|---|---|
| id | INT PK AI | |
| name | VARCHAR(100) | |
| email | VARCHAR(150) UNIQUE | |
| password | VARCHAR(255) | bcrypt hash (salt 12) |
| role | ENUM | `admin` \| `member` |
| created_at | TIMESTAMP | |

### `meetings`

| Column | Type | Notes |
|---|---|---|
| id | INT PK AI | |
| title | VARCHAR(255) | |
| google_event_id | VARCHAR(255) UNIQUE | From Calendar API |
| meet_link | VARCHAR(500) | Google Meet URL |
| scheduled_at | DATETIME | UTC |
| started_at | DATETIME | When bot entered |
| ended_at | DATETIME | When meeting ended |
| duration_seconds | INT | |
| organizer_id | INT FK → users | |
| status | ENUM | `scheduled` \| `recording` \| `processing` \| `completed` \| `failed` |
| audio_path | VARCHAR(500) | Local path to .mp3 |

### `moms`

| Column | Type | Notes |
|---|---|---|
| id | INT PK AI | |
| meeting_id | INT FK UNIQUE | One MOM per meeting |
| raw_transcript | LONGTEXT | Verbatim Whisper output |
| summary | TEXT | Claude summary (bilingual for JP) |
| is_edited | BOOLEAN | |
| edited_by | INT FK → users | Nullable |
| edited_at | DATETIME | |

### `mom_key_points`

| Column | Type | Notes |
|---|---|---|
| id | INT PK AI | |
| mom_id | INT FK CASCADE | |
| point_text | TEXT | Prefixed: `[Agenda]`, `[Discussion]`, `[Decision]`, etc. |
| order_index | INT | Drag-drop ordering |

### `tasks`

| Column | Type | Notes |
|---|---|---|
| id | INT PK AI | |
| mom_id | INT FK CASCADE | |
| title | VARCHAR(255) | |
| description | TEXT | Nullable |
| assigned_to | VARCHAR(100) | Text name (may differ from users table) |
| assignee_id | INT FK → users | Nullable — linked user account |
| deadline | DATE | Nullable |
| priority | ENUM | `high` \| `medium` \| `low` |
| status | ENUM | `pending` \| `in_progress` \| `completed` |

### `meeting_attendees`

| Column | Type | Notes |
|---|---|---|
| id | INT PK AI | |
| meeting_id | INT FK CASCADE | |
| user_id | INT FK → users | Nullable (external attendees) |
| name | VARCHAR(100) | |
| email | VARCHAR(150) | |

---

## 5. Backend API Reference

Base URL: `/api/v1`

All endpoints except `/auth/login` require `Authorization: Bearer <JWT>`.

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login` | Login → `{ token, user }` |
| GET | `/auth/me` | Current user from JWT |

### Meetings

| Method | Endpoint | Description |
|---|---|---|
| GET | `/meetings` | List meetings. Query: `status`, `page`, `limit` |
| GET | `/meetings/:id` | Meeting detail with MOM + attendees |
| DELETE | `/meetings/:id` | Admin only |
| POST | `/meetings/sync` | Trigger Google Calendar sync |
| GET | `/meetings/:id/waiting` | Count of people waiting in lobby |
| POST | `/meetings/:id/admit` | Admit all waiting participants |

### MOMs

| Method | Endpoint | Description |
|---|---|---|
| GET | `/mom/:meetingId` | Get MOM by meeting ID |
| GET | `/mom/id/:id` | Get MOM by its own ID |
| PUT | `/mom/:id` | Update summary / key points (saves `is_edited`) |
| POST | `/mom/:id/regenerate` | Re-run the full AI pipeline (needs `audio_path`) |
| GET | `/mom/search?q=` | Full-text search (min 2 chars) |

### Tasks

| Method | Endpoint | Description |
|---|---|---|
| GET | `/tasks` | List tasks. Query: `status`, `priority`, `momId`, `page` |
| POST | `/tasks` | Create task |
| PUT | `/tasks/:id` | Update task |
| DELETE | `/tasks/:id` | Admin only |

---

## 6. Frontend Structure

### Pages

| Route | File | Description |
|---|---|---|
| `/login` | `app/login/page.tsx` | JWT login, language toggle |
| `/meetings` | `app/meetings/page.tsx` | 5 status stat cards + sortable table |
| `/meetings/:id` | `app/meetings/[id]/page.tsx` | Detail, admit button, MOM preview |
| `/mom/:id` | `app/mom/[id]/page.tsx` | 2-column: content left, tasks right |
| `/mom/:id/edit` | `app/mom/[id]/edit/page.tsx` | Summary editor + drag-drop key points |
| `/tasks` | `app/tasks/page.tsx` | Task list with status/priority filters |
| `/calendar` | `app/calendar/page.tsx` | Monthly calendar view |
| `/settings` | `app/settings/page.tsx` | Theme + language + profile |

### Redux Slices

| Slice | State | Key Thunks |
|---|---|---|
| `authSlice` | `user, token, status` | `login`, `logout`, `fetchMe` |
| `uiSlice` | `theme, language, sidebarCollapsed` | `setTheme`, `setLanguage`, `toggleSidebar` |
| `meetingSlice` | `meetings, currentMeeting, total` | `fetchMeetings`, `fetchMeeting` |
| `momSlice` | `currentMOM, status` | `fetchMOM`, `fetchMOMById`, `updateMOM` |
| `taskSlice` | `tasks, filters, total` | `fetchTasks`, `createTask`, `updateTask`, `deleteTask` |

### i18n

- `react-i18next` with `en.json` and `ja.json`
- Language persisted in `uiSlice` + `localStorage`
- MOM content is **not** translated by the UI toggle — it's already bilingual in the DB for Japanese meetings

### Design System

CSS custom properties in `globals.css`:

```
--primary: #00C9A7   (teal)
--accent:  #FF6B6B   (coral)
--warning: #F79009   (amber)
--bg:      #F2F4F7
--surface: #FFFFFF
--border:  #E4E7EC
--text:    #101828
--text-muted: #667085
```

Dark mode via `class="dark"` on `<html>`. Toggled by `uiSlice.theme` + synced in `ThemeSync` component.

Custom utility classes: `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.card`, `.input`, `.table-base`, `.menu-item`, `.menu-item-active`

---

## 7. AI Prompts & MOM Format

### English MOM — Claude output shape

```json
{
  "language": "english",
  "participants": ["Name 1", "Name 2"],
  "agenda": ["Topic 1"],
  "key_discussion_points": ["Point 1"],
  "decisions": ["Decision 1"],
  "action_items": [
    {
      "title": "Task title",
      "description": "What to do",
      "assigned_to": "Name or Unassigned",
      "deadline": "YYYY-MM-DD or null",
      "priority": "high | medium | low"
    }
  ],
  "summary": "2–4 sentence executive summary"
}
```

### Japanese MOM — Claude output shape

```json
{
  "language": "japanese",
  "japanese": { "agenda": [], "key_discussion_points": [], "decisions": [], "action_items": [], "summary": "" },
  "english":  { "agenda": [], "key_discussion_points": [], "decisions": [], "action_items": [], "summary": "" }
}
```

### Key point prefixes stored in DB

| Language | Prefix | Meaning |
|---|---|---|
| English | `[Agenda]` | Agenda topic |
| English | `[Discussion]` | Key discussion point |
| English | `[Decision]` | Decision made |
| Japanese | `[議題]` | Agenda |
| Japanese | `[議論]` | Discussion |
| Japanese | `[決定]` | Decision |
| JP (EN section) | `[EN Agenda]`, `[EN Discussion]`, `[EN Decision]` | English counterparts |

---

## 8. Bot Behavior

- Launched by `scheduler.service.js` exactly **2 minutes before** meeting start
- Scheduler polls every **30 seconds** with a **±30 second** detection window
- Browser flags: `--use-fake-device-for-media-stream`, `--disable-notifications`, `--no-sandbox`
- `getUserMedia` overridden in-page to return silent/black streams
- Bot never speaks, never reacts, never raises hand
- **No auto-admit** — `POST /meetings/:id/admit` must be called explicitly
- Recording: `MediaRecorder` inside the Puppeteer page, chunks written to `.webm` every second
- Meeting end detection (in order):
  1. `MutationObserver` on the end-call overlay
  2. `page.on('framenavigated')` when Meet redirects
  3. 3-second poll fallback

---

## 9. Environment Variables

### Backend `.env`

```
PORT=5000
FRONTEND_URL=http://localhost:3000

DB_HOST=localhost
DB_PORT=3306
DB_NAME=ai_mom_db
DB_USER=root
DB_PASSWORD=your_db_password

JWT_SECRET=your_jwt_secret_min_32_chars
JWT_EXPIRES_IN=7d

ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REFRESH_TOKEN=1//...
GOOGLE_REDIRECT_URI=http://localhost

TEMP_DIR=./temp
LOG_LEVEL=info
```

### Frontend `.env.local`

```
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

---

## 10. Setup & Installation

### 1. Database

```sql
CREATE DATABASE ai_mom_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mom_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON ai_mom_db.* TO 'mom_user'@'localhost';
```

Tables are created automatically by Sequelize on first run (`sequelize.sync()`).

### 2. Google OAuth2

```bash
cd backend
node scripts/get-refresh-token.js
# Follow the printed URL → authorize → paste code back
# Copy the printed GOOGLE_REFRESH_TOKEN= value into .env
```

> The refresh token expires if the app is in Google "Testing" mode and unused for 7 days. Re-run the script to get a new one.

### 3. Backend

```bash
cd backend
npm install
# Ensure .env is filled
npm start          # production
npm run dev        # nodemon watch
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm start          # serve production build
```

### 5. First Login

Seed an admin user directly in MySQL:

```sql
INSERT INTO users (name, email, password, role)
VALUES ('Admin', 'admin@example.com', '$2b$12$...bcrypt_hash...', 'admin');
```

Or add a seed script to `backend/scripts/seed.js`.

### 6. FFmpeg

- **Windows:** Download from [ffmpeg.org](https://ffmpeg.org) and add to PATH
- **macOS:** `brew install ffmpeg`
- **Linux:** `apt install ffmpeg`

---

## 11. Key Constraints & Decisions

| # | Constraint | Reason |
|---|---|---|
| 1 | `sequelize.sync()` only — no `{alter:true}` | `alter:true` causes "too many keys" error on MySQL InnoDB with multiple FK indexes |
| 2 | Claude text-only — no audio | Claude API has no audio input blocks; Whisper handles transcription |
| 3 | Bot never auto-admits | Security — explicit `POST /admit` required to admit waiting participants |
| 4 | No Google Drive storage | Simpler pipeline; audio goes directly from FFmpeg temp file to Whisper API |
| 5 | `assigned_to` TEXT + nullable `assignee_id` | Action items from Claude have names only — linking to user accounts is optional |
| 6 | MOM content not translated by UI toggle | Content is already bilingual (JP + EN) in the DB for Japanese meetings |
| 7 | All datetimes stored/returned as UTC | Frontend formats via `Intl.DateTimeFormat` using the user's locale |
| 8 | `order_index` saved on every drag-drop | `PUT /mom/:id` with `key_points[]` replaces all points in one atomic update |
| 9 | Search minimum 2 characters | Prevents expensive `%a%` full-table scans |
| 10 | `headless: 'new'` for Puppeteer | Old `headless: true` deprecated in Puppeteer 21+; `headless: false` shows the window |
