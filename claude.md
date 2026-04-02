# CLAUDE.md — AI MOM (Minutes of Meeting) System

> **Project Codename:** AI-MOM
> **Version:** 1.0.0
> **Author:** Pranav
> **Tech Stack:** Next.js · Redux · Axios · Node.js (Express.js) · MySQL · Claude API · Google Calendar API · Puppeteer · Google Drive API · FFmpeg

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture & Workflow](#2-architecture--workflow)
3. [Tech Stack Details](#3-tech-stack-details)
4. [Claude API — Capabilities, Limits & Usage](#4-claude-api--capabilities-limits--usage)
5. [Database Design](#5-database-design)
6. [Project Folder Structure](#6-project-folder-structure)
7. [Backend API Design](#7-backend-api-design)
8. [Frontend Module Design](#8-frontend-module-design)
9. [Google Calendar + Puppeteer Bot](#9-google-calendar--puppeteer-bot)
10. [Audio Conversion with FFmpeg](#10-audio-conversion-with-ffmpeg)
11. [MOM & Task Generation — AI Prompting Strategy](#11-mom--task-generation--ai-prompting-strategy)
12. [Editable MOM & Tasks](#12-editable-mom--tasks)
13. [BMS Project Linking](#13-bms-project-linking)
14. [Environment Variables](#14-environment-variables)
15. [Development Phases & Milestones](#15-development-phases--milestones)
16. [Known Constraints & Decisions](#16-known-constraints--decisions)

---

## 1. Project Overview

The **AI MOM System** automates the full lifecycle of meeting documentation — from detecting and recording Google Meet sessions to generating structured Minutes of Meeting (MOM) using Claude AI.

### Goals
- Automatically detect scheduled Google Meet meetings via Google Calendar API
- Join and record meetings using a Puppeteer-based bot
- Convert recorded video to audio using FFmpeg
- Send audio to Claude API for transcription and MOM generation
- Store MOM, key points, action items, and tasks in MySQL
- Allow users to **edit** generated MOM and tasks via the frontend
- Link MOMs and tasks to projects in the **BMS (Business Management System)**

### Out of Scope (Excluded by Design)
- ❌ No offline file uploads (audio/video upload by users is excluded)
- ❌ No Google Drive intermediate storage (direct pipeline: record → convert → Claude → DB)

---

## 2. Architecture & Workflow

```
Google Calendar API
        │
        ▼
  Meeting Detected (trigger)
        │
        ▼
  Puppeteer Bot
  - Joins Google Meet link
  - Records meeting (screen + audio capture)
        │
        ▼
  Raw Video File (.webm / .mp4)
  saved locally on server
        │
        ▼
  FFmpeg Audio Converter
  - Converts video → audio (.mp3 / .wav)
  - Strips video, keeps audio track only
        │
        ▼
  Claude API (Files API / inline base64)
  - Audio file sent to Claude
  - Claude transcribes the audio
  - Claude generates structured MOM using AI prompting
        │
        ▼
  MOM Parser (Node.js)
  - Parses Claude's JSON response
  - Extracts: Summary, Key Points, Action Items, Tasks
        │
        ▼
  MySQL Database
  - Stores Meeting, MOM, Tasks
        │
        ▼
  Frontend (Next.js)
  - Displays generated MOM and Tasks
  - Users can EDIT MOM content and Tasks
  - Links MOM to BMS Project
```

### Key Design Decision
> **No Google Drive intermediate storage.** The meeting recording is processed directly on the server, converted to audio by FFmpeg, and sent straight to Claude API. This reduces latency and avoids OAuth token management for Drive uploads/downloads in the critical path.

---

## 3. Tech Stack Details

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 14+ (App Router) | UI, routing, SSR |
| State Management | Redux Toolkit | Global state for MOM, tasks, meetings |
| HTTP Client | Axios | API calls from frontend |
| Backend | Node.js + Express.js | REST API server |
| Database | MySQL 8.x | Persistent storage |
| ORM | Sequelize | DB models and queries |
| AI | Claude API (Anthropic) | Transcription + MOM generation |
| Bot | Puppeteer | Automated Google Meet joining & recording |
| Calendar | Google Calendar API v3 | Meeting detection and scheduling |
| Audio Processing | FFmpeg (via fluent-ffmpeg) | Video → Audio conversion |
| Auth | JWT (jsonwebtoken) | User authentication |
| File Handling | Multer + fs | Temporary audio file management |
| Environment | dotenv | Secrets and config management |

---

## 4. Claude API — Capabilities, Limits & Usage

This is the most critical section. Understand these constraints before building.

### 4.1 Model to Use
```
claude-sonnet-4-20250514
```
- Use **Claude Sonnet 4** (latest stable). Do not use Haiku for transcription; quality will be poor.
- Opus 4 can be used if transcription accuracy needs to be highest priority (higher cost).

### 4.2 Audio File Support
- Claude API **does support audio files** (MP3, WAV) for transcription.
- Audio upload works via the **Messages API** by sending the file as a base64-encoded block.
- **Important:** Audio support via the API is available and actively supported.

### 4.3 File Size Limits

| Method | Max File Size | Notes |
|---|---|---|
| Inline (base64 in Messages API) | ~32 MB | Direct in the request body |
| Files API (Beta) | **500 MB** | Upload once, reuse via `file_id` |
| Claude.ai Chat UI | 30 MB | Not relevant for our system (we use API) |

**Recommendation for this project:**
- For meeting audio files, use the **Files API** (500 MB limit).
- A typical 1-hour meeting audio at 128kbps MP3 ≈ ~55–60 MB. So Files API is mandatory for longer meetings.
- Short meetings (< 30 mins) ≈ under 30 MB → can use inline base64 as fallback.

### 4.4 Files API Usage (Beta — Required Header)

```js
// Step 1: Upload audio file to Files API
const formData = new FormData();
formData.append('file', fs.createReadStream('./meeting_audio.mp3'));

const uploadResponse = await axios.post(
  'https://api.anthropic.com/v1/files',
  formData,
  {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',  // REQUIRED BETA HEADER
      ...formData.getHeaders()
    }
  }
);

const fileId = uploadResponse.data.id; // e.g., "file_011CNha..."

// Step 2: Use file_id in Messages API call
const momResponse = await axios.post(
  'https://api.anthropic.com/v1/messages',
  {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'file',
              file_id: fileId   // Reference the uploaded file
            }
          },
          {
            type: 'text',
            text: MOM_GENERATION_PROMPT  // See Section 11
          }
        ]
      }
    ]
  },
  {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
      'Content-Type': 'application/json'
    }
  }
);

// Step 3: Delete the file after processing (Files API does NOT auto-delete)
await axios.delete(
  `https://api.anthropic.com/v1/files/${fileId}`,
  {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14'
    }
  }
);
```

> ⚠️ **Important:** Files uploaded via the Files API are **retained until explicitly deleted**. Always delete the file after MOM generation to avoid storage buildup and unexpected costs.

### 4.5 Context Window
- Claude Sonnet 4 supports **200,000 token** context window.
- A 1-hour meeting transcript ≈ ~10,000–15,000 tokens. Well within limits.
- MOM output will be ≈ 500–2,000 tokens.

### 4.6 Rate Limits (API)
- Rate limits depend on your Anthropic API tier.
- For typical usage (1–5 meetings/day), standard tier is sufficient.
- Monitor via Anthropic Console dashboard.

---

## 5. Database Design

### 5.1 ERD Overview

```
users ──────────────< meetings
meetings ───────────< moms
moms ───────────────< mom_key_points
moms ───────────────< tasks
meetings >──────────< bms_projects  (via meeting_project_links)
```

### 5.2 Table Definitions

#### `users`
```sql
CREATE TABLE users (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  email        VARCHAR(150) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,
  role         ENUM('admin', 'member') DEFAULT 'member',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `meetings`
```sql
CREATE TABLE meetings (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  title             VARCHAR(255) NOT NULL,
  google_event_id   VARCHAR(255) UNIQUE,          -- From Google Calendar API
  meet_link         VARCHAR(500),                  -- Google Meet URL
  scheduled_at      DATETIME NOT NULL,             -- From Calendar event
  started_at        DATETIME,                      -- When bot actually joined
  ended_at          DATETIME,                      -- When recording stopped
  duration_seconds  INT,                           -- Actual duration
  organizer_id      INT,                           -- FK → users.id
  status            ENUM('scheduled', 'recording', 'processing', 'completed', 'failed') DEFAULT 'scheduled',
  audio_path        VARCHAR(500),                  -- Local server path to .mp3 file
  claude_file_id    VARCHAR(255),                  -- Files API file_id (cleared after use)
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organizer_id) REFERENCES users(id)
);
```

#### `moms`
```sql
CREATE TABLE moms (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  meeting_id       INT NOT NULL UNIQUE,            -- One MOM per meeting
  raw_transcript   LONGTEXT,                       -- Full Claude transcription
  summary          TEXT NOT NULL,                   -- AI-generated summary
  is_edited        BOOLEAN DEFAULT FALSE,           -- True if user manually edited
  edited_by        INT,                             -- FK → users.id
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
  point_text  TEXT NOT NULL,
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
  assigned_to   VARCHAR(200),                      -- Name extracted by AI (may not be a user)
  assignee_id   INT,                               -- FK → users.id (optional, if matched)
  deadline      DATE,                              -- AI-extracted deadline
  priority      ENUM('high', 'medium', 'low') DEFAULT 'medium',
  status        ENUM('pending', 'in_progress', 'completed') DEFAULT 'pending',
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
  user_id     INT,                                 -- NULL if external attendee
  name        VARCHAR(100),
  email       VARCHAR(150),
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### `meeting_project_links` (BMS Integration)
```sql
CREATE TABLE meeting_project_links (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  meeting_id  INT NOT NULL,
  project_id  INT NOT NULL,                        -- FK to BMS projects table
  linked_by   INT,                                 -- FK → users.id
  linked_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id),
  FOREIGN KEY (linked_by) REFERENCES users(id)
);
```

> **Note:** `project_id` references the BMS `projects` table. This assumes BMS shares the same MySQL database or uses a common DB connection. If BMS is a separate service, `project_id` will be a logical reference only, and API calls will be made to BMS endpoints.

---

## 6. Project Folder Structure

```
ai-mom/
├── frontend/                          # Next.js App
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                   # Dashboard
│   │   ├── meetings/
│   │   │   ├── page.tsx               # Meeting list
│   │   │   └── [id]/
│   │   │       └── page.tsx           # Meeting detail + MOM view
│   │   ├── mom/
│   │   │   └── [id]/
│   │   │       ├── page.tsx           # MOM view
│   │   │       └── edit/
│   │   │           └── page.tsx       # MOM edit page
│   │   └── tasks/
│   │       └── page.tsx               # Task list + filters
│   ├── components/
│   │   ├── MOMViewer.tsx              # Read-only MOM display
│   │   ├── MOMEditor.tsx              # Editable MOM form
│   │   ├── TaskCard.tsx               # Single task display
│   │   ├── TaskEditor.tsx             # Editable task form
│   │   ├── MeetingCard.tsx
│   │   └── ProjectLinker.tsx          # BMS project link UI
│   ├── store/
│   │   ├── index.ts
│   │   ├── slices/
│   │   │   ├── meetingSlice.ts
│   │   │   ├── momSlice.ts
│   │   │   └── taskSlice.ts
│   ├── services/
│   │   └── api.ts                     # Axios instance + API calls
│   └── ...
│
├── backend/                           # Express.js API Server
│   ├── src/
│   │   ├── app.js                     # Express app setup
│   │   ├── server.js                  # Server entry point
│   │   ├── config/
│   │   │   ├── db.js                  # MySQL / Sequelize config
│   │   │   └── googleAuth.js          # Google OAuth2 config
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Meeting.js
│   │   │   ├── MOM.js
│   │   │   ├── MOMKeyPoint.js
│   │   │   ├── Task.js
│   │   │   └── MeetingAttendee.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── meeting.routes.js
│   │   │   ├── mom.routes.js
│   │   │   ├── task.routes.js
│   │   │   └── bms.routes.js
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── meeting.controller.js
│   │   │   ├── mom.controller.js
│   │   │   ├── task.controller.js
│   │   │   └── bms.controller.js
│   │   ├── services/
│   │   │   ├── claude.service.js      # Claude API integration
│   │   │   ├── calendar.service.js    # Google Calendar API
│   │   │   ├── ffmpeg.service.js      # Audio conversion
│   │   │   └── mom.parser.js          # Parse Claude JSON response
│   │   ├── bot/
│   │   │   ├── meetBot.js             # Puppeteer bot logic
│   │   │   └── recorder.js            # Recording management
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js     # JWT validation
│   │   │   └── errorHandler.js
│   │   └── utils/
│   │       ├── fileManager.js         # Temp file cleanup
│   │       └── logger.js
│   ├── temp/                          # Temporary audio/video files (gitignored)
│   ├── .env
│   └── package.json
│
└── README.md
```

---

## 7. Backend API Design

### Base URL: `/api/v1`

### Auth Routes
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register a new user |
| POST | `/auth/login` | Login, returns JWT |
| GET | `/auth/me` | Get current user |

### Meeting Routes
| Method | Endpoint | Description |
|---|---|---|
| GET | `/meetings` | List all meetings (with filters) |
| GET | `/meetings/:id` | Get single meeting detail |
| POST | `/meetings/sync` | Manually trigger Google Calendar sync |
| PATCH | `/meetings/:id/status` | Update meeting status |
| DELETE | `/meetings/:id` | Delete a meeting record |

### MOM Routes
| Method | Endpoint | Description |
|---|---|---|
| GET | `/mom/:meetingId` | Get MOM for a meeting |
| PUT | `/mom/:id` | **Edit** MOM summary and key points |
| POST | `/mom/:id/regenerate` | Re-trigger AI to regenerate MOM |
| GET | `/mom/search?q=` | Full-text search across MOMs |

### Task Routes
| Method | Endpoint | Description |
|---|---|---|
| GET | `/tasks?meetingId=` | List tasks for a meeting |
| GET | `/tasks?status=&assignee=` | Filtered task list |
| POST | `/tasks` | Create a task manually |
| PUT | `/tasks/:id` | **Edit** a task (title, deadline, assignee, status, priority) |
| DELETE | `/tasks/:id` | Delete a task |

### BMS Linking Routes
| Method | Endpoint | Description |
|---|---|---|
| POST | `/bms/link` | Link a meeting to a BMS project |
| GET | `/bms/links/:meetingId` | Get project links for a meeting |
| DELETE | `/bms/link/:id` | Remove a project link |
| GET | `/bms/projects` | Fetch available BMS projects (for dropdown) |

---

## 8. Frontend Module Design

### Pages

#### `/meetings` — Meeting List
- Shows all meetings with status badges (scheduled / recording / processing / completed / failed)
- Real-time status refresh using polling or WebSocket
- Click to navigate to meeting detail

#### `/meetings/[id]` — Meeting Detail
- Shows meeting metadata (title, time, attendees, duration)
- Shows MOM summary, key points
- Shows task list
- "Edit MOM" button → navigates to `/mom/[id]/edit`
- "Link to Project" button → opens ProjectLinker modal

#### `/mom/[id]/edit` — MOM Editor
- Editable rich-text or textarea for Summary
- Add / remove / reorder Key Points (draggable list or simple text inputs)
- Save changes → PUT `/api/v1/mom/:id`
- Shows "Last edited by [user] at [time]" if previously edited

#### `/tasks` — Task Dashboard
- Table/card view of all tasks
- Filter by: status, priority, assignee, meeting
- Inline edit for status changes
- Click task to open full edit modal

### Redux Slices

```
meetingSlice  → { meetings: [], currentMeeting: {}, status: '' }
momSlice      → { currentMOM: { summary, keyPoints, transcript }, loading }
taskSlice     → { tasks: [], filters: { status, assignee } }
```

---

## 9. Google Calendar + Puppeteer Bot

### 9.1 Google Calendar API Flow

```js
// calendar.service.js
const { google } = require('googleapis');

async function getUpcomingMeetings(auth) {
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date().toISOString(),
    timeMax: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // next 24h
    singleEvents: true,
    orderBy: 'startTime',
  });

  return res.data.items.filter(event =>
    event.conferenceData?.entryPoints?.some(e => e.entryPointType === 'video')
  );
}
```

- Poll Google Calendar every 5 minutes (or use **push notifications / webhooks** for production).
- When a meeting is detected within 2 minutes of start time → trigger Puppeteer bot.

### 9.2 Puppeteer Bot

```
meetBot.js responsibilities:
1. Launch Chromium with audio capture enabled
2. Navigate to Google Meet link
3. Dismiss popups (camera/mic permission dialogs)
4. Click "Join" button
5. Start recording using puppeteer-screen-recorder or similar
6. Monitor meeting end (detect "Meeting ended" UI element or poll duration)
7. Stop recording → save .webm / .mp4 to /backend/temp/
8. Trigger FFmpeg conversion → trigger Claude processing
```

**Key packages:**
```json
"puppeteer": "^21.x",
"puppeteer-screen-recorder": "^2.x"
```

> ⚠️ **Note:** Puppeteer bot runs on the server machine. For cloud deployment, ensure the server has a display (use `xvfb` on Linux) and Chrome/Chromium is installed.

---

## 10. Audio Conversion with FFmpeg

### Why Convert?
- Claude API works significantly better on **audio files** than video files.
- Video files contain large amounts of unnecessary visual data.
- Converting to MP3 reduces file size drastically (a 500MB .webm → ~60MB .mp3).

### Conversion Logic

```js
// ffmpeg.service.js
const ffmpeg = require('fluent-ffmpeg');

async function convertVideoToAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()                     // Strip video track
      .audioCodec('libmp3lame')      // MP3 codec
      .audioBitrate('128k')          // 128kbps — good balance of quality vs size
      .audioChannels(1)              // Mono — sufficient for speech, halves file size
      .audioFrequency(16000)         // 16kHz — optimal for speech recognition
      .output(outputPath)
      .on('end', () => {
        console.log(`Converted: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => reject(err))
      .run();
  });
}
```

### File Size Estimation

| Meeting Duration | Raw Video (.webm) | Converted Audio (.mp3, 128kbps mono 16kHz) |
|---|---|---|
| 30 minutes | ~200–300 MB | ~15–20 MB |
| 1 hour | ~400–600 MB | ~30–40 MB |
| 2 hours | ~800 MB–1.2 GB | ~60–80 MB |

> All values are well within the **500 MB Files API limit**.

---

## 11. MOM & Task Generation — AI Prompting Strategy

### claude.service.js

```js
const MOM_GENERATION_PROMPT = `
You are an expert meeting documentation assistant.
Below is the full audio transcript of a meeting. 

Your task is to generate a structured Minutes of Meeting (MOM) document.

Return ONLY a valid JSON object with this exact structure (no preamble, no markdown, no explanation):

{
  "transcript": "<full verbatim transcript of the audio>",
  "summary": "<2-4 sentence executive summary of the meeting>",
  "key_points": [
    "<key discussion point 1>",
    "<key discussion point 2>",
    ...
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
`;
```

### Parsing the Response

```js
// mom.parser.js
function parseMOMResponse(claudeText) {
  try {
    const clean = claudeText.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    throw new Error('Failed to parse Claude MOM response: ' + err.message);
  }
}
```

---

## 12. Editable MOM & Tasks

### Design Principle
> Every AI-generated MOM and task can be fully edited by authorized users via the frontend. All edits are tracked.

### MOM Editing
- **What can be edited:** `summary`, `key_points` (add, remove, reorder)
- **What cannot be edited via UI:** `raw_transcript` (immutable log)
- **Tracking:** `is_edited`, `edited_by`, `edited_at` fields in `moms` table
- **Endpoint:** `PUT /api/v1/mom/:id`
  ```json
  {
    "summary": "Updated summary text...",
    "key_points": [
      "Updated point 1",
      "New point added by user",
      "Another point"
    ]
  }
  ```

### Task Editing
- **What can be edited:** `title`, `description`, `assigned_to`, `assignee_id`, `deadline`, `priority`, `status`
- **Tracking:** `is_edited`, `updated_at` fields in `tasks` table
- **Endpoint:** `PUT /api/v1/tasks/:id`
  ```json
  {
    "title": "Updated task title",
    "assigned_to": "Pranav",
    "deadline": "2025-04-15",
    "priority": "high",
    "status": "in_progress"
  }
  ```

### Frontend Edit Flow
```
MOM Detail Page
    └── [Edit MOM] button
            ↓
    MOMEditor component (textarea + list editor)
            ↓
    Redux action → Axios PUT /api/v1/mom/:id
            ↓
    Success → Redux state updated → UI re-renders with edited badge
```

---

## 13. BMS Project Linking

### What is BMS?
BMS (Business Management System) is the existing project management system. MOMs and tasks generated from meetings need to be **linked to BMS projects** for context and traceability.

### Linking Flow
1. After a MOM is generated, user opens the Meeting Detail page
2. User clicks **"Link to Project"**
3. A dropdown loads available BMS projects (`GET /api/v1/bms/projects`)
4. User selects a project → `POST /api/v1/bms/link`
5. The `meeting_project_links` table stores the relation

### API Request
```json
POST /api/v1/bms/link
{
  "meeting_id": 12,
  "project_id": 5
}
```

### BMS Projects Source
- If BMS shares the same DB: query `bms_projects` table directly.
- If BMS is a separate service: call BMS REST API endpoint and proxy the response.

---

## 14. Environment Variables

### Backend `.env`
```env
# Server
PORT=5000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=ai_mom_db
DB_USER=root
DB_PASSWORD=your_mysql_password

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=7d

# Claude API
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx

# Google OAuth2 (for Calendar API)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback
GOOGLE_REFRESH_TOKEN=your_refresh_token

# File Paths
TEMP_DIR=./temp

# BMS Integration
BMS_API_URL=http://localhost:4000/api   # Or same DB connection
```

### Frontend `.env.local`
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

---

## 15. Development Phases & Milestones

### Phase 1 — Foundation (Week 1)
- [ ] Initialize Next.js frontend and Express.js backend
- [ ] MySQL database setup and Sequelize model definitions
- [ ] JWT auth (register, login, me)
- [ ] Basic meeting CRUD APIs

### Phase 2 — Calendar & Bot (Week 2)
- [ ] Google Calendar API integration (OAuth2 + event fetching)
- [ ] Puppeteer bot — join Meet link, basic recording
- [ ] FFmpeg audio conversion service

### Phase 3 — Claude AI Integration (Week 3)
- [ ] Files API integration for audio upload
- [ ] Claude MOM generation with structured JSON prompting
- [ ] MOM parser — extract and store summary, key points, tasks in DB

### Phase 4 — Frontend MOM & Tasks (Week 4)
- [ ] Meeting list and detail pages
- [ ] MOM viewer component
- [ ] MOM editor (editable summary + key points)
- [ ] Task list with filters
- [ ] Task editor (inline + modal)

### Phase 5 — BMS Integration & Polish (Week 5)
- [ ] BMS project linking API and UI
- [ ] Search and filter across MOMs
- [ ] Status tracking and error handling
- [ ] Testing, cleanup, deployment prep

---

## 16. Known Constraints & Decisions

| # | Constraint / Decision | Reason |
|---|---|---|
| 1 | **No offline file uploads** | Requirement from Pavithra. All recordings come from the Puppeteer bot only. |
| 2 | **No Google Drive intermediate storage** | Direct pipeline reduces latency and complexity. Audio goes directly to Claude. |
| 3 | **Files API (beta) is required** | Meeting audio > 30 MB requires Files API (500 MB limit). Must include `anthropic-beta: files-api-2025-04-14` header in all Files API calls. |
| 4 | **Convert video to audio before sending to Claude** | Claude performs better on audio than video. MP3 mono 16kHz drastically reduces file size without losing speech quality. |
| 5 | **Claude does not natively support audio** via the standard Messages API without Files API for large files | Base64 inline works for < 32 MB; Files API for anything larger. |
| 6 | **Delete files from Files API after use** | Files API files are retained indefinitely until deleted. Auto-delete after MOM generation is mandatory. |
| 7 | **Puppeteer requires a display on Linux servers** | Use `xvfb-run` or a virtual framebuffer for headless Linux server deployments. |
| 8 | **MOM editing tracks authorship** | `is_edited`, `edited_by`, `edited_at` fields in `moms` and `tasks` ensure accountability and audit trail. |
| 9 | **Claude model: `claude-sonnet-4-20250514`** | Best balance of quality and cost. Opus 4 available if higher accuracy needed. |
| 10 | **Tasks linked to MOM, not directly to Meeting** | A meeting has one MOM; tasks belong to that MOM. Cascade delete is enabled. |

---

*End of CLAUDE.md — AI MOM System*
*Keep this file updated as the project evolves.*