# CLAUDE.md — AI MOM System

> **Codename:** AI-MOM | **Author:** Pranav | **Version:** 1.0.0

---

## 1. Project Overview

Automates the full lifecycle of meeting documentation: detect Google Meet sessions via Calendar API → Puppeteer bot joins & records → FFmpeg converts video to audio → OpenAI Whisper transcribes → Claude generates bilingual MOM (English + Japanese) → stored in MySQL → editable via Next.js frontend.

**Out of scope:** No user file uploads. No Google Drive intermediate storage.

---

## 2. Architecture Pipeline

```
Google Calendar API → Meeting detected → Puppeteer Bot (joins/records .webm)
→ FFmpeg (.webm → .mp3, mono 16kHz) → OpenAI Whisper (transcription + language detection)
→ Claude API (text-only, MOM generation JSON) → MySQL → Next.js Frontend
```

**Key decisions:**
- Audio via OpenAI Whisper (`whisper-1`, `verbose_json`), not Claude (Claude doesn't support audio blocks)
- Claude receives text transcript only; generates structured JSON MOM
- Bot joins 2 min before meeting start; scheduler polls every 30s with ±30s window
- Bot: mic/camera always off (`getUserMedia` overridden + `--use-fake-device-for-media-stream`)
- No auto-admit: only `POST /meetings/:id/admit` triggers admission
- Meeting end detection: MutationObserver (instant) + `framenavigated` + 3s poll fallback
- `sequelize.sync()` only (no `{alter:true}` — causes "too many keys" MySQL error)

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Redux Toolkit, Axios, Tailwind CSS, react-i18next, @dnd-kit, jsPDF, docx, socket.io-client, lucide-react |
| Backend | Node.js + Express.js, MySQL 8.x + Sequelize ORM |
| AI | Claude API (`claude-sonnet-4-6`) — text only; OpenAI Whisper for transcription |
| Bot | Puppeteer (headless Chromium, screen+audio recording) |
| Calendar | Google Calendar API v3 (OAuth2) |
| Audio | FFmpeg (fluent-ffmpeg) — mono 16kHz 128kbps MP3 |
| Auth | JWT (jsonwebtoken) |

---

## 4. Claude API Usage

- **Model:** `claude-sonnet-4-6`
- **Input:** Text transcript only (no audio blocks — they don't exist in the API)
- **Output:** JSON MOM structure; `max_tokens: 8192` for bilingual Japanese meetings
- **Language detection:** Whisper `language` field + Japanese Unicode regex fallback
- **Prompts:** `PROMPT_ENGLISH` and `PROMPT_JAPANESE` (dual-language output: `{ japanese: {...}, english: {...} }`)

---

## 5. Database Schema

Tables: `users`, `meetings`, `moms`, `mom_key_points`, `tasks`, `meeting_attendees`, `meeting_project_links`

Key fields:
- `meetings.status`: `scheduled | recording | processing | completed | failed`
- `moms.is_edited`, `edited_by`, `edited_at` — edit tracking
- `mom_key_points.order_index` — drag-and-drop ordering
- `tasks.priority`: `high | medium | low`; `tasks.status`: `pending | in_progress | completed`
- `meeting_project_links` — MOM to BMS project association

---

## 6. Backend API (`/api/v1`)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login` | Login → JWT |
| GET | `/auth/me` | Current user |
| GET/DELETE | `/meetings`, `/meetings/:id` | List/detail/delete |
| POST | `/meetings/sync` | Trigger Calendar sync |
| GET/POST | `/meetings/:id/waiting`, `/meetings/:id/admit` | Bot lobby control |
| GET/PUT/POST | `/mom/:meetingId`, `/mom/id/:id`, `/mom/:id` | Get/update/search MOM |
| POST | `/mom/:id/regenerate` | Re-trigger MOM generation |
| GET | `/mom/search?q=` | Full-text search (min 2 chars) |
| GET/POST/PUT/DELETE | `/tasks` | Task CRUD |
| GET/POST/DELETE | `/bms/projects`, `/bms/link`, `/bms/links/:meetingId` | BMS linking |

---

## 7. Frontend Structure

```
frontend/
├── app/
│   ├── login/page.tsx          # Public — JWT → redirect /meetings
│   ├── meetings/page.tsx       # List with status filter tabs, pagination, sync
│   ├── meetings/[id]/page.tsx  # Detail: banners, admit button, inline MOM
│   ├── mom/[id]/page.tsx       # Full MOM view (read-only)
│   ├── mom/[id]/edit/page.tsx  # MOM editor (drag-drop key points)
│   ├── tasks/page.tsx          # Task dashboard with filters
│   ├── calendar/page.tsx       # Month calendar view
│   └── settings/page.tsx       # Theme + Language + Profile
├── components/
│   ├── layout/   Sidebar, Topbar, ProtectedLayout
│   ├── meetings/ MeetingCard, MeetingStatusBadge, AdmitButton
│   ├── mom/      MOMViewer, MOMEditor, KeyPointsList
│   ├── tasks/    TaskCard, TaskEditor
│   ├── ui/       ThemeToggle, LanguageToggle, SearchBar, Toast, UserMenu, ExportButton
│   └── ProjectLinker.tsx
├── store/slices/ authSlice, uiSlice, meetingSlice, momSlice, taskSlice, bmsSlice
├── i18n/         en.json, ja.json, index.ts
├── hooks/        useWebSocket.ts, useTheme.ts
└── services/api.ts  # Axios + JWT interceptor + 401 redirect
```

---

## 8. Design System

**Light mode CSS variables:**
```css
--primary: #00C9A7  /* teal */   --accent: #FF6B6B  /* coral */
--warning: #FFB347  /* amber */  --bg: #F0F4FF
--surface: #FFFFFF              --border: #E2E8F0
--text: #1A1A2E                 --text-muted: #64748B
```
Dark mode toggled via `class="dark"` on `<html>`. Persisted in `localStorage` + Redux `uiSlice`.

**Custom Tailwind classes (globals.css):** `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.card`, `.input`

---

## 9. Redux Slices

| Slice | State | Key Actions |
|---|---|---|
| `authSlice` | `{ user, token, status, error }` | `login`, `logout`, `fetchMe` |
| `uiSlice` | `{ theme, language, sidebarCollapsed }` | `setTheme`, `setLanguage`, `toggleSidebar` |
| `meetingSlice` | `{ meetings, currentMeeting, total }` | `fetchMeetings`, `fetchMeeting`, `updateMeetingStatusLocal` |
| `momSlice` | `{ currentMOM, status }` | `fetchMOM`, `fetchMOMById`, `updateMOM` |
| `taskSlice` | `{ tasks, filters, total }` | `fetchTasks`, `createTask`, `updateTask`, `deleteTask` |
| `bmsSlice` | `{ projects, links }` | `fetchBmsProjects`, `linkProject`, `removeProjectLink` |

---

## 10. i18n

- `react-i18next` with `en.json` and `ja.json`
- Language in `uiSlice.language` + `localStorage` — persists refresh
- Toggle: EN ↔ 日本語 pill in Topbar (also on login page)
- **MOM content is NOT translated** — it's already bilingual in the DB for Japanese meetings
- Japanese key point prefixes: `[議題]`, `[議論]`, `[決定]`, `[EN Agenda]`, `[EN Discussion]`, `[EN Decision]`

---

## 11. Key Constraints

| # | Rule |
|---|---|
| 1 | MOM content (summary, key points) is NOT translated by UI toggle — already bilingual |
| 2 | `order_index` saved on every drag-drop reorder via `PUT /mom/:id` |
| 3 | Bot never auto-admits — only `POST /meetings/:id/admit` |
| 4 | `assignee_id` may be null — use `assigned_to` text as fallback |
| 5 | Admin role can delete meetings/tasks; member cannot |
| 6 | Search requires min 2 characters |
| 7 | All datetimes from backend are UTC — format via `Intl.DateTimeFormat` |
| 8 | `sync()` not `sync({alter:true})` — alter causes MySQL "too many keys" error |
| 9 | Files API (beta) NOT used — switched to Whisper pipeline |
| 10 | Bot headless mode: `headless: false` = visible; `headless: 'new'` = invisible |

---

## 12. Environment Variables

**Backend `.env`:**
```
PORT=5000  DB_HOST=localhost  DB_NAME=ai_mom_db  DB_USER=root  DB_PASSWORD=...
JWT_SECRET=...  ANTHROPIC_API_KEY=sk-ant-...  OPENAI_API_KEY=sk-...
GOOGLE_CLIENT_ID=...  GOOGLE_CLIENT_SECRET=...  GOOGLE_REFRESH_TOKEN=...
TEMP_DIR=./temp  BMS_API_URL=http://localhost:4000/api
```

**Frontend `.env.local`:**
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```
