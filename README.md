# AI MOM System

Automated meeting documentation — records Google Meet, Microsoft Teams, and Zoom sessions via a Chrome Extension, transcribes audio, and generates bilingual Minutes of Meeting (MOM) using AI.

## How it works

1. Each user connects their Google account via the Settings page — their calendar events sync automatically every 30 seconds
2. Install the Chrome Extension on any machine that will attend meetings
3. When a Meet / Teams / Zoom call starts, the extension auto-detects it and begins recording
4. On meeting end, the extension uploads the audio to the backend
5. Backend converts audio to MP3 (FFmpeg), transcribes with OpenAI Whisper, and generates a structured MOM using Claude API
6. MOM is stored in MySQL and visible in the Next.js dashboard immediately

Supports English and Japanese meetings. Japanese meetings produce bilingual output.

## Architecture

```
Chrome Extension (records tab audio — Meet, Teams, Zoom)
  → POST /meetings/upload  (WebM audio)
  → FFmpeg (.webm → .mp3, mono 16kHz)
  → OpenAI Whisper (transcription + language detection)
  → Claude API (structured MOM JSON)
  → MySQL
  → Next.js dashboard
```

Google Calendar API syncs each user's upcoming meetings automatically. When the extension uploads a recording it is matched to the existing calendar event (by Meet link or title + time window) so there are no duplicates.

Audio files (.mp3) are kept for 7 days then auto-deleted by the daily scheduler.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, Redux Toolkit, Tailwind CSS, react-i18next, framer-motion |
| Backend | Node.js, Express.js, MySQL 8, Sequelize |
| AI | Claude API (`claude-sonnet-4-6`), OpenAI Whisper |
| Recording | Chrome Extension MV3 (MediaRecorder + WebRTC hooks) |
| Calendar | Google Calendar API v3 (per-user OAuth2) |
| Audio | FFmpeg (fluent-ffmpeg) |
| Email | Nodemailer (SMTP — forgot password + MOM sharing) |

## Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8
- FFmpeg installed and on PATH
- Google Cloud project with Calendar API + People API + OAuth2 credentials
- Anthropic API key (`claude-sonnet-4-6`)
- OpenAI API key (Whisper transcription)
- Google Chrome (for the extension)
- SMTP account for password reset emails (Gmail App Password recommended)

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in your keys
node scripts/seed.js   # creates DB, tables, and default users
npm start
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in.

### Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `chrome-extension/` folder
4. Click the AI MOM icon → enter your server URL, email and password → **Log In**

The extension remembers your session — you only need to log in once.

## Environment Variables

**Backend `.env`**
```
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

DB_HOST=localhost
DB_PORT=3306
DB_NAME=ai_mom_db
DB_USER=root
DB_PASSWORD=your_password

JWT_SECRET=your_64_char_random_secret
JWT_EXPIRES_IN=7d
PASSWORD_MIN_LENGTH=10
PASSWORD_RESET_TOKEN_TTL_MINUTES=15

ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/auth/google/callback

FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
TEMP_DIR=./temp

# SMTP — for forgot-password emails and MOM sharing
# Gmail: create an App Password at https://myaccount.google.com/apppasswords
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="AI MOM System" <you@gmail.com>
```

**Frontend `.env.local`**
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

## Features

### Meeting Recording
- **Google Meet** — auto-detected via DOM, starts recording 3 s after joining
- **Microsoft Teams** — detected via call controls and URL pattern
- **Zoom** (web client `app.zoom.us`) — detected via URL path `/wc/{id}/start|join`
- All platforms use the same WebRTC hook (`hook.js`) — no platform-specific recording code

### Access Control
- Admin sees all meetings and MOMs
- Members only see meetings they attended (as organiser or attendee)
- If a task from a meeting is assigned to a user who wasn't an attendee, they get `task_only` access — can read the MOM and see only their own tasks

### User Management
- Admin can add and delete users via **Settings → User Management**
- Roles: `admin` (full access) and `member` (own meetings only)

### Notifications
- In-app bell with unread count
- Notifications for: task assigned, deadline reminder (24 h before), meeting starting soon
- Clicking a notification navigates directly to the relevant MOM

### Forgot Password
- Users can request a reset link at `/forgot-password`
- Link sent via SMTP, expires in 15 minutes
- Confirmation email sent on successful reset

### MOM Sharing
- Share any MOM via email (HTML formatted) or Google Chat webhook
- Available from the MOM detail page

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → enable **Google Calendar API** and **People API**
3. Create OAuth 2.0 credentials (Web application)
4. Add authorised redirect URI: `http://localhost:5000/api/v1/auth/google/callback`
5. Copy Client ID and Secret into `.env`
6. Each user connects their own Google account via **Settings → Connect Google Calendar**

## Project Structure

```
ai-mom-system/
├── backend/
│   ├── src/
│   │   ├── controllers/    auth, meeting, mom, momShare, task, notification, user
│   │   ├── models/         Meeting, MOM, Task, User, MeetingAttendee, Notification
│   │   ├── routes/         REST API routes
│   │   ├── services/       calendar, claude, ffmpeg, notification, scheduler
│   │   ├── utils/          logger, meetingAccess, passwordPolicy
│   │   ├── config/         db, googleAuth
│   │   └── middleware/     auth, errorHandler, rateLimit
│   ├── scripts/
│   │   └── seed.js         Creates DB + tables + default users + demo data
│   └── temp/               Audio files — .webm deleted after processing, .mp3 kept 7 days
├── frontend/
│   ├── app/                Next.js App Router pages
│   ├── components/         UI components (layout, meetings, mom, tasks, auth)
│   ├── store/slices/       Redux state (auth, meetings, mom, tasks, ui, notifications)
│   └── i18n/               en.json, ja.json
└── chrome-extension/
    ├── manifest.json       MV3 — matches Meet, Teams, Zoom
    ├── background.js       Service worker — auth, upload, badge
    ├── content.js          Platform-aware meeting detector (Meet / Teams / Zoom)
    ├── hook.js             MAIN world — hooks RTCPeerConnection + getUserMedia
    └── popup.html/js       Login form + status display
```

## Default Accounts

Run `node backend/scripts/seed.js` to create these accounts, tables, and sample data.
The seed script also creates the database if it does not exist.

| Role | Email | Password |
|---|---|---|
| Admin | developer@mosaique.link | Admin@123 |
| Member | pranavswordsman5335@gmail.com | Pranav@2003 |
| Member | bala@mosaique.link | Bala@123 |

## Logging

Console output is set to `warn` level by default to reduce noise. Full `debug` logs (including all SQL queries) are always written to `backend/logs/combined.log`.

| Env var | Effect |
|---|---|
| `CONSOLE_LOG_LEVEL=info` | Show info-level logs in console |
| `SEQUELIZE_DEBUG=true` | Print every SQL query to console |

## Documentation

See [PROJECTDETAIL.md](PROJECTDETAIL.md) for full technical documentation including database schema, API reference, and pipeline details.

## License

MIT
