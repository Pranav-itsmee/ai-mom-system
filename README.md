# AI MOM System — Backend Documentation

> **Production-level technical reference for the AI Minutes of Meeting (MOM) backend.**
> Every section includes file names, function names, and how each connects to the next step.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Folder Structure](#3-project-folder-structure)
4. [Database Design](#4-database-design)
5. [Full Execution Flow A→Z](#5-full-execution-flow-az)
6. [File-by-Function Reference](#6-file-by-function-reference)
7. [Exact AI Prompt](#7-exact-ai-prompt)
8. [API Endpoints](#8-api-endpoints)
9. [Error Handling Strategy](#9-error-handling-strategy)
10. [Environment Variables](#10-environment-variables)
11. [Setup & Installation](#11-setup--installation)
12. [Known Constraints & Decisions](#12-known-constraints--decisions)
13. [Future Improvements](#13-future-improvements)

---

## 1. Project Overview

The AI MOM System automates the complete lifecycle of meeting documentation:

1. **Detect** upcoming Google Meet sessions via Google Calendar API
2. **Join & Record** the meeting automatically using a Puppeteer browser bot
3. **Convert** the recording from video (.webm) to audio (.mp3) using FFmpeg
4. **Transcribe & Summarize** the audio using Claude AI (Anthropic)
5. **Persist** the generated MOM, key points, tasks, and attendees in MySQL
6. **Expose** REST APIs so the Next.js frontend can display, edit, and search all data
7. **Link** meetings and MOMs to external BMS (Business Management System) projects

### Design Constraints
- No manual audio/video uploads — all recordings come exclusively from the Puppeteer bot
- No Google Drive intermediate storage — audio goes directly from FFmpeg to Claude API
- Files API (beta) is mandatory for audio > 32 MB; inline base64 for smaller files
- Every uploaded file is deleted from the Files API immediately after MOM generation

---

## 2. Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Runtime | Node.js | 18+ | JavaScript server runtime |
| Framework | Express.js | 4.x | REST API server |
| Database | MySQL | 8.x | Persistent relational storage |
| ORM | Sequelize | 6.x | DB models, migrations, queries |
| AI | Claude API | claude-sonnet-4-20250514 | Transcription + MOM generation |
| Files API | Anthropic Files API (beta) | files-api-2025-04-14 | Large audio upload (< 500 MB) |
| Bot | Puppeteer | 21.x | Automated Google Meet joining |
| Recorder | puppeteer-screen-recorder | 3.0.6 | Screen + audio capture → .webm |
| Audio | FFmpeg + fluent-ffmpeg | latest | Video → MP3 conversion |
| Calendar | Google Calendar API | v3 | Meeting detection |
| Auth | jsonwebtoken + bcryptjs | latest | JWT authentication |
| Logging | Winston | 3.x | Structured log files |
| HTTP Client | Axios | 1.x | Claude API + BMS proxy calls |

---

## 3. Project Folder Structure

```
backend/
├── src/
│   ├── server.js                   # Entry point — boots everything
│   ├── app.js                      # Express app — routes + middleware
│   ├── config/
│   │   ├── db.js                   # Sequelize instance (MySQL)
│   │   └── googleAuth.js           # Google OAuth2 client factory
│   ├── models/
│   │   ├── index.js                # Loads all models + defines associations
│   │   ├── User.js
│   │   ├── Meeting.js
│   │   ├── MOM.js
│   │   ├── MOMKeyPoint.js
│   │   ├── Task.js
│   │   ├── MeetingAttendee.js
│   │   └── MeetingProjectLink.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── meeting.routes.js
│   │   ├── mom.routes.js           # /search and /id/:id BEFORE /:meetingId
│   │   ├── task.routes.js
│   │   └── bms.routes.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── meeting.controller.js
│   │   ├── mom.controller.js
│   │   ├── task.controller.js
│   │   └── bms.controller.js
│   ├── services/
│   │   ├── claude.service.js       # Full Claude API pipeline
│   │   ├── calendar.service.js     # Google Calendar integration
│   │   ├── ffmpeg.service.js       # Audio conversion
│   │   ├── scheduler.service.js    # 5-minute background tick
│   │   └── mom.parser.js           # Parses Claude JSON response
│   ├── bot/
│   │   ├── meetBot.js              # Puppeteer bot (singleton)
│   │   └── recorder.js             # PuppeteerScreenRecorder wrapper
│   ├── middleware/
│   │   ├── auth.middleware.js      # JWT verification
│   │   └── errorHandler.js        # Global error handler
│   └── utils/
│       ├── logger.js               # Winston logger
│       └── fileManager.js          # Temp file helpers
├── temp/                           # Temporary audio/video (gitignored)
├── logs/                           # Auto-created by Winston
├── .env
├── .env.example
└── package.json
```

---

## 4. Database Design

### Entity Relationship

```
users ──────────────< meetings           (organizer_id FK)
users ──────────────< moms               (edited_by FK)
users ──────────────< tasks              (assignee_id FK, optional)
users ──────────────< meeting_project_links (linked_by FK)
meetings ───────────< moms               (meeting_id FK, UNIQUE — one MOM per meeting)
meetings ───────────< meeting_attendees  (meeting_id FK)
meetings ───────────< meeting_project_links (meeting_id FK)
moms ───────────────< mom_key_points     (mom_id FK, CASCADE DELETE)
moms ───────────────< tasks              (mom_id FK, CASCADE DELETE)
```

### Table Definitions

#### `users`
```sql
CREATE TABLE users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100)  NOT NULL,
  email       VARCHAR(150)  NOT NULL UNIQUE,
  password    VARCHAR(255)  NOT NULL,           -- bcrypt hash (12 rounds)
  role        ENUM('admin', 'member') DEFAULT 'member',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `meetings`
```sql
CREATE TABLE meetings (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  title             VARCHAR(255) NOT NULL,
  google_event_id   VARCHAR(255) UNIQUE,        -- From Google Calendar
  meet_link         VARCHAR(500),               -- Google Meet URL
  scheduled_at      DATETIME NOT NULL,
  started_at        DATETIME,                   -- When bot joined
  ended_at          DATETIME,                   -- When recording stopped
  duration_seconds  INT,
  organizer_id      INT,
  status            ENUM('scheduled','recording','processing','completed','failed') DEFAULT 'scheduled',
  audio_path        VARCHAR(500),               -- Server path to .mp3
  claude_file_id    VARCHAR(255),               -- Files API ID (cleared after use)
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organizer_id) REFERENCES users(id)
);
```

#### `moms`
```sql
CREATE TABLE moms (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  meeting_id      INT NOT NULL UNIQUE,
  raw_transcript  LONGTEXT,                     -- Full verbatim transcript
  summary         TEXT NOT NULL,
  is_edited       BOOLEAN DEFAULT FALSE,
  edited_by       INT,
  edited_at       DATETIME,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id),
  FOREIGN KEY (edited_by) REFERENCES users(id)
);
```

#### `mom_key_points`
```sql
CREATE TABLE mom_key_points (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  mom_id       INT NOT NULL,
  point_text   TEXT NOT NULL,
  order_index  INT DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mom_id) REFERENCES moms(id) ON DELETE CASCADE
);
```

#### `tasks`
```sql
CREATE TABLE tasks (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  mom_id       INT NOT NULL,
  title        VARCHAR(500) NOT NULL,
  description  TEXT,
  assigned_to  VARCHAR(200),                    -- AI-extracted name (free text)
  assignee_id  INT,                             -- FK → users.id (optional match)
  deadline     DATE,
  priority     ENUM('high','medium','low') DEFAULT 'medium',
  status       ENUM('pending','in_progress','completed') DEFAULT 'pending',
  is_edited    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (mom_id) REFERENCES moms(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES users(id)
);
```

#### `meeting_attendees`
```sql
CREATE TABLE meeting_attendees (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  meeting_id  INT NOT NULL,
  user_id     INT,                              -- NULL if external attendee
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
  project_id  INT NOT NULL,                     -- BMS project reference
  linked_by   INT,
  linked_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id),
  FOREIGN KEY (linked_by) REFERENCES users(id)
);
```

---

## 5. Full Execution Flow A→Z

This section traces every request and background process through the codebase — file by file, function by function.

---

### FLOW A: Server Boot

```
npm run dev
    │
    ▼
src/server.js → startServer()
    │   1. Imports sequelize from config/db.js
    │   2. sequelize.authenticate() — tests DB connection
    │   3. require('./models/index.js') — loads all 7 models + 10 associations
    │   4. sequelize.sync({ alter: true }) — syncs schema to DB
    │   5. Creates Express app via require('./app.js')
    │   6. app.listen(PORT) — binds HTTP server
    │   7. startScheduler() from services/scheduler.service.js
    │   8. Registers SIGTERM/SIGINT handlers → stopScheduler() + server.close()
    ▼
Server listening on http://localhost:5000
```

**File:** `src/server.js`
**Function:** `startServer()`
**Connects to:** `app.js` (Express routes), `scheduler.service.js` (background jobs)

---

### FLOW B: Express App Setup

```
src/app.js (module-level, executed once on require)
    │
    │   Middleware stack (in order):
    │   1. cors({ origin: process.env.FRONTEND_URL })
    │   2. express.json()
    │   3. express.urlencoded({ extended: true })
    │
    │   Route mounting:
    │   /api/v1/auth      → routes/auth.routes.js
    │   /api/v1/meetings  → routes/meeting.routes.js
    │   /api/v1/mom       → routes/mom.routes.js
    │   /api/v1/tasks     → routes/task.routes.js
    │   /api/v1/bms       → routes/bms.routes.js
    │
    │   404 handler (unknown routes)
    │   Global errorHandler from middleware/errorHandler.js
    ▼
Express app exported to server.js
```

**File:** `src/app.js`
**Connects to:** All 5 route files, `middleware/errorHandler.js`

---

### FLOW C: Background Scheduler (5-Minute Polling)

```
services/scheduler.service.js → startScheduler()
    │
    │   Runs runTick() immediately on start, then every 5 minutes
    │   Uses setInterval(...).unref() so it doesn't block process exit
    │
    ▼
runTick()
    │
    │   Step 1: calendarService.syncMeetings()
    │       → calendar.service.js → syncMeetings()
    │           → getAuthenticatedClient() (config/googleAuth.js)
    │           → fetchUpcomingEvents() — Google Calendar API, next 24h
    │           → extractMeetLink() — finds video entry points
    │           → Meeting.findOne({ where: { google_event_id } })
    │           → create or update Meeting record in DB
    │
    │   Step 2: calendarService.getMeetingsStartingSoon(2)
    │       → finds meetings where scheduled_at is within next 2 minutes
    │       → status must be 'scheduled'
    │
    │   Step 3: For each imminent meeting:
    │       → bot.joinMeeting(meeting)  [lazy-required to avoid circular dep]
    ▼
meetBot.js → joinMeeting(meeting)    (see FLOW D)
```

**File:** `services/scheduler.service.js`
**Functions:** `startScheduler()`, `stopScheduler()`, `runTick()`
**Connects to:** `calendar.service.js`, `bot/meetBot.js`

---

### FLOW D: Google Calendar Sync

```
services/calendar.service.js
    │
    ├── getAuthenticatedClient()
    │       → config/googleAuth.js → getOAuthClient()
    │           Creates OAuth2Client with CLIENT_ID, CLIENT_SECRET, REDIRECT_URI
    │           Sets credentials: { refresh_token: GOOGLE_REFRESH_TOKEN }
    │           Returns authenticated OAuth2Client
    │
    ├── fetchUpcomingEvents(auth)
    │       google.calendar({ version: 'v3', auth })
    │       calendar.events.list({
    │           calendarId: 'primary',
    │           timeMin: now,
    │           timeMax: now + 24h,
    │           singleEvents: true,
    │           orderBy: 'startTime'
    │       })
    │       Filters for events with conferenceData.entryPoints[].entryPointType === 'video'
    │
    ├── extractMeetLink(event)
    │       Returns the 'uri' from the video entry point
    │
    └── syncMeetings()
            For each event:
            → Meeting.findOne({ where: { google_event_id: event.id } })
            → If exists: update title, meet_link, scheduled_at
            → If new: Meeting.create({ title, google_event_id, meet_link, scheduled_at, status: 'scheduled' })
```

**File:** `services/calendar.service.js`
**Key functions:** `fetchUpcomingEvents()`, `extractMeetLink()`, `syncMeetings()`, `getMeetingsStartingSoon(withinMinutes)`
**Connects to:** `config/googleAuth.js`, `models/Meeting.js`

---

### FLOW E: Puppeteer Bot — Join & Record

```
bot/meetBot.js → joinMeeting(meeting)
    │
    │   Deduplication check: if activeSessions.has(meeting.id) → return
    │   meeting.update({ status: 'recording', started_at: now })
    │
    ├── _launchBrowser()
    │       puppeteer.launch({
    │           headless: true,
    │           args: [
    │               '--use-fake-ui-for-media-stream',    // Auto-grant mic/camera
    │               '--use-fake-device-for-media-stream',
    │               '--no-sandbox',
    │               '--disable-setuid-sandbox',
    │               '--disable-dev-shm-usage',
    │               '--disable-gpu'
    │           ]
    │       })
    │       Returns { browser, page }
    │
    ├── page.goto(meeting.meet_link, { waitUntil: 'networkidle0', timeout: 60000 })
    │
    ├── _disableInputDevices(page)
    │       Clicks mute button if aria-pressed !== 'true'
    │       Clicks camera off button if aria-pressed !== 'true'
    │
    ├── _clickJoinButton(page)
    │       Tries 4 CSS selectors sequentially:
    │           '[data-idom-class*="join"]'
    │           'button[jsname="Qx7uuf"]'
    │           '[aria-label*="join" i]'
    │           '[aria-label*="ask to join" i]'
    │       Falls back to page.evaluate() text content search
    │       Throws if no button found after all attempts
    │
    ├── recorder.start(meeting.id)   [bot/recorder.js]
    │       → Generates temp path: temp/meeting_{id}_{timestamp}.webm
    │       → new PuppeteerScreenRecorder(page, {
    │             fps: 15,
    │             videoFrame: { width: 1280, height: 720 },
    │             videoCrf: 23,
    │             videoCodec: 'libvpx-vp9',
    │             videoPreset: 'ultrafast',
    │             followNewTab: false,
    │             isAudioRecord: true
    │         })
    │       → recorder.start(outputPath)
    │       Returns outputPath
    │
    └── _startMonitor(meeting, page, browser, recorder)
            Sets interval every 15 seconds:
            → Checks DOM: page.$('[data-meeting-ended]') or text includes "meeting ended"
            → Hard cap: if elapsed > 4 hours → force end
            → On end detected: _endSession(...)
```

**File:** `bot/meetBot.js`
**Key functions:** `joinMeeting()`, `_launchBrowser()`, `_disableInputDevices()`, `_clickJoinButton()`, `_startMonitor()`, `_endSession()`
**File:** `bot/recorder.js`
**Key functions:** `MeetingRecorder.start(meetingId)`, `MeetingRecorder.stop()`
**Connects to:** `services/ffmpeg.service.js`, `services/claude.service.js`

---

### FLOW F: Meeting End → FFmpeg Conversion

```
bot/meetBot.js → _endSession(meeting, browser, recorder)
    │
    │   Step 1: recorder.stop()
    │       → PuppeteerScreenRecorder.stop()
    │       → Returns rawVideoPath (e.g., temp/meeting_7_1711234567.webm)
    │
    │   Step 2: browser.close()
    │
    │   Step 3: meeting.update({
    │       status: 'processing',
    │       ended_at: now,
    │       duration_seconds: elapsed / 1000
    │   })
    │
    │   Step 4: ffmpegService.convertVideoToAudio(rawVideoPath, audioPath)
    │       → services/ffmpeg.service.js → convertVideoToAudio()
    │           ffmpeg(inputPath)
    │               .noVideo()                   // Strip all video tracks
    │               .audioCodec('libmp3lame')    // MP3 codec
    │               .audioBitrate('128k')        // 128 kbps
    │               .audioChannels(1)            // Mono (halves size)
    │               .audioFrequency(16000)       // 16 kHz (optimal for speech)
    │               .output(audioPath)           // temp/meeting_7_1711234567.mp3
    │           Returns resolved audioPath on 'end' event
    │
    │   Step 5: meeting.update({ audio_path: audioPath })
    │
    │   Step 6: fileManager.deleteFile(rawVideoPath)
    │       → fs.unlink() — removes the raw .webm to free disk space
    │
    │   Step 7: claudeService.generateMOM(meeting.id, audioPath)
    ▼
services/claude.service.js → generateMOM()    (see FLOW G)
```

**File:** `services/ffmpeg.service.js`
**Functions:** `convertVideoToAudio(inputPath, outputPath)`, `getMediaDuration(filePath)`
**File:** `utils/fileManager.js`
**Functions:** `deleteFile(filePath)`, `ensureTempDir()`, `generateTempPath(ext)`
**Connects to:** `services/claude.service.js`

---

### FLOW G: Claude AI — MOM Generation

```
services/claude.service.js → generateMOM(meetingId, audioPath)
    │
    │   Constants:
    │       MODEL = 'claude-sonnet-4-20250514'
    │       FILES_API_BETA = 'files-api-2025-04-14'
    │       MAX_INLINE_BYTES = 32 * 1024 * 1024   (32 MB)
    │
    │   Step 1: fs.statSync(audioPath).size
    │       → If size > 32 MB: use Files API upload path
    │       → If size ≤ 32 MB: use inline base64 path
    │
    │   ── Large File Path (> 32 MB) ──────────────────────────────────────
    │
    ├── uploadToFilesAPI(audioPath)
    │       const formData = new FormData()
    │       formData.append('file', fs.createReadStream(audioPath))
    │       axios.post('https://api.anthropic.com/v1/files', formData, {
    │           headers: {
    │               'x-api-key': ANTHROPIC_API_KEY,
    │               'anthropic-version': '2023-06-01',
    │               'anthropic-beta': 'files-api-2025-04-14',
    │               ...formData.getHeaders()
    │           }
    │       })
    │       Returns fileId (e.g., 'file_011CNha...')
    │
    ├── meeting.update({ claude_file_id: fileId })
    │
    ├── callClaudeWithFileId(fileId)
    │       axios.post('https://api.anthropic.com/v1/messages', {
    │           model: MODEL,
    │           max_tokens: 4096,
    │           messages: [{
    │               role: 'user',
    │               content: [
    │                   { type: 'document', source: { type: 'file', file_id: fileId } },
    │                   { type: 'text', text: MOM_GENERATION_PROMPT }
    │               ]
    │           }]
    │       }, { headers: { 'anthropic-beta': 'files-api-2025-04-14', ... } })
    │
    │   ── Small File Path (≤ 32 MB) ──────────────────────────────────────
    │
    ├── callClaudeWithInlineBase64(audioPath)
    │       const audioBase64 = fs.readFileSync(audioPath).toString('base64')
    │       axios.post('https://api.anthropic.com/v1/messages', {
    │           model: MODEL,
    │           max_tokens: 4096,
    │           messages: [{
    │               role: 'user',
    │               content: [
    │                   { type: 'document', source: {
    │                       type: 'base64',
    │                       media_type: 'audio/mpeg',
    │                       data: audioBase64
    │                   }},
    │                   { type: 'text', text: MOM_GENERATION_PROMPT }
    │               ]
    │           }]
    │       })
    │
    │   ── Both paths converge here ────────────────────────────────────────
    │
    ├── extractTextFromResponse(claudeResponse)
    │       Returns response.data.content[0].text
    │
    ├── mom.parser.js → parseMOMResponse(rawText)    (see FLOW H)
    │       Returns structured { transcript, summary, key_points, tasks, attendees, meeting_date }
    │
    ├── persistMOM(meetingId, parsedMOM)    (see FLOW I)
    │
    └── [finally block — ALWAYS runs]
            deleteFromFilesAPI(fileId)    (if Files API was used)
                axios.delete('https://api.anthropic.com/v1/files/' + fileId, { headers... })
            meeting.update({ claude_file_id: null })
```

**File:** `services/claude.service.js`
**Functions:** `generateMOM()`, `uploadToFilesAPI()`, `deleteFromFilesAPI()`, `callClaudeWithFileId()`, `callClaudeWithInlineBase64()`, `extractTextFromResponse()`, `persistMOM()`
**Connects to:** `services/mom.parser.js`, `models/MOM.js`, `models/Task.js`, `models/MOMKeyPoint.js`

---

### FLOW H: MOM Parser — Claude Response Parsing

```
services/mom.parser.js → parseMOMResponse(rawText)
    │
    │   Step 1: Strip markdown fences if present
    │       const clean = rawText.replace(/```json|```/g, '').trim()
    │
    │   Step 2: Try JSON.parse(clean)
    │       → If successful: proceed with parsed object
    │       → If fails: regex fallback extraction (extracts top-level fields)
    │
    │   Step 3: Validate required fields
    │       → summary must exist and be non-empty string
    │       → If missing: throw Error('Claude response missing required summary field')
    │
    │   Step 4: Normalize all fields
    │       normaliseStringArray(parsed.key_points)   → always returns string[]
    │       normaliseTasks(parsed.tasks)              → validates/defaults each task
    │       normaliseDate(parsed.meeting_date)        → YYYY-MM-DD or null
    │       normaliseStringArray(parsed.attendees)    → always returns string[]
    │
    │   normaliseTasks(tasks):
    │       For each task:
    │           title: String (required, truncate to 500 chars)
    │           description: String or ''
    │           assigned_to: String or 'Unassigned'
    │           deadline: normaliseDate(task.deadline)
    │           priority: normalisePriority(task.priority) → 'high'|'medium'|'low'
    │
    └── Returns clean, validated MOM object
```

**File:** `services/mom.parser.js`
**Functions:** `parseMOMResponse()`, `normaliseStringArray()`, `normaliseTasks()`, `normaliseDate()`, `normalisePriority()`
**Connects to:** `claude.service.js` → `persistMOM()`

---

### FLOW I: Persisting MOM to Database

```
services/claude.service.js → persistMOM(meetingId, parsedMOM)
    │
    │   Runs inside a Sequelize transaction (t)
    │
    │   Step 1: MOM.upsert({ meeting_id: meetingId, summary, raw_transcript })
    │       → Creates or replaces the MOM record for this meeting
    │
    │   Step 2: MOMKeyPoint.destroy({ where: { mom_id } })
    │       → Clears all existing key points (full replacement strategy)
    │   MOMKeyPoint.bulkCreate(key_points.map((text, i) => ({
    │       mom_id, point_text: text, order_index: i
    │   })), { transaction: t })
    │
    │   Step 3: Task.destroy({ where: { mom_id } })  [only on regenerate]
    │       → Clears old AI tasks before inserting new ones
    │   Task.bulkCreate(tasks.map(task => ({
    │       mom_id,
    │       title: task.title,
    │       description: task.description,
    │       assigned_to: task.assigned_to,
    │       deadline: task.deadline,
    │       priority: task.priority,
    │       status: 'pending'
    │   })), { transaction: t })
    │
    │   Step 4: For each attendee name in parsedMOM.attendees:
    │       MeetingAttendee.findOrCreate({ where: { meeting_id, name } })
    │
    │   Step 5: Meeting.update({ status: 'completed' }, { where: { id: meetingId } })
    │
    └── Transaction commits on success; rolls back on any error
        On rollback: Meeting.update({ status: 'failed' })
```

**File:** `services/claude.service.js` → `persistMOM()`
**Models used:** `MOM`, `MOMKeyPoint`, `Task`, `MeetingAttendee`, `Meeting`
**Connects to:** Frontend polls for `status: 'completed'` to display the MOM

---

### FLOW J: HTTP Request — Authentication

```
Client → POST /api/v1/auth/login
    │
    ├── routes/auth.routes.js
    │       router.post('/login', authController.login)
    │
    ├── controllers/auth.controller.js → login(req, res, next)
    │       const { email, password } = req.body
    │       User.findOne({ where: { email } })
    │       bcrypt.compare(password, user.password)
    │       jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
    │       res.json({ token, user: { id, name, email, role } })
    │
    └── Client stores token in localStorage
        Subsequent requests: Authorization: Bearer <token>
```

**File:** `routes/auth.routes.js`, `controllers/auth.controller.js`
**Functions:** `register()`, `login()`, `getMe()`

---

### FLOW K: HTTP Request — Protected Route

```
Client → GET /api/v1/meetings   (Authorization: Bearer <token>)
    │
    ├── routes/meeting.routes.js
    │       router.get('/', authenticate, meetingController.listMeetings)
    │
    ├── middleware/auth.middleware.js → authenticate(req, res, next)
    │       const token = req.headers.authorization?.split(' ')[1]
    │       jwt.verify(token, JWT_SECRET)    → decoded { id, role }
    │       User.findByPk(decoded.id)
    │       req.user = user
    │       next()
    │
    ├── controllers/meeting.controller.js → listMeetings(req, res, next)
    │       Reads query params: status, page, limit
    │       Where clause built from filters
    │       Meeting.findAndCountAll({
    │           where, limit, offset,
    │           include: [{ model: User, as: 'organizer', attributes: ['id','name','email'] }],
    │           order: [['scheduled_at', 'DESC']]
    │       })
    │       res.json({ meetings, total, page, totalPages })
    │
    └── Response to client
```

**File:** `middleware/auth.middleware.js`
**Functions:** `authenticate()`, `requireRole(...roles)`
**File:** `controllers/meeting.controller.js`
**Functions:** `listMeetings()`, `getMeeting()`, `syncCalendar()`, `updateMeetingStatus()`, `deleteMeeting()`

---

### FLOW L: HTTP Request — Edit MOM

```
Client → PUT /api/v1/mom/:id   { summary, key_points: [...] }
    │
    ├── routes/mom.routes.js
    │       router.put('/:id', authenticate, momController.updateMOM)
    │
    ├── controllers/mom.controller.js → updateMOM(req, res, next)
    │       const { summary, key_points } = req.body
    │       const mom = await MOM.findByPk(req.params.id)
    │
    │       Sequelize transaction:
    │           mom.update({ summary, is_edited: true, edited_by: req.user.id, edited_at: now })
    │           MOMKeyPoint.destroy({ where: { mom_id: mom.id } })
    │           MOMKeyPoint.bulkCreate(key_points.map((text, i) => ({ mom_id, point_text: text, order_index: i })))
    │
    │       Re-fetch with include: [MOMKeyPoint, Task]
    │       res.json({ message: 'MOM updated', mom })
    │
    └── Frontend Redux state updated → UI shows "EDITED" badge
```

**File:** `controllers/mom.controller.js`
**Functions:** `getMOMByMeeting()`, `getMOMById()`, `updateMOM()`, `regenerateMOM()`, `searchMOMs()`

---

### FLOW M: HTTP Request — Search MOMs

```
Client → GET /api/v1/mom/search?q=budget+review
    │
    │   IMPORTANT: /search route is registered BEFORE /:meetingId in mom.routes.js
    │   This prevents Express from matching 'search' as a meetingId parameter.
    │
    ├── controllers/mom.controller.js → searchMOMs(req, res, next)
    │       const q = req.query.q?.trim()
    │       if (!q || q.length < 2) → return []
    │
    │       MOM.findAll({
    │           where: {
    │               [Op.or]: [
    │                   { summary: { [Op.like]: `%${q}%` } },
    │                   { raw_transcript: { [Op.like]: `%${q}%` } }
    │               ]
    │           },
    │           include: [
    │               { model: Meeting, as: 'meeting' },
    │               { model: MOMKeyPoint, as: 'keyPoints' }
    │           ],
    │           limit: 50
    │       })
    │       res.json({ results, count })
    │
    └── Frontend highlights matched terms with <mark> tags
```

---

### FLOW N: BMS Project Linking

```
Client → POST /api/v1/bms/link   { meeting_id: 12, project_id: 5 }
    │
    ├── controllers/bms.controller.js → linkMeetingToProject(req, res, next)
    │       Duplicate prevention:
    │       MeetingProjectLink.findOne({ where: { meeting_id, project_id } })
    │       → If exists: return 409 Conflict
    │
    │       MeetingProjectLink.create({ meeting_id, project_id, linked_by: req.user.id })
    │       res.status(201).json({ message: 'Linked', link })
    │
    ├── GET /api/v1/bms/projects
    │       → bms.controller.js → getProjects(req, res, next)
    │           Proxies to BMS_API_URL/projects via Axios
    │           If BMS unavailable: returns [] (graceful degradation)
    │
    └── DELETE /api/v1/bms/link/:id
            → bms.controller.js → removeLink(req, res, next)
                MeetingProjectLink.findByPk + destroy
```

**File:** `controllers/bms.controller.js`
**Functions:** `getProjects()`, `linkMeetingToProject()`, `getLinksForMeeting()`, `removeLink()`

---

## 6. File-by-Function Reference

### `src/server.js`
| Function | Purpose |
|---|---|
| `startServer()` | Authenticates DB, syncs models, starts Express, starts scheduler, registers shutdown handlers |

### `src/app.js`
| Export | Purpose |
|---|---|
| `app` (default) | Configured Express app with all middleware and route mounts |

### `src/config/db.js`
| Export | Purpose |
|---|---|
| `sequelize` | Sequelize instance connected to MySQL with connection pool (max: 10) |

### `src/config/googleAuth.js`
| Function | Purpose |
|---|---|
| `getOAuthClient()` | Returns new OAuth2Client with CLIENT_ID, CLIENT_SECRET, REDIRECT_URI |
| `getAuthenticatedClient()` | Calls getOAuthClient, sets refresh_token credentials, returns ready client |

### `src/models/index.js`
| Purpose |
|---|
| Imports all 7 models, defines all 10 Sequelize associations (hasMany, belongsTo, hasOne) |

### `src/middleware/auth.middleware.js`
| Function | Purpose |
|---|---|
| `authenticate(req, res, next)` | Extracts Bearer token, verifies JWT, fetches user, attaches to req.user |
| `requireRole(...roles)` | Returns middleware that checks req.user.role against allowed roles |

### `src/middleware/errorHandler.js`
| Function | Purpose |
|---|---|
| `errorHandler(err, req, res, next)` | Handles SequelizeValidationError (400), SequelizeUniqueConstraintError (409), generic (500) |

### `src/utils/logger.js`
| Export | Purpose |
|---|---|
| `logger` | Winston instance with console (colorized) + file transports (error.log, combined.log) |

### `src/utils/fileManager.js`
| Function | Purpose |
|---|---|
| `deleteFile(filePath)` | fs.unlink wrapped in promise, logs on error |
| `ensureTempDir()` | Creates temp/ if missing |
| `generateTempPath(ext)` | Returns unique temp path: temp/{uuid}.{ext} |

### `src/services/calendar.service.js`
| Function | Purpose |
|---|---|
| `fetchUpcomingEvents(auth)` | Google Calendar API list for next 24h, filtered to Meet events |
| `extractMeetLink(event)` | Returns video entry point URI from event.conferenceData |
| `syncMeetings()` | Upserts Meeting records per google_event_id |
| `getMeetingsStartingSoon(withinMinutes)` | Finds scheduled meetings starting within N minutes |

### `src/services/ffmpeg.service.js`
| Function | Purpose |
|---|---|
| `convertVideoToAudio(input, output)` | Strips video, encodes MP3 (128k mono 16kHz), returns output path |
| `getMediaDuration(filePath)` | Uses ffprobe to return duration in seconds |

### `src/services/mom.parser.js`
| Function | Purpose |
|---|---|
| `parseMOMResponse(rawText)` | Strips markdown, parses JSON, validates, normalizes all fields |
| `normaliseStringArray(val)` | Coerces to string array, filters empty items |
| `normaliseTasks(tasks)` | Validates/defaults each task field |
| `normaliseDate(val)` | Returns YYYY-MM-DD string or null |
| `normalisePriority(val)` | Returns 'high' / 'medium' / 'low', defaults to 'medium' |

### `src/services/claude.service.js`
| Function | Purpose |
|---|---|
| `generateMOM(meetingId, audioPath)` | Main entry: auto-selects upload method, generates MOM, always cleans up |
| `uploadToFilesAPI(audioPath)` | FormData POST to /v1/files, returns fileId |
| `deleteFromFilesAPI(fileId)` | DELETE /v1/files/:fileId — always called in finally block |
| `callClaudeWithFileId(fileId)` | Messages API call using document source type:'file' |
| `callClaudeWithInlineBase64(audioPath)` | Messages API call using document source type:'base64' |
| `extractTextFromResponse(response)` | Returns response.data.content[0].text |
| `persistMOM(meetingId, parsedMOM)` | DB transaction: upsert MOM, replace keyPoints, replace tasks, add attendees |

### `src/services/scheduler.service.js`
| Function | Purpose |
|---|---|
| `startScheduler()` | Runs first tick immediately, then every 5 minutes (unref'd interval) |
| `stopScheduler()` | Clears the interval on SIGTERM/SIGINT |
| `runTick()` | Syncs calendar → finds imminent meetings → triggers bot |

### `src/bot/recorder.js`
| Class / Method | Purpose |
|---|---|
| `MeetingRecorder` | Wrapper class around PuppeteerScreenRecorder |
| `.start(meetingId)` | Creates recorder with audio config, starts recording, returns output path |
| `.stop()` | Stops recorder, returns final output path |

### `src/bot/meetBot.js`
| Function | Purpose |
|---|---|
| `joinMeeting(meeting)` | Main entry: dedup check, full join + record flow |
| `_launchBrowser()` | Puppeteer launch with fake media + performance flags |
| `_disableInputDevices(page)` | Mutes mic and camera before joining |
| `_clickJoinButton(page)` | 4-selector fallback chain to find and click join |
| `_startMonitor(...)` | 15s interval: checks meeting end + 4h hard cap |
| `_endSession(...)` | Stops recorder, closes browser, converts audio, calls Claude |

### `src/controllers/auth.controller.js`
| Function | Purpose |
|---|---|
| `register(req, res, next)` | Hash password (bcrypt 12 rounds), create user, sign JWT |
| `login(req, res, next)` | Find user, compare password, sign JWT |
| `getMe(req, res, next)` | Return req.user (populated by authenticate middleware) |

### `src/controllers/meeting.controller.js`
| Function | Purpose |
|---|---|
| `listMeetings(req, res, next)` | Paginated + filtered meeting list with organizer include |
| `getMeeting(req, res, next)` | Single meeting with MOM, keyPoints, tasks, attendees, links |
| `syncCalendar(req, res, next)` | Manual trigger for calendar sync |
| `updateMeetingStatus(req, res, next)` | PATCH status field |
| `deleteMeeting(req, res, next)` | Destroy meeting record |

### `src/controllers/mom.controller.js`
| Function | Purpose |
|---|---|
| `getMOMById(req, res, next)` | Fetch MOM by its own PK (used by edit page cold load) |
| `getMOMByMeeting(req, res, next)` | Fetch MOM by meeting_id |
| `updateMOM(req, res, next)` | Replace summary + keyPoints in transaction, set is_edited |
| `regenerateMOM(req, res, next)` | Async re-trigger Claude if audio_path exists |
| `searchMOMs(req, res, next)` | LIKE search across summary and raw_transcript |

### `src/controllers/task.controller.js`
| Function | Purpose |
|---|---|
| `listTasks(req, res, next)` | Filter by meetingId→mom_id, status, priority, with pagination |
| `createTask(req, res, next)` | Manual task creation under a MOM |
| `updateTask(req, res, next)` | Edit task fields, set is_edited: true |
| `deleteTask(req, res, next)` | Destroy task |

### `src/controllers/bms.controller.js`
| Function | Purpose |
|---|---|
| `getProjects(req, res, next)` | Proxy to BMS_API_URL/projects or return [] |
| `linkMeetingToProject(req, res, next)` | Create MeetingProjectLink with duplicate check |
| `getLinksForMeeting(req, res, next)` | Find all links for a meeting_id |
| `removeLink(req, res, next)` | Destroy a specific link by id |

---

## 7. Exact AI Prompt

The following prompt is defined as `MOM_GENERATION_PROMPT` in `src/services/claude.service.js` and is sent verbatim to Claude alongside the audio file on every meeting:

```
You are an expert meeting documentation assistant.
Below is the full audio transcript of a meeting.

Your task is to generate a structured Minutes of Meeting (MOM) document.

Return ONLY a valid JSON object with this exact structure (no preamble, no markdown, no explanation):

{
  "transcript": "<full verbatim transcript of the audio>",
  "summary": "<2-4 sentence executive summary of the meeting>",
  "key_points": [
    "<key discussion point 1>",
    "<key discussion point 2>"
  ],
  "tasks": [
    {
      "title": "<clear task title>",
      "description": "<what needs to be done>",
      "assigned_to": "<name of person responsible, or 'Unassigned'>",
      "deadline": "<YYYY-MM-DD format if mentioned, or null>",
      "priority": "<high | medium | low — infer from urgency of discussion>"
    }
  ],
  "attendees": [
    "<Name 1>",
    "<Name 2>"
  ],
  "meeting_date": "<YYYY-MM-DD if identifiable from conversation, or null>"
}

Rules:
- Extract ALL action items and tasks discussed.
- If a deadline is mentioned verbally (e.g., "by Friday", "end of month"), convert to an approximate date.
- If a task owner is not clearly mentioned, set assigned_to to "Unassigned".
- Key points should capture major topics and decisions, not just a list of everything said.
- Do not hallucinate information not present in the audio.
- Return JSON only.
```

**Model:** `claude-sonnet-4-20250514`
**Max tokens:** `4096`
**Files API beta header:** `anthropic-beta: files-api-2025-04-14`

---

## 8. API Endpoints

### Base URL: `http://localhost:5000/api/v1`

### Auth

| Method | Endpoint | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/auth/register` | No | `{ name, email, password }` | Register new user |
| POST | `/auth/login` | No | `{ email, password }` | Login, returns JWT |
| GET | `/auth/me` | Yes | — | Get current user profile |

### Meetings

| Method | Endpoint | Auth | Query/Body | Description |
|---|---|---|---|---|
| GET | `/meetings` | Yes | `?status=&page=&limit=` | Paginated meeting list |
| GET | `/meetings/:id` | Yes | — | Meeting detail with full relations |
| POST | `/meetings/sync` | Yes | — | Manual Google Calendar sync |
| PATCH | `/meetings/:id/status` | Yes | `{ status }` | Update meeting status |
| DELETE | `/meetings/:id` | Yes | — | Delete meeting |

### MOMs

| Method | Endpoint | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/mom/search` | Yes | `?q=term` | Full-text search across MOMs |
| GET | `/mom/id/:id` | Yes | — | Get MOM by MOM primary key |
| GET | `/mom/:meetingId` | Yes | — | Get MOM by meeting ID |
| PUT | `/mom/:id` | Yes | `{ summary, key_points: [] }` | Edit MOM (tracked) |
| POST | `/mom/:id/regenerate` | Yes | — | Re-run Claude on existing audio |

> **Route ordering note:** `/search` and `/id/:id` are registered before `/:meetingId` in `mom.routes.js` to prevent Express from matching string literals as meeting IDs.

### Tasks

| Method | Endpoint | Auth | Query/Body | Description |
|---|---|---|---|---|
| GET | `/tasks` | Yes | `?meetingId=&status=&priority=&page=&limit=` | Filtered task list |
| POST | `/tasks` | Yes | `{ mom_id, title, description, assigned_to, deadline, priority }` | Create task |
| PUT | `/tasks/:id` | Yes | `{ title, description, assigned_to, deadline, priority, status }` | Edit task (tracked) |
| DELETE | `/tasks/:id` | Yes | — | Delete task |

### BMS

| Method | Endpoint | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/bms/projects` | Yes | — | Fetch available BMS projects |
| POST | `/bms/link` | Yes | `{ meeting_id, project_id }` | Link meeting to project |
| GET | `/bms/links/:meetingId` | Yes | — | Get all project links for a meeting |
| DELETE | `/bms/link/:id` | Yes | — | Remove a project link |

### Response Format

**Success:**
```json
{
  "meeting": { ... },
  "total": 42,
  "page": 1,
  "totalPages": 5
}
```

**Error:**
```json
{
  "error": "Human-readable error message"
}
```

---

## 9. Error Handling Strategy

### Layer 1 — Controller level

All controller functions are `async` and catch errors with `try/catch`, passing them to `next(err)`:

```js
// Pattern used in every controller
export async function listMeetings(req, res, next) {
  try {
    // ... logic
  } catch (err) {
    next(err);   // → errorHandler middleware
  }
}
```

### Layer 2 — Global Error Handler (`middleware/errorHandler.js`)

```
SequelizeValidationError       → HTTP 400 (validation failed)
SequelizeUniqueConstraintError → HTTP 409 (duplicate record)
JsonWebTokenError              → HTTP 401 (invalid token)
TokenExpiredError              → HTTP 401 (token expired)
Generic Error                  → HTTP 500 (internal server error)
```

All errors are logged via `logger.error()` before responding.

### Layer 3 — Service level

- **Claude API failures:** Meeting status set to `'failed'`. Files API file is deleted in `finally` block regardless of success/failure.
- **FFmpeg failures:** Error is logged, meeting status set to `'failed'`, raw video is kept for manual inspection.
- **Puppeteer failures:** Bot catches errors, closes browser if open, logs the error.
- **Calendar sync failures:** `runTick()` catches and logs, does not crash the scheduler.

### Layer 4 — 404 Handler

Unknown routes return:
```json
{ "error": "Route /api/v1/unknown not found" }
```

### Winston Log Files

| File | Contents |
|---|---|
| `logs/error.log` | ERROR level and above only |
| `logs/combined.log` | All levels (debug, info, warn, error) |
| Console | Colorized output in development |

---

## 10. Environment Variables

Create `backend/.env` by copying `.env.example`:

```env
# ── Server ─────────────────────────────────────────────────────────────
PORT=5000
NODE_ENV=development

# ── Database ────────────────────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=3306
DB_NAME=ai_mom_db
DB_USER=root
DB_PASSWORD=your_mysql_password

# ── JWT ─────────────────────────────────────────────────────────────────
JWT_SECRET=your_super_secret_jwt_key_minimum_32_characters
JWT_EXPIRES_IN=7d

# ── Anthropic / Claude ──────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx

# ── Google OAuth2 (Calendar API) ────────────────────────────────────────
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback
GOOGLE_REFRESH_TOKEN=1//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── File Storage ────────────────────────────────────────────────────────
TEMP_DIR=./temp

# ── BMS Integration ─────────────────────────────────────────────────────
BMS_API_URL=http://localhost:4000/api
FRONTEND_URL=http://localhost:3000
```

### How to Obtain Google Credentials

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable **Google Calendar API**
3. Create OAuth2 credentials (Desktop App type)
4. Use the OAuth2 Playground or a one-time script to get a `refresh_token`
5. Store the refresh token in `GOOGLE_REFRESH_TOKEN`

---

## 11. Setup & Installation

### Prerequisites

- Node.js 18+
- MySQL 8.x running locally
- FFmpeg installed and on PATH (`ffmpeg --version` should work)
- Google Cloud project with Calendar API enabled
- Anthropic API key with Files API access

### Steps

```bash
# 1. Clone the repo
git clone <repo-url>
cd ai-mom-system/backend

# 2. Install dependencies
npm install

# 3. Create the MySQL database
mysql -u root -p -e "CREATE DATABASE ai_mom_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 4. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 5. Start the server (syncs DB schema automatically)
npm run dev        # Development (nodemon)
npm start          # Production
```

On first start, Sequelize runs `sync({ alter: true })` which creates all tables automatically. No migrations needed in development.

### Verify Installation

```bash
# Test health
curl http://localhost:5000/api/v1/auth/me
# Expected: 401 Unauthorized (server is running, auth required)

# Register test user
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
# Returns: { "token": "eyJ..." }
```

---

## 12. Known Constraints & Decisions

| # | Constraint | Reason & Impact |
|---|---|---|
| 1 | **No manual audio/video uploads** | All recordings come from the Puppeteer bot exclusively. |
| 2 | **No Google Drive storage** | Direct pipeline (record → FFmpeg → Claude) reduces latency and avoids Drive OAuth complexity. |
| 3 | **Files API is mandatory for audio > 32 MB** | Claude inline base64 limit is 32 MB. A 30-min meeting ≈ 15-20 MB (fits inline); 1-hour ≈ 35-40 MB (requires Files API). |
| 4 | **Files API files must be explicitly deleted** | Anthropic does not auto-delete Files API uploads. Deletion runs in a `finally` block in `generateMOM()` — it runs even if Claude call fails. |
| 5 | **MP3 mono 16kHz conversion** | Reduces file size 10x+ vs raw video while preserving speech quality. Essential for staying under API limits. |
| 6 | **One MOM per meeting** (`meeting_id UNIQUE`) | Enforced at DB level. Regeneration replaces the existing MOM, not creates a new one. |
| 7 | **Tasks are children of MOM, not Meeting** | MOM is the source of truth for AI output. Cascade delete on MOM → tasks. |
| 8 | **Puppeteer requires a display** | On Linux servers use `xvfb-run node src/server.js`. On Windows/Mac, headless mode works natively. |
| 9 | **Route ordering in mom.routes.js** | `/search` and `/id/:id` must be registered BEFORE `/:meetingId`. If reversed, Express matches 'search' as a meetingId integer, causing a DB error. |
| 10 | **Scheduler uses lazy require for meetBot** | Avoids circular dependency: `scheduler → meetBot → claude.service → (nothing back to scheduler)`. Lazy `require()` inside `runTick()` breaks the cycle. |
| 11 | **4-hour meeting hard cap** | Puppeteer monitor enforces a maximum session of 4 hours to prevent runaway processes consuming disk space. |
| 12 | **Claude model: `claude-sonnet-4-20250514`** | Best quality-to-cost ratio. Switch to `claude-opus-4-20250514` if transcription accuracy needs to be maximized. |

---

## 13. Future Improvements

### High Priority

- **WebSocket / SSE for status updates** — Currently the frontend polls every 10-30 seconds. Replace with server-sent events for real-time recording/processing status.
- **Multi-calendar support** — Currently only polls `primary` calendar. Allow users to configure which calendars to monitor.
- **Audio chunking for very long meetings** — Meetings > 2 hours produce ~80 MB audio. While within the 500 MB Files API limit, chunking + merging summaries would improve transcription accuracy.

### Medium Priority

- **Task assignment matching** — The AI extracts `assigned_to` as a free-text name. Add fuzzy matching against the `users` table to auto-populate `assignee_id`.
- **Email notifications** — Send email to attendees when a MOM is generated or when they are assigned a task.
- **Webhook-based Calendar triggers** — Replace 5-minute polling with Google Calendar push notifications for faster meeting detection.
- **MOM versioning** — Store edit history (previous summary/key points) so users can compare or revert changes.
- **Rate limiting** — Add `express-rate-limit` to all endpoints, especially `/auth/login`, to prevent brute-force attacks.

### Low Priority

- **Multi-language support** — Pass detected language to Claude prompt for non-English meetings.
- **Transcript search** — Add MySQL FULLTEXT index on `raw_transcript` for faster full-text search vs current LIKE query.
- **Export to PDF/DOCX** — Allow downloading a MOM as a formatted document.
- **BMS deep integration** — Instead of a proxy API call, use shared MySQL tables with the BMS for real-time project data.
- **Puppeteer pool** — Support multiple concurrent meetings by managing a pool of browser instances instead of the current singleton pattern.

---

*AI MOM System Backend — v1.0.0*
*Author: Pranav*
*Stack: Node.js · Express · MySQL · Claude AI · Puppeteer · FFmpeg · Google Calendar API*
