# AI MOM System

Automated meeting documentation — records Google Meet sessions via a Chrome Extension, transcribes audio, and generates bilingual Minutes of Meeting (MOM) using AI.

## How it works

1. Each user connects their Google account via the Settings page — their calendar events sync automatically
2. Install the Chrome Extension on any machine that will attend meetings
3. When a Google Meet call starts, the extension auto-detects it and begins recording
4. On meeting end, the extension uploads the audio to the backend
5. Backend converts audio to MP3 (FFmpeg), transcribes with OpenAI Whisper, and generates a structured MOM using Claude API
6. MOM is stored in MySQL and visible in the Next.js dashboard immediately

Supports English and Japanese meetings. Japanese meetings produce bilingual output.

## Architecture

```
Chrome Extension (records tab audio)
  → POST /meetings/upload  (WebM audio)
  → FFmpeg (.webm → .mp3, mono 16kHz)
  → OpenAI Whisper (transcription + language detection)
  → Claude API (structured MOM JSON)
  → MySQL
  → Next.js dashboard
```

Google Calendar API syncs each user's upcoming meetings into the dashboard automatically every 30 seconds. When the extension uploads a recording, it is matched to the existing calendar event (by Meet link or title + time window) so there are no duplicates.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, Redux Toolkit, Tailwind CSS, react-i18next |
| Backend | Node.js, Express.js, MySQL 8, Sequelize |
| AI | Claude API (`claude-sonnet-4-6`), OpenAI Whisper |
| Recording | Chrome Extension (MV3, MediaRecorder API) |
| Calendar | Google Calendar API v3 (per-user OAuth2) |
| Audio | FFmpeg (fluent-ffmpeg) |

## Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8
- FFmpeg installed and on PATH
- Google Cloud project with Calendar API + People API + OAuth2 credentials
- Anthropic API key (`claude-sonnet-4-6`)
- OpenAI API key (Whisper transcription)
- Google Chrome (for the extension)

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in your keys
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
4. Log in to the web app, then use the extension popup to save your JWT token

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

ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/auth/google/callback

FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe

TEMP_DIR=./temp
```

**Frontend `.env.local`**
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → enable **Google Calendar API** and **People API**
3. Create OAuth 2.0 credentials (Web application)
4. Add authorised redirect URI: `http://localhost:5000/api/v1/auth/google/callback`
5. Copy Client ID and Secret into `.env`
6. Each user connects their own Google account via **Settings → Connect Google Calendar** in the app

No shared refresh token needed — each user authenticates individually.

## Project Structure

```
ai-mom-system/
├── backend/
│   ├── src/
│   │   ├── controllers/    meeting, auth, mom, task, notification, user
│   │   ├── models/         Meeting, MOM, Task, User, MeetingAttendee, Notification
│   │   ├── routes/         REST API routes
│   │   ├── services/       calendar, claude, ffmpeg, notification, scheduler
│   │   ├── config/         db, googleAuth
│   │   └── middleware/     auth, errorHandler
│   ├── scripts/
│   │   ├── seed.js         Load sample data
│   │   └── clear-meetings.js  Reset meetings (keep users)
│   └── temp/               Uploaded audio files (auto-deleted after processing)
├── frontend/
│   ├── app/                Next.js App Router pages
│   ├── components/         UI components (layout, meetings, mom, tasks)
│   ├── store/slices/       Redux state (auth, meetings, mom, tasks, ui)
│   └── i18n/               en.json, ja.json
└── chrome-extension/
    ├── manifest.json
    ├── background.js       Service worker — handles upload fetch
    ├── content.js          Injected into meet.google.com — detects meeting state
    ├── hook.js             Injected into page MAIN world — starts MediaRecorder
    └── popup.html/js       Extension UI — status + token input
```

## Default Accounts

| Role | Email | Password |
|---|---|---|
| Admin | developer@mosaique.link | Admin@1234 |
| Member | pranavswordsman5335@gmail.com | Pranav@1234 |

Run `node backend/scripts/seed.js` to create these accounts and sample data.

## Documentation

See [PROJECTDETAIL.md](PROJECTDETAIL.md) for full technical documentation including database schema, API reference, and pipeline details.

## License

MIT
