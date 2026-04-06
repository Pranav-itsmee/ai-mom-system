# AI MOM System — Complete Technical Reference

> Full-stack documentation for the AI Minutes of Meeting (MOM) System.
> Covers every file, function, flow, and constraint across backend and frontend.

**Tech Stack:** Next.js · Redux Toolkit · Axios · Node.js · Express.js · MySQL · Sequelize · OpenAI Whisper · Claude API · Google Calendar API · Puppeteer · FFmpeg

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Folder Structure](#3-project-folder-structure)
4. [Database Design](#4-database-design)
5. [Full Execution Flow A→Z](#5-full-execution-flow-az)
6. [Backend File-by-Function Reference](#6-backend-file-by-function-reference)
7. [Frontend File-by-Function Reference](#7-frontend-file-by-function-reference)
8. [AI Prompts](#8-ai-prompts)
9. [API Endpoints](#9-api-endpoints)
10. [Error Handling Strategy](#10-error-handling-strategy)
11. [Environment Variables](#11-environment-variables)
12. [Setup & Installation](#12-setup--installation)
13. [Known Constraints & Decisions](#13-known-constraints--decisions)
14. [Future Improvements](#14-future-improvements)

---

## 1. Project Overview

The AI MOM System automates the complete lifecycle of meeting documentation:

1. **Detect** upcoming Google Meet sessions via Google Calendar API (polled every 30 s)
2. **Join** the meeting automatically exactly 2 minutes before scheduled start time
3. **Record** incoming audio via in-page WebRTC MediaRecorder (silent bot — mic/camera always off)
4. **Convert** the recording from WebM to MP3 using FFmpeg
5. **Transcribe** the audio using OpenAI Whisper API (with language detection)
6. **Generate MOM** using Claude API — English only for English meetings, Japanese + English for Japanese meetings
7. **Persist** the MOM, key points, tasks, and attendees in MySQL
8. **Expose** REST APIs for the Next.js frontend to display, edit, and search all data
9. **Link** meetings to external BMS (Business Management System) projects

### Design Constraints
- No manual audio/video uploads — all recordings come exclusively from the Puppeteer bot
- No Google Drive intermediate storage — audio goes directly from FFmpeg to Whisper
- Bot is fully passive: mic/camera always off, no chat, no reactions, no hand-raise
- Whisper handles transcription; Claude handles MOM generation only (not audio processing)
- Bot joins exactly 2 minutes before start via a ±30 s scheduler window

---

## 2. Tech Stack

### Backend

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js 18+ | Server runtime |
| Framework | Express.js 4.x | REST API |
| Database | MySQL 8.x | Persistent storage |
| ORM | Sequelize 6.x | DB models + queries |
| Transcription | OpenAI Whisper (`whisper-1`) | Audio → text + language detection |
| MOM AI | Claude API (`claude-sonnet-4-6`) | Transcript → structured MOM JSON |
| Bot | Puppeteer 21.x | Headless Chrome — joins Google Meet |
| Audio | FFmpeg + fluent-ffmpeg | WebM → MP3 conversion |
| Calendar | Google Calendar API v3 | Meeting detection + sync |
| Auth | jsonwebtoken + bcryptjs | JWT authentication |
| Logging | Winston | Structured logs (console + file) |
| HTTP Client | Axios | API calls (OpenAI, Claude, BMS) |

### Frontend

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 14+ (App Router) | React SSR + routing |
| State | Redux Toolkit | Global state |
| HTTP | Axios | API calls with JWT interceptor |
| Styling | Inline CSS (Atlassian palette) | Component styling |

---

## 3. Project Folder Structure

```
ai-mom-system/
├── README.md
│
├── backend/
│   ├── src/
│   │   ├── server.js                  # Entry point — DB auth + sync + HTTP listen
│   │   ├── app.js                     # Express app — middleware + routes
│   │   ├── config/
│   │   │   ├── db.js                  # Sequelize instance
│   │   │   └── googleAuth.js          # Google OAuth2 client
│   │   ├── models/
│   │   │   ├── index.js               # All models + associations
│   │   │   ├── User.js
│   │   │   ├── Meeting.js
│   │   │   ├── MOM.js
│   │   │   ├── MOMKeyPoint.js
│   │   │   ├── Task.js
│   │   │   ├── MeetingAttendee.js
│   │   │   └── MeetingProjectLink.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── meeting.routes.js      # includes /admit and /waiting
│   │   │   ├── mom.routes.js          # /search and /id/:id before /:meetingId
│   │   │   ├── task.routes.js
│   │   │   └── bms.routes.js
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── meeting.controller.js  # includes admitWaiting, getWaiting
│   │   │   ├── mom.controller.js
│   │   │   ├── task.controller.js
│   │   │   └── bms.controller.js
│   │   ├── services/
│   │   │   ├── claude.service.js      # Whisper transcription + Claude MOM pipeline
│   │   │   ├── calendar.service.js    # Google Calendar sync + join-window query
│   │   │   ├── scheduler.service.js   # 30 s polling — triggers bot 2 min before start
│   │   │   ├── ffmpeg.service.js      # WebM → MP3
│   │   │   └── mom.parser.js          # Parse + validate Claude JSON response
│   │   ├── bot/
│   │   │   ├── meetBot.js             # Puppeteer bot — join, record, monitor, admit
│   │   │   └── recorder.js            # In-page MediaRecorder + real-time chunk writes
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js     # JWT validation
│   │   │   └── errorHandler.js        # Global error handler
│   │   └── utils/
│   │       ├── fileManager.js         # deleteFile() for temp cleanup
│   │       └── logger.js              # Winston logger
│   ├── temp/                          # Temporary WebM / MP3 files (gitignored)
│   ├── logs/                          # Winston log files (gitignored)
│   ├── reprocess.js                   # CLI: re-run MOM generation for a failed meeting
│   ├── .env
│   └── package.json
│
└── frontend/
    ├── app/
    │   ├── layout.tsx                 # Root layout — Redux Provider + Navbar
    │   ├── page.tsx                   # Dashboard — nav cards
    │   ├── meetings/
    │   │   ├── page.tsx               # Meeting list — status filter, 30 s auto-refresh
    │   │   └── [id]/page.tsx          # Meeting detail — MOM + tasks + admit control
    │   ├── mom/[id]/
    │   │   ├── page.tsx               # MOM view (read-only)
    │   │   └── edit/page.tsx          # MOM editor — summary + key points
    │   └── tasks/page.tsx             # Task dashboard — status + priority filters
    ├── components/
    │   ├── Navbar.tsx
    │   ├── MOMViewer.tsx
    │   ├── MOMEditor.tsx
    │   ├── TaskCard.tsx
    │   ├── TaskEditor.tsx
    │   └── ProjectLinker.tsx
    ├── store/
    │   ├── index.ts
    │   └── slices/
    │       ├── authSlice.ts
    │       ├── meetingSlice.ts
    │       ├── momSlice.ts
    │       └── taskSlice.ts
    ├── services/api.ts                # Axios instance + JWT interceptor
    ├── .env.local
    └── package.json
```

---

## 4. Database Design

### ERD

```
users ──────────────< meetings
meetings ───────────< moms (1:1)
moms ───────────────< mom_key_points
moms ───────────────< tasks
meetings ───────────< meeting_attendees
meetings >──────────< bms_projects  (via meeting_project_links)
```

### Tables

#### `users`
```sql
CREATE TABLE users (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  email        VARCHAR(150) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,           -- bcrypt hash (salt 12)
  role         ENUM('admin','member') DEFAULT 'member',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `meetings`
```sql
CREATE TABLE meetings (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  title             VARCHAR(255) NOT NULL,
  google_event_id   VARCHAR(255) UNIQUE,
  meet_link         VARCHAR(500),
  scheduled_at      DATETIME NOT NULL,
  started_at        DATETIME,
  ended_at          DATETIME,
  duration_seconds  INT,
  organizer_id      INT,
  status            ENUM('scheduled','recording','processing','completed','failed') DEFAULT 'scheduled',
  audio_path        VARCHAR(500),               -- local path to .mp3
  claude_file_id    VARCHAR(255),               -- reserved (unused after Whisper migration)
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organizer_id) REFERENCES users(id)
);
```

#### `moms`
```sql
CREATE TABLE moms (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  meeting_id       INT NOT NULL UNIQUE,
  raw_transcript   LONGTEXT,                    -- verbatim Whisper output
  summary          TEXT NOT NULL,               -- Claude summary (bilingual for JP meetings)
  is_edited        BOOLEAN DEFAULT FALSE,
  edited_by        INT,
  edited_at        DATETIME,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id),
  FOREIGN KEY (edited_by) REFERENCES users(id)
);
```

#### `mom_key_points`
```sql
CREATE TABLE mom_key_points (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  mom_id      INT NOT NULL,
  point_text  TEXT NOT NULL,                    -- prefixed: [Agenda], [Discussion], [Decision], [EN …]
  order_index INT DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mom_id) REFERENCES moms(id) ON DELETE CASCADE
);
```

#### `tasks`
```sql
CREATE TABLE tasks (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  mom_id        INT NOT NULL,
  title         VARCHAR(500) NOT NULL,
  description   TEXT,
  assigned_to   VARCHAR(200),                   -- AI-extracted name
  assignee_id   INT,                            -- FK → users.id (optional match)
  deadline      DATE,
  priority      ENUM('high','medium','low') DEFAULT 'medium',
  status        ENUM('pending','in_progress','completed') DEFAULT 'pending',
  is_edited     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (mom_id) REFERENCES moms(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES users(id)
);
```

#### `meeting_attendees`
```sql
CREATE TABLE meeting_attendees (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  meeting_id  INT NOT NULL,
  user_id     INT,
  name        VARCHAR(100),
  email       VARCHAR(150),
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### `meeting_project_links`
```sql
CREATE TABLE meeting_project_links (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  meeting_id  INT NOT NULL,
  project_id  INT NOT NULL,
  linked_by   INT,
  linked_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id),
  FOREIGN KEY (linked_by) REFERENCES users(id)
);
```

---

## 5. Full Execution Flow A→Z

### Flow 1 — Server Boot
```
node src/server.js
  → dotenv.config()
  → require('./app')            Express + routes
  → sequelize.authenticate()    test DB connection
  → sequelize.sync()            create tables if missing (no alter)
  → startScheduler()            30 s polling begins
  → app.listen(5000)
```

### Flow 2 — Scheduler Tick (every 30 s)
```
scheduler.service.js: runTick()
  → calendarService.syncMeetings()
      → fetchUpcomingEvents()    Google Calendar API, next 24 h
      → filter events with conferenceData.entryPoints[].entryPointType === 'video'
      → Meeting.findOrCreate({ google_event_id })
  → calendarService.getMeetingsInJoinWindow(120 000 ms, 30 000 ms)
      → WHERE status='scheduled'
        AND scheduled_at BETWEEN (now + 90s) AND (now + 150s)
      → Returns meetings that start in ~2 minutes
  → for each qualifying meeting: meetBot.joinMeeting(meeting)
```

### Flow 3 — Bot Joining (exactly 2 min before start)
```
meetBot.joinMeeting(meeting)
  → puppeteer.launch({ headless: false*, userDataDir: C:\bot-chrome-profile })
  → page.evaluateOnNewDocument(_mediaLockScript())
      → overrides navigator.mediaDevices.getUserMedia → always returns empty MediaStream
      → blocks chat/reaction keyboard shortcuts (C, E, H)
  → page.evaluateOnNewDocument(MeetingRecorder.hookScript())
      → wraps RTCPeerConnection constructor to collect incoming audio tracks
  → _ensureLoggedIn(page)       verify bot profile is signed into Google
  → meeting.update({ status: 'recording', started_at })
  → page.goto(meeting.meet_link, 3 retries)
  → _disableInputDevices(page)  click mic + camera off in pre-join lobby
  → _clickJoinButton(page)      4 CSS selectors + text-content fallback
  → sleep(3 s)
  → _disableInputDevices(page)  re-verify after join
  → recorder.start(meeting.id)  begin audio capture
  → _startMonitor(meeting, session)

* set headless: 'new' to run invisibly
```

### Flow 4 — Audio Recording
```
recorder.js: start(meetingId)
  → fs.createWriteStream('temp/meeting_<id>_<ts>.webm')
  → page.exposeFunction('__saveAudioChunk', base64 => writeStream.write(Buffer))
  → page.evaluate(() => {
      // Use RTCPeerConnection tracks captured by hookScript
      const ctx = new AudioContext()
      window.__audioTracks.forEach(track => ctx.createMediaStreamSource(...).connect(ctx.destination))
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64000 })
      rec.ondataavailable = e => blob → base64 → __saveAudioChunk()
      rec.start(3000)   // 3-second chunks — real-time disk persistence
    })
```

### Flow 5 — Meeting End Detection (priority order)
```
1. page.on('framenavigated')  → URL no longer contains meetCode → force-stop (instant)
2. page.exposeFunction('__onMeetingEndDetected')  MutationObserver fires when
   any MEETING_END_PHRASE appears in document.body.innerText (instant)
3. setInterval every 3 s  → fallback poll checks same phrases + alone status
4. page.on('crash')        → force-stop

MEETING_END_PHRASES includes:
  'Meeting ended', 'This call has ended', 'has been ended by',
  'You were removed', 'Return to home screen', and 8 more variants

ALONE logic: if bot is the only participant for 15 s → graceful leave
```

### Flow 6 — Session End + Post-Processing
```
meetBot._endSession(meeting, session, elapsedMs, force)
  → recorder.stop() or recorder.forceStop() (if force=true)
  → browser.close()
  → meeting.update({ status: 'processing', ended_at, duration_seconds })
  → validate: webmPath exists AND size > 4 KB
  → ffmpegService.convertVideoToAudio(webmPath, mp3Path)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioChannels(1)         mono
      .audioFrequency(16000)    16 kHz optimal for speech
  → meeting.update({ audio_path: mp3Path })
  → deleteFile(webmPath)
  → claudeService.generateMOM(meeting.id, mp3Path)
```

### Flow 7 — Transcription + Language Detection (OpenAI Whisper)
```
claude.service.js: transcribeAudio(audioPath)
  → POST https://api.openai.com/v1/audio/transcriptions
      body: FormData { file, model: 'whisper-1', response_format: 'verbose_json' }
  → returns { text, language }   e.g. { text: "...", language: "ja" }

detectLanguage(whisperLang, transcript)
  → whisperLang === 'ja'                       → 'japanese'
  → /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fef]/.test(transcript) → 'japanese'
  → default                                    → 'english'
```

### Flow 8 — MOM Generation (Claude)
```
claude.service.js: callClaudeWithTranscript(transcript, language)
  → selects PROMPT_ENGLISH or PROMPT_JAPANESE based on language
  → POST https://api.anthropic.com/v1/messages
      model: 'claude-sonnet-4-6', max_tokens: 8192
      content: `${prompt}\n\n---TRANSCRIPT---\n${transcript}`

English output structure:
  { language, transcript, title, date_time, participants, agenda,
    key_discussion_points, decisions, action_items[], summary }

Japanese output structure:
  { language, transcript,
    japanese: { title, date_time, participants, agenda,
                key_discussion_points, decisions, action_items[], summary },
    english:  { ...same fields, natural English translation }  }
```

### Flow 9 — Normalise + Persist to DB
```
normalizeForDB(parsed, language)
  English:
    summary    = parsed.summary
    key_points = [Agenda] … + [Discussion] … + [Decision] …
    tasks      = parsed.action_items
    attendees  = parsed.participants

  Japanese:
    summary    = jp.summary + '\n---\n[English Translation]\n' + en.summary
    key_points = [議題] … + [議論] … + [決定] … + [EN Agenda] … + [EN Discussion] … + [EN Decision] …
    tasks      = en.action_items   (structured data stays in English)
    attendees  = en.participants

persistMOM(meeting, data)  — wrapped in sequelize.transaction():
  → MOM.findOrCreate({ meeting_id })
  → MOMKeyPoint.destroy + bulkCreate
  → Task.destroy (if regenerating) + bulkCreate
  → MeetingAttendee.bulkCreate (skip existing names)
  → meeting.update({ status: 'completed' })
```

### Flow 10 — Admission Control (on-demand only)
```
Bot detects waiting participants every 3 s (MutationObserver on Admit buttons)
Bot logs: "N participant(s) waiting — use POST /api/v1/meetings/:id/admit"
Bot NEVER auto-admits.

Authorized user calls: POST /api/v1/meetings/:id/admit
  → meetBot.admitWaiting(meetingId)
  → page.evaluate: click individual Admit buttons (or "Admit all" fallback)
  → returns { admitted: ["Name 1", "Name 2"], count: 2 }
```

### Flow 11 — Frontend: Meeting Detail
```
/meetings/[id] page:
  → fetchMeeting(id)         GET /api/v1/meetings/:id
  → fetchMOM(id)             GET /api/v1/mom/:meetingId
  → fetchTasks({ meetingId }) GET /api/v1/tasks?meetingId=:id
  → polls every 10 s while status === 'recording' | 'processing'
  → renders MOMViewer + TaskCard list
  → "Edit MOM" → /mom/:momId/edit
  → "Admit" → POST /api/v1/meetings/:id/admit
```

---

## 6. Backend File-by-Function Reference

### `src/server.js`
Boots the application: authenticates DB, syncs schema (`sync()` — no alter), starts scheduler, starts HTTP server, registers graceful shutdown on SIGTERM/SIGINT.

### `src/app.js`
Creates Express app, registers CORS (origin = `FRONTEND_URL`), JSON middleware, all routes, 404 handler, global error handler.

### `src/services/scheduler.service.js`

| Function | Description |
|---|---|
| `startScheduler()` | Begins 30 s polling loop; calls `runTick()` immediately on start |
| `stopScheduler()` | Clears interval |
| `runTick()` | One tick: sync calendar → find meetings in join window → call `meetBot.joinMeeting()` |

Constants: `POLL_INTERVAL_MS = 30 000`, `JOIN_BEFORE_MS = 120 000`, `WINDOW_HALF_MS = 30 000`

### `src/services/calendar.service.js`

| Function | Description |
|---|---|
| `fetchUpcomingEvents()` | Google Calendar API — events for next 24 h with video conference links |
| `extractMeetLink(event)` | Pulls the Google Meet URI from `conferenceData.entryPoints` |
| `syncMeetings()` | Upserts events into DB by `google_event_id`; returns `{ meeting, created }[]` |
| `getMeetingsInJoinWindow(targetMs, halfMs)` | Returns `status='scheduled'` meetings where `scheduled_at BETWEEN now+90s AND now+150s` |

### `src/services/claude.service.js`

| Function | Description |
|---|---|
| `detectLanguage(whisperLang, transcript)` | Returns `'japanese'` or `'english'` based on Whisper code + Unicode regex |
| `transcribeAudio(audioPath)` | POST to OpenAI Whisper `verbose_json`; returns `{ transcript, whisperLang }` |
| `callClaudeWithTranscript(transcript, language)` | Sends transcript + language-appropriate prompt to Claude; returns raw JSON string |
| `normalizeForDB(parsed, language)` | Maps Claude's rich structure → `{ transcript, summary, key_points, tasks, attendees }` |
| `normalizeTask(t)` | Picks `title, description, assigned_to, deadline, priority` from a task object |
| `persistMOM(meeting, data)` | Transaction: upsert MOM + replace key_points + replace tasks + add new attendees + mark completed |
| `generateMOM(meetingId, audioPath)` | Entry point: orchestrates transcribe → detect → generate → normalize → persist |

### `src/services/ffmpeg.service.js`

| Function | Description |
|---|---|
| `convertVideoToAudio(inputPath, outputPath)` | WebM → MP3 (128 kbps, mono, 16 kHz). Reads `FFMPEG_PATH`/`FFPROBE_PATH` from env |
| `getMediaDuration(filePath)` | Returns duration in seconds via ffprobe |

### `src/services/mom.parser.js`

| Function | Description |
|---|---|
| `parseMOMResponse(rawText)` | Strips markdown fences, `JSON.parse()`, validates + normalizes all fields |
| `normaliseStringArray(value, fieldName)` | Ensures arrays of trimmed, non-empty strings |
| `normaliseTasks(raw)` | Validates task objects; requires `title`; defaults `priority='medium'`, `assigned_to='Unassigned'` |
| `normaliseDate(raw)` | Validates YYYY-MM-DD; returns `null` if invalid |
| `normalisePriority(raw)` | Enforces `high|medium|low`; defaults to `'medium'` |

### `src/bot/meetBot.js`

| Method | Description |
|---|---|
| `joinMeeting(meeting)` | Full join flow: launch → login check → inject scripts → navigate → disable devices → join → record → monitor |
| `_launchBrowser()` | `puppeteer.launch` with `headless: false` (change to `'new'` for invisible), bot Chrome profile, fake media flags |
| `_ensureLoggedIn(page)` | Navigates to `accounts.google.com`; throws if signin page detected |
| `_disableInputDevices(page)` | Finds mic/camera buttons via `aria-label`/`aria-pressed`/`jsname`; clicks off; retries if still on |
| `_clickJoinButton(page)` | Tries 4 CSS selectors + text-content fallback (`/join\s*now?/i`) |
| `_startMonitor(meeting, session)` | Sets up `framenavigated` handler, MutationObserver (instant), 3 s poll (fallback), crash handler, 4 h cap, 15 s alone timeout |
| `getWaitingCount(meetingId)` | Returns `session.waitingCount` (0 if no active session) |
| `admitWaiting(meetingId)` | Clicks Admit buttons for all waiting participants; returns names array |
| `_endSession(meeting, session, elapsedMs, force)` | Stop recorder → close browser → FFmpeg → Claude pipeline |

**Media lock script** (`_mediaLockScript()`) — injected via `evaluateOnNewDocument`:
- Overrides `navigator.mediaDevices.getUserMedia` (W3C + legacy variants) → returns empty `MediaStream`
- Blocks keyboard shortcuts for chat (C), reactions (E), hand-raise (H)

### `src/bot/recorder.js`

| Method | Description |
|---|---|
| `hookScript()` (static) | Returns script for `evaluateOnNewDocument`: wraps `RTCPeerConnection` constructor to collect audio tracks into `window.__audioTracks` |
| `start(meetingId)` | Opens write stream; exposes `__saveAudioChunk`; injects in-page `MediaRecorder` with `audio/webm;codecs=opus` at 64 kbps, 3 s chunks |
| `stop()` | Stops MediaRecorder in page, waits 1.5 s, closes write stream |
| `forceStop()` | Closes write stream immediately (no page interaction — used when page crashed) |
| `_finalise()` | Promise wrapper: closes stream, resolves with output path |

### `src/controllers/`

**`auth.controller.js`**
- `register` — hash password (bcrypt salt 12), `User.create()`, return JWT
- `login` — `bcrypt.compare()`, return JWT (7 d expiry)
- `getMe` — return `req.user`

**`meeting.controller.js`**
- `listMeetings` — paginated; filters: status, from, to, page, limit; includes organizer
- `getMeeting` — full relations: organizer, attendees, MOM (with keyPoints + tasks)
- `syncCalendar` — manual trigger for `calendarService.syncMeetings()`
- `updateMeetingStatus` — PATCH; validates against enum values
- `deleteMeeting` — hard delete (cascades)
- `admitWaiting` — calls `meetBot.admitWaiting(id)`; 404 if no active session
- `getWaiting` — returns `{ meeting_id, waiting: N }`

**`mom.controller.js`**
- `getMOMById` — by `mom.id`; includes keyPoints, tasks, editor, related meeting
- `getMOMByMeeting` — by `meeting_id`; 404 if not generated yet
- `updateMOM` — replaces summary and/or key_points; sets `is_edited`, `edited_by`, `edited_at`
- `regenerateMOM` — async (responds 200 immediately); runs `claudeService.generateMOM()` in background
- `searchMOMs` — `Op.like` on `summary` + `raw_transcript`; min 2 chars; limit 50

**`task.controller.js`**
- `listTasks` — filters: meetingId, status, priority, assignee; order by priority ASC, created_at DESC
- `createTask` — requires `mom_id` + `title`; defaults `priority='medium'`, `status='pending'`
- `updateTask` — any editable field; sets `is_edited=true`
- `deleteTask` — 204 no content

**`bms.controller.js`**
- `getProjects` — proxies to `BMS_API_URL/projects` or returns info message if not configured
- `linkMeetingToProject` — `MeetingProjectLink.create()`; prevents duplicates
- `getLinksForMeeting` — ordered by `linked_at DESC`
- `removeLink` — delete by link id

### `src/middleware/`
- `auth.middleware.js` — `authenticate(req, res, next)`: extracts `Authorization: Bearer`, verifies JWT, sets `req.user`
- `errorHandler.js` — global handler: logs stack, maps Sequelize `ValidationError` → 400, all else → 500

### `src/utils/`
- `logger.js` — Winston: Console (colorized) + File (`logs/app.log`). Levels: error, warn, info, debug
- `fileManager.js` — `deleteFile(path)`: `fs.unlink()` with swallowed error (safe cleanup)

### `reprocess.js` (CLI)
```bash
node reprocess.js <meeting_id>              # reads audio_path from DB
node reprocess.js <meeting_id> <audio_path> # explicit path override
```
Resets status to `'processing'`, re-runs `claudeService.generateMOM()`. Use when Whisper/Claude failed but the MP3 file still exists on disk.

---

## 7. Frontend File-by-Function Reference

### Pages

**`app/page.tsx`** — Dashboard with three navigation cards: Meetings, Tasks, MOM Search.

**`app/meetings/page.tsx`** — Meeting list
- Status filter dropdown; auto-refreshes every 30 s
- Shows total count when loaded

**`app/meetings/[id]/page.tsx`** — Meeting detail
- Fetches meeting + MOM + tasks in parallel
- Polls every 10 s while `status === 'recording' | 'processing'`
- Shows contextual UI: progress banner (recording/processing), error box (failed), admit button (active session)
- "Edit MOM" → `/mom/:momId/edit`, "Regenerate MOM" → async POST

**`app/mom/[id]/page.tsx`** — Read-only MOM view (transcript, summary, key points)

**`app/mom/[id]/edit/page.tsx`** — MOM editor
- Textarea for summary; dynamic list for key_points (add/remove)
- `PUT /api/v1/mom/:id` on save; shows "Last edited by [user] at [time]" badge

**`app/tasks/page.tsx`** — Task dashboard
- Filters: status (pending / in_progress / completed) + priority (high / medium / low)
- "Clear filters" when active
- Click → opens `TaskEditor` modal

### Redux Slices

**`meetingSlice.ts`**
```ts
state: { meetings: Meeting[], currentMeeting: Meeting | null, total: number, status, error }
thunks: fetchMeetings(params), fetchMeeting(id), updateMeetingStatus({id,status}), deleteMeeting(id)
action: clearCurrentMeeting()
```

**`momSlice.ts`**
```ts
state: { currentMOM: MOM | null, status, error }
thunks: fetchMOM(meetingId), fetchMOMById(momId), updateMOM({id,summary,key_points})
action: clearMOM()
```

**`taskSlice.ts`**
```ts
state: { tasks: Task[], filters: TaskFilters, total: number, status, error }
thunks: fetchTasks(filters), createTask(data), updateTask({id,...}), deleteTask(id)
actions: setFilter(filters), clearFilters()
```

### `services/api.ts`
- Axios instance: `baseURL = NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1'`
- Request interceptor: adds `Authorization: Bearer <token>` from `localStorage`
- Response interceptor: on 401 → clears token + redirects to `/login`

---

## 8. AI Prompts

### English MOM Prompt (`PROMPT_ENGLISH`)
Instructs Claude to return a single JSON object with:
`language, transcript, title, date_time, participants[], agenda[], key_discussion_points[], decisions[], action_items[], summary`

### Japanese MOM Prompt (`PROMPT_JAPANESE`)
Instructs Claude to return a JSON object with two full MOM objects:
- `japanese` — natural professional Japanese
- `english` — high-quality translation (not literal), preserving intent and nuance

Both share the same field structure as the English prompt.

### Language Detection Logic
```
Whisper returns language code (e.g. 'en', 'ja')
  → 'ja' → language = 'japanese'
  → else → check for Japanese Unicode chars in transcript
      /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fef]/ matches → 'japanese'
      else → 'english'
```

### DB Storage for Japanese Meetings
```
summary    = "日本語要約\n\n---\n[English Translation]\n English summary"
key_points = ["[議題] ...", "[議論] ...", "[決定] ...",
              "[EN Agenda] ...", "[EN Discussion] ...", "[EN Decision] ..."]
tasks      = English action_items (structured data stays in English)
attendees  = English participants list
```

---

## 9. API Endpoints

### Base URL: `/api/v1`

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | ❌ | Register user |
| POST | `/auth/login` | ❌ | Login, returns JWT |
| GET | `/auth/me` | ✅ | Get current user |

### Meetings
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/meetings` | ✅ | List meetings (filters: status, from, to, page, limit) |
| GET | `/meetings/:id` | ✅ | Meeting detail with MOM + tasks |
| POST | `/meetings/sync` | ✅ | Trigger manual Calendar sync |
| PATCH | `/meetings/:id/status` | ✅ | Update status |
| DELETE | `/meetings/:id` | ✅ | Delete meeting |
| GET | `/meetings/:id/waiting` | ✅ | Count of lobby participants |
| POST | `/meetings/:id/admit` | ✅ | Admit all waiting participants |

### MOM
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/mom/search?q=` | ✅ | Full-text search (summary + transcript) |
| GET | `/mom/id/:id` | ✅ | Get MOM by mom.id |
| GET | `/mom/:meetingId` | ✅ | Get MOM by meeting_id |
| PUT | `/mom/:id` | ✅ | Edit summary + key_points |
| POST | `/mom/:id/regenerate` | ✅ | Re-run Whisper + Claude on existing audio |

### Tasks
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/tasks` | ✅ | List tasks (filters: meetingId, status, priority, assignee) |
| POST | `/tasks` | ✅ | Create task manually |
| PUT | `/tasks/:id` | ✅ | Edit task |
| DELETE | `/tasks/:id` | ✅ | Delete task |

### BMS
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/bms/projects` | ✅ | List BMS projects |
| POST | `/bms/link` | ✅ | Link meeting to BMS project |
| GET | `/bms/links/:meetingId` | ✅ | Get links for a meeting |
| DELETE | `/bms/link/:id` | ✅ | Remove a link |

---

## 10. Error Handling Strategy

### Backend

| Layer | Approach |
|---|---|
| Whisper API | Throws `Whisper API <status>: <body>` — full error body always logged |
| Claude API | Throws `Claude API <status>: <body>` — full error body always logged |
| FFmpeg | Rejects Promise with `FFmpeg conversion failed: <message>` |
| DB errors | Sequelize throws; caught by global `errorHandler` middleware |
| Bot join failure | `meeting.update({ status: 'failed' })` + `browser.close()` |
| Audio file missing/tiny | Checks `existsSync` + `size > 4096 bytes` before pipeline; marks `'failed'` if invalid |
| `persistMOM` | Entire DB write in one `sequelize.transaction()` — all-or-nothing |
| Files cleanup | `deleteFile()` swallows errors — never breaks the pipeline |

### Frontend

| Layer | Approach |
|---|---|
| API 401 | Interceptor clears localStorage token + redirects to `/login` |
| Redux thunks | `createAsyncThunk` with `rejectWithValue`; slice stores `error` string |
| Missing MOM | Page shows "MOM not yet available" message while polling |

---

## 11. Environment Variables

### `backend/.env`

```env
# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=ai_mom_db
DB_USER=root
DB_PASSWORD=your_mysql_password

# JWT
JWT_SECRET=your_secret_minimum_32_chars
JWT_EXPIRES_IN=7d

# Claude API (MOM generation)
ANTHROPIC_API_KEY=sk-ant-api03-...

# OpenAI (Whisper transcription)
OPENAI_API_KEY=sk-...

# Google OAuth2 (Calendar API)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback
GOOGLE_REFRESH_TOKEN=your_refresh_token

# File paths
TEMP_DIR=./temp

# FFmpeg (required on Windows — not on PATH by default)
FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
FFPROBE_PATH=C:\ffmpeg\bin\ffprobe.exe

# BMS Integration
BMS_API_URL=http://localhost:4000/api
```

### `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

---

## 12. Setup & Installation

### Prerequisites
- Node.js 18+
- MySQL 8.x
- FFmpeg at `C:\ffmpeg` (Windows) or on PATH (Linux/Mac)
- Google Cloud project with Calendar API enabled + OAuth2 credentials
- Anthropic API key (Claude Sonnet access)
- OpenAI API key (Whisper access)

### Backend

```bash
cd backend
npm install
cp .env.example .env    # fill in all values

# Create the database
mysql -u root -p -e "CREATE DATABASE ai_mom_db;"

# Start (tables auto-created via sequelize.sync())
node src/server.js
```

### Frontend

```bash
cd frontend
npm install
# create .env.local with NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
npm run dev
# open http://localhost:3000
```

### Bot Chrome Profile — One-Time Setup

The bot uses a dedicated Chrome profile so it never conflicts with your running browser.

**Step 1** — Create and sign in (run once):
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir=C:\bot-chrome-profile
```

**Step 2** — In the opened Chrome window, sign into the Google account the bot should use.

**Step 3** — Close Chrome. The bot reuses this session automatically.

> **Why?** Chrome locks its user data directory. If your regular Chrome is running, the bot can't use the same profile → `"Failed to launch the browser process!"`. A dedicated profile avoids this entirely.

### Headless Mode (invisible operation)

In [backend/src/bot/meetBot.js](backend/src/bot/meetBot.js), `_launchBrowser()`:

```js
headless: false    // Chrome window visible on screen — use to watch/debug the bot
headless: 'new'   // Chrome runs invisibly in the background — use for production
```

### Reprocess a Failed Meeting

If MOM generation failed but the MP3 file is still on disk:

```bash
cd backend

# audio_path is read from the DB automatically
node reprocess.js 9

# or specify the path explicitly
node reprocess.js 9 "D:\ai-mom-system\backend\temp\meeting_9_1234567890.mp3"
```

---

## 13. Known Constraints & Decisions

| # | Constraint | Reason |
|---|---|---|
| 1 | **No manual audio/video uploads** | All recordings come from the bot only |
| 2 | **Whisper for transcription, Claude for MOM only** | Claude API does not support audio content blocks — `type:'audio'` is not a valid message content type |
| 3 | **`verbose_json` from Whisper** | Required to get `language` field for automatic EN/JP detection |
| 4 | **Dual-language MOM for Japanese** | Japanese meetings generate both JP (original) and EN (translated) MOM in one Claude call |
| 5 | **Bot joins exactly 2 min before start** | Scheduler polls every 30 s; window `[now+90s, now+150s]` gives ±30 s accuracy |
| 6 | **No auto-admit** | Bot never admits lobby participants automatically; requires explicit `POST /meetings/:id/admit` |
| 7 | **Mic/camera always off — two layers** | `_mediaLockScript()` overrides `getUserMedia` at JS level + `--use-fake-device-for-media-stream` Chrome flag |
| 8 | **In-page MediaRecorder (not puppeteer-screen-recorder)** | puppeteer-screen-recorder captures video-only on Windows; hooking RTCPeerConnection captures the actual incoming audio |
| 9 | **Audio chunks written to disk in real time** | 3 s chunks via `exposeFunction` — no data loss if bot is kicked mid-meeting |
| 10 | **`sequelize.sync()` (not alter)** | `sync({ alter: true })` repeatedly adds duplicate indexes, hitting MySQL's 64-key limit |
| 11 | **Dedicated bot Chrome profile** | Avoids `"Failed to launch the browser process!"` when user's Chrome is running |
| 12 | **Meeting end: check `meetCode` in URL** | Meet redirects to `meet.google.com/` home after ending — domain alone can't distinguish |
| 13 | **FFmpeg paths via env vars** | FFmpeg is not on PATH by default on Windows |
| 14 | **MutationObserver for instant end detection** | Polling alone has up to 3 s delay; MutationObserver fires the moment Google Meet renders the end screen |
| 15 | **Tasks linked to MOM, not Meeting directly** | One meeting has exactly one MOM; tasks cascade-delete with the MOM |

---

## 14. Future Improvements

| Area | Improvement |
|---|---|
| Calendar | Switch from polling to Google Calendar push notifications (webhooks) |
| Language | Add support for more languages (Korean, Chinese, Spanish) via Whisper detection |
| Tasks | Auto-match `assigned_to` names against `users` table to populate `assignee_id` |
| Search | Replace `Op.like` with MySQL full-text index on `moms.summary` + `moms.raw_transcript` |
| Frontend | WebSocket for real-time meeting status (eliminate 30 s polling) |
| Frontend | Drag-and-drop reordering of MOM key points |
| Deployment | Docker container with `xvfb` for headless Chrome on Linux |
| BMS | Bidirectional sync — push MOM tasks directly into BMS as project tasks |
| Export | PDF / DOCX export of MOM documents |
| Multi-tenant | Add `organization_id` for multiple teams on one instance |
