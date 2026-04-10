# AI MOM System

Automated meeting documentation — joins Google Meet, records audio, transcribes, and generates bilingual Minutes of Meeting (MOM) using AI.

## What it does

1. Detects upcoming meetings via Google Calendar API
2. A Puppeteer bot joins the meeting 2 minutes before start (silent — mic/camera off)
3. Records audio and converts it to MP3 via FFmpeg
4. Transcribes with OpenAI Whisper (auto language detection)
5. Generates a structured MOM (summary, key points, action items) using Claude API
6. Stores everything in MySQL and displays it in a Next.js dashboard

Supports English and Japanese meetings. Japanese meetings produce bilingual output.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, Redux Toolkit, Tailwind CSS, react-i18next |
| Backend | Node.js, Express.js, MySQL 8, Sequelize |
| AI | Claude API (`claude-sonnet-4-6`), OpenAI Whisper |
| Bot | Puppeteer (headless Chromium) |
| Calendar | Google Calendar API v3 (OAuth2) |
| Audio | FFmpeg (fluent-ffmpeg) |

## Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8
- FFmpeg installed and on PATH
- Google Cloud project with Calendar API + OAuth2 credentials
- Anthropic API key
- OpenAI API key

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

## Environment Variables

**Backend `.env`**
```
PORT=5000
DB_HOST=localhost
DB_NAME=ai_mom_db
DB_USER=root
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
TEMP_DIR=./temp
```

**Frontend `.env.local`**
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

## Getting a Google Refresh Token

```bash
cd backend
node scripts/get-refresh-token.js
```

Follow the printed URL, authorize, paste the code back — the script prints your `GOOGLE_REFRESH_TOKEN`.

## Documentation

See [PROJECTDETAIL.md](PROJECTDETAIL.md) for full technical documentation including database schema, API reference, pipeline flow, and architecture decisions.

## License

MIT
