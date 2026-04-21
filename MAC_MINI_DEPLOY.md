# AI MOM System — Mac Mini Server Deployment Guide

> Full step-by-step guide to migrate and run the AI MOM System on a Mac Mini server.
> Two paths: **Docker** (easier, recommended) and **Manual** (more control).

---

## Table of Contents

1. [What You Need Before You Start](#0-what-you-need-before-you-start)
2. [Prepare the Mac Mini](#1-prepare-the-mac-mini)
3. [Transfer the Project](#2-transfer-the-project)
4. [PATH A — Docker Deployment (Recommended)](#path-a--docker-deployment-recommended)
5. [PATH B — Manual Deployment](#path-b--manual-deployment)
6. [Configure Environment Variables](#5-configure-environment-variables)
7. [Set Up the Database](#6-set-up-the-database)
8. [Start the Application](#7-start-the-application)
9. [Access From Other Devices (Network Setup)](#8-access-from-other-devices-network-setup)
10. [Auto-Start on Mac Mini Reboot](#9-auto-start-on-mac-mini-reboot)
11. [Optional — Nginx Reverse Proxy + Custom Domain](#10-optional--nginx-reverse-proxy--custom-domain)
12. [Chrome Extension — Install & Configure on Any System](#11-chrome-extension--install--configure-on-any-system)
13. [Troubleshooting](#12-troubleshooting)

---

## 0. What You Need Before You Start

Gather these **before** touching the Mac Mini:

| Item | Where to get it |
|---|---|
| Your current project folder | The `ai-mom-system` folder on your Windows PC |
| `backend/.env` file | Already exists in your project |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| Google `CLIENT_ID` and `CLIENT_SECRET` | Google Cloud Console (see Step 5.3) |
| Mac Mini admin password | Set during macOS setup |
| USB drive or same Wi-Fi network | For transferring files |

> **No Puppeteer bot.** Recording is done by the Chrome Extension on each user's machine. The server only receives uploaded audio, runs FFmpeg + Whisper + Claude, and serves the frontend.

---

## 1. Prepare the Mac Mini

### 1.1 Check macOS Version

Open **Terminal** on the Mac Mini (Applications → Utilities → Terminal) and run:

```bash
sw_vers
```

You need **macOS 12 Monterey or newer**. If older, update via System Settings → Software Update.

### 1.2 Install Xcode Command Line Tools

```bash
xcode-select --install
```

A popup will appear. Click **Install** and wait (~5 minutes). Then verify:

```bash
xcode-select -p
# Should print: /Library/Developer/CommandLineTools
```

### 1.3 Install Homebrew (Mac Package Manager)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After it finishes, add Homebrew to your PATH:

```bash
# Apple Silicon (M1/M2/M3/M4):
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

# Intel Mac:
# echo 'eval "$(/usr/local/bin/brew shellenv)"' >> ~/.zprofile
```

Verify:

```bash
brew --version
# Homebrew 4.x.x
```

---

## 2. Transfer the Project

Choose **one** of these methods:

### Method A — USB Drive (Simplest)

1. On your **Windows PC**, copy the entire `ai-mom-system` folder onto a USB drive
2. Plug the USB into the Mac Mini
3. Open Terminal and copy it to your home folder:

```bash
cp -r /Volumes/YOUR_USB_NAME/ai-mom-system ~/ai-mom-system
```

Replace `YOUR_USB_NAME` with the actual drive name shown in Finder.

### Method B — Over Wi-Fi using SCP (Both on same network)

On your **Windows PC** (open PowerShell):

```powershell
# First find the Mac Mini's IP address:
# On Mac Mini: System Settings → Network → Wi-Fi → Details → IP Address

scp -r "C:\path\to\ai-mom-system" your_mac_user@MAC_MINI_IP:~/ai-mom-system
```

### Method C — Git

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/ai-mom-system.git
```

### Verify the transfer

```bash
ls ~/ai-mom-system
# Should show: backend/  frontend/  chrome-extension/  docker-compose.yml  etc.
```

---

## PATH A — Docker Deployment (Recommended)

> Easiest path. Docker handles Node.js, MySQL, and all dependencies inside containers.

### A.1 Install Docker Desktop for Mac

1. Go to: **https://www.docker.com/products/docker-desktop/**
2. Click **"Download for Mac"** — choose **Apple Silicon** or **Intel** based on your chip
   - Check chip: Apple menu → About This Mac
3. Open the downloaded `.dmg`, drag Docker to Applications
4. Open Docker — wait for the whale icon in the menu bar to stop animating

Verify:

```bash
docker --version
docker compose version
```

### A.2 Configure Environment Files

```bash
cd ~/ai-mom-system/backend
cp .env.example .env
nano .env
```

Fill in all values (see [Section 5 — Configure Environment Variables](#5-configure-environment-variables)).

Save with **Ctrl+X → Y → Enter**.

Set the frontend API URL:

```bash
cd ~/ai-mom-system/frontend
nano .env.local
```

```env
# For LAN access from other devices:
NEXT_PUBLIC_API_URL=http://MAC_MINI_IP:5000/api/v1

# For localhost-only:
# NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

### A.3 Build and Start Everything

```bash
cd ~/ai-mom-system
docker compose up --build -d
```

This will:
- Pull MySQL 8 image (~500 MB, one-time)
- Build the backend Docker image (installs Node.js and FFmpeg)
- Build the frontend Docker image (installs Node.js, builds Next.js)
- Start all 3 services

Watch the logs:

```bash
docker compose logs -f
```

Press **Ctrl+C** to stop watching (services keep running).

### A.4 Load Seed Data into Docker MySQL

```bash
# Wait 30 seconds for MySQL to fully initialize, then:
docker compose exec db mysql -u root -p"YOUR_DB_PASSWORD" ai_mom_db < ~/ai-mom-system/seed_data.sql
```

Or use the Node seed script:

```bash
docker compose exec backend node scripts/seed.js
```

### A.5 Verify Everything is Running

```bash
docker compose ps
```

Expected:
```
NAME        STATUS
db          Up (healthy)
backend     Up
frontend    Up
```

Open browser: **http://localhost:3000**

Login: `developer@mosaique.link` / `Admin@1234`

### A.6 Useful Docker Commands

```bash
# Stop everything
docker compose down

# Start again
docker compose up -d

# Restart just the backend
docker compose restart backend

# View backend logs
docker compose logs -f backend

# Rebuild after code changes
docker compose up --build -d

# Check container resource usage
docker stats
```

---

## PATH B — Manual Deployment

> More steps but gives you direct access to logs and easier debugging.

### B.1 Install Node.js via NVM

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Reload shell
source ~/.zshrc

# Install Node.js 20 LTS
nvm install 20
nvm use 20
nvm alias default 20

# Verify
node --version    # v20.x.x
npm --version     # 10.x.x
```

### B.2 Install MySQL 8

```bash
brew install mysql@8.0

# Add to PATH (Apple Silicon)
echo 'export PATH="/opt/homebrew/opt/mysql@8.0/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Start MySQL
brew services start mysql@8.0

# Secure the installation
mysql_secure_installation
```

During `mysql_secure_installation`:
- Set root password: **choose a strong password and remember it**
- Remove anonymous users: **Y**
- Disallow remote root login: **Y**
- Remove test database: **Y**

### B.3 Create the Database

```bash
mysql -u root -p
```

```sql
CREATE DATABASE ai_mom_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mom_user'@'localhost' IDENTIFIED BY 'StrongPassword123!';
GRANT ALL PRIVILEGES ON ai_mom_db.* TO 'mom_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### B.4 Install FFmpeg

FFmpeg converts uploaded `.webm` recordings to `.mp3` for Whisper transcription.

```bash
brew install ffmpeg
```

This may take 5–10 minutes. Verify:

```bash
ffmpeg -version
which ffmpeg     # e.g. /opt/homebrew/bin/ffmpeg
which ffprobe    # e.g. /opt/homebrew/bin/ffprobe
```

**Save these paths** — you'll need them in `.env`.

### B.5 Install PM2 (Process Manager)

```bash
npm install -g pm2
pm2 --version
```

### B.6 Install Project Dependencies

```bash
cd ~/ai-mom-system/backend
npm install

cd ~/ai-mom-system/frontend
npm install
```

---

## 5. Configure Environment Variables

### 5.1 Backend `.env`

```bash
cd ~/ai-mom-system/backend
cp .env.example .env
nano .env
```

```env
# Server
PORT=5000
NODE_ENV=production
FRONTEND_URL=http://localhost:3000   # change to Mac Mini IP for LAN access

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=ai_mom_db
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_ROOT_PASSWORD

# JWT — generate: openssl rand -hex 32
JWT_SECRET=PASTE_YOUR_64_CHAR_RANDOM_STRING_HERE
JWT_EXPIRES_IN=7d

# AI Keys
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx

# Google OAuth — each user connects their own account via the Settings page
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/auth/google/callback

# FFmpeg paths (from: which ffmpeg)
FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
FFPROBE_PATH=/opt/homebrew/bin/ffprobe

# Temp directory for uploaded recordings (auto-deleted after MOM generation)
TEMP_DIR=./temp
```

Save: **Ctrl+X → Y → Enter**

Create the temp directory:

```bash
mkdir -p ~/ai-mom-system/backend/temp
```

### 5.2 Frontend `.env.local`

```bash
cd ~/ai-mom-system/frontend
nano .env.local
```

```env
# Local access only:
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1

# LAN access from other devices (replace with your Mac Mini's actual IP):
# NEXT_PUBLIC_API_URL=http://192.168.1.100:5000/api/v1
```

### 5.3 Google OAuth Credentials (for per-user Calendar sync)

Each user connects their own Google account — no shared bot token required.

1. Go to **https://console.cloud.google.com/**
2. Create a project (or select existing)
3. Enable APIs: **Google Calendar API** and **People API**
   (APIs & Services → Library → search and enable each)
4. Create OAuth credentials:
   - APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: **Web application**
   - Authorised redirect URIs: `http://localhost:5000/api/v1/auth/google/callback`
   - If deploying to LAN: also add `http://192.168.1.100:5000/api/v1/auth/google/callback`
5. Copy **Client ID** and **Client Secret** into `backend/.env`

Users connect their own accounts at: **Settings → Connect Google Calendar** in the app.

### 5.4 Generate a JWT Secret

```bash
openssl rand -hex 32
```

Copy the output into `JWT_SECRET` in `.env`.

---

## 6. Set Up the Database

### 6.1 Run the Seed Script

Creates all tables and loads sample data (admin + member accounts, example meetings and MOMs).

**Docker:**
```bash
docker compose exec backend node scripts/seed.js
```

**Manual:**
```bash
cd ~/ai-mom-system/backend
node scripts/seed.js
```

Or load the raw SQL:
```bash
mysql -u root -p ai_mom_db < ~/ai-mom-system/seed_data.sql
```

### 6.1b Run Schema Migrations (if upgrading from an older version)

```sql
-- Connect to DB
mysql -u root -p ai_mom_db

-- Organizer name/email on meetings
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS organizer_name  VARCHAR(255) NULL AFTER organizer_id,
  ADD COLUMN IF NOT EXISTS organizer_email VARCHAR(255) NULL AFTER organizer_name,
  ADD COLUMN IF NOT EXISTS location        VARCHAR(500) NULL AFTER meet_link,
  ADD COLUMN IF NOT EXISTS created_by      INT          NULL AFTER organizer_id;

-- Attendee presence tracking
ALTER TABLE meeting_attendees
  ADD COLUMN IF NOT EXISTS status ENUM('present','absent') NOT NULL DEFAULT 'present';

-- Per-user Google Calendar token
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT NULL;

-- In-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id          INT NOT NULL AUTO_INCREMENT,
  user_id     INT NOT NULL,
  type        ENUM('task_assigned','task_deadline','meeting_starting') NOT NULL,
  title       VARCHAR(255) NOT NULL,
  message     TEXT NOT NULL,
  task_id     INT NULL,
  meeting_id  INT NULL,
  is_read     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_read (user_id, is_read),
  CONSTRAINT fk_notif_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_notif_task    FOREIGN KEY (task_id)    REFERENCES tasks(id)    ON DELETE SET NULL,
  CONSTRAINT fk_notif_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

EXIT;
```

### 6.2 Migrate Existing Data (If You Have Real Data on Your PC)

On your **Windows PC**, export:

```powershell
mysqldump -u root -p ai_mom_db > ai_mom_backup.sql
```

Transfer to Mac Mini, then import:

```bash
mysql -u root -p ai_mom_db < ~/ai_mom_backup.sql
```

### 6.3 Verify Tables Were Created

```bash
mysql -u root -p -e "USE ai_mom_db; SHOW TABLES;"
```

Expected:
```
meeting_attendees
meetings
mom_key_points
moms
notifications
tasks
users
```

---

## 7. Start the Application

### If Using Docker (PATH A)

```bash
cd ~/ai-mom-system
docker compose up -d
```

### If Using Manual (PATH B)

#### 7.1 Build the Frontend

```bash
cd ~/ai-mom-system/frontend
npm run build
```

Takes 1–3 minutes.

#### 7.2 Start Both Services with PM2

```bash
cd ~/ai-mom-system

pm2 start backend/src/server.js --name "mom-backend" --cwd backend
pm2 start "npm run start" --name "mom-frontend" --cwd frontend
pm2 save

pm2 status
```

Expected:
```
┌─────────────────┬──────┬────────┬─────────┐
│ name            │ pid  │ status │ restart │
├─────────────────┼──────┼────────┼─────────┤
│ mom-backend     │ 1234 │ online │ 0       │
│ mom-frontend    │ 1235 │ online │ 0       │
└─────────────────┴──────┴────────┴─────────┘
```

#### 7.3 Useful PM2 Commands

```bash
pm2 logs mom-backend       # live backend logs
pm2 logs mom-frontend      # live frontend logs
pm2 restart mom-backend    # restart backend
pm2 stop all               # stop everything
pm2 start all              # start everything
pm2 monit                  # CPU/memory monitor
```

### 7.4 Test in Browser

Open Chrome on the Mac Mini:
- Frontend: **http://localhost:3000**
- Backend health: **http://localhost:5000/health**

Login: `developer@mosaique.link` / `Admin@1234`

---

## 8. Access From Other Devices (Network Setup)

To access the app from other computers or phones on the same Wi-Fi:

### 8.1 Find the Mac Mini's Local IP

```bash
ipconfig getifaddr en0
# Example: 192.168.1.100
```

### 8.2 Update Environment Variables

Edit `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://192.168.1.100:5000/api/v1
```

Edit `backend/.env`:
```env
FRONTEND_URL=http://192.168.1.100:3000
GOOGLE_REDIRECT_URI=http://192.168.1.100:5000/api/v1/auth/google/callback
```

Also add the new redirect URI in Google Cloud Console (see Step 5.3).

Rebuild after changes:

```bash
# Docker
docker compose up --build -d

# PM2
cd ~/ai-mom-system/frontend && npm run build && pm2 restart mom-frontend
pm2 restart mom-backend
```

### 8.3 Allow Mac Mini Firewall (if enabled)

System Settings → Network → Firewall → Options → allow Terminal, or:

```bash
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node
```

### 8.4 Set a Static IP (Recommended)

So the IP doesn't change after router restart:

1. System Settings → Network → Wi-Fi → Details → TCP/IP
2. Change "Configure IPv4" to **Manually**
3. Set IP Address: `192.168.1.100`, Subnet: `255.255.255.0`, Router: `192.168.1.1`
4. Click OK → Apply

---

## 9. Auto-Start on Mac Mini Reboot

### Docker

Docker Desktop auto-starts if: Docker Desktop → Settings → General → "Start Docker Desktop when you sign in" → ON.

Containers auto-restart via `restart: unless-stopped` in `docker-compose.yml`.

### PM2

```bash
pm2 startup
# Copy and run the printed command, then:
pm2 save
```

Verify after reboot:

```bash
sudo reboot
# wait, then:
pm2 status
```

---

## 10. Optional — Nginx Reverse Proxy + Custom Domain

> Skip this if direct IP:port access is fine for your setup.

### 10.1 Install Nginx

```bash
brew install nginx
brew services start nginx
```

### 10.2 Configure Nginx

```bash
nano /opt/homebrew/etc/nginx/nginx.conf
```

Replace the `http { server { ... } }` block with:

```nginx
http {
    server {
        listen 80;
        server_name 192.168.1.100 moms.company.local;

        location / {
            proxy_pass http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }

        location /api {
            proxy_pass http://127.0.0.1:5000;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
```

```bash
nginx -t
brew services restart nginx
```

Access at: **http://192.168.1.100** (no port needed)

### 10.3 Local Hostname (Optional)

**Mac/Linux** — add to `/etc/hosts`:
```
192.168.1.100  moms.company.local
```

**Windows** — add to `C:\Windows\System32\drivers\etc\hosts`:
```
192.168.1.100  moms.company.local
```

---

## 11. Chrome Extension — Install & Configure on Any System

The AI MOM Chrome Extension runs on each user's machine (not on the server). It auto-detects Google Meet sessions, records the audio, and uploads it to the backend when the meeting ends.

### 11.1 Share the Extension Folder

The extension lives at `chrome-extension/` inside this project. No build step is needed.

**Option A — Copy the folder** (USB, AirDrop, file share, etc.) to the target machine.

**Option B — Git pull** the project on the target machine — the folder is already included.

### 11.2 Install in Chrome

> Works on Windows, Mac, and Linux. Requires Google Chrome.

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select the `chrome-extension/` folder (the one containing `manifest.json`)
5. The **AI MOM** icon appears in the toolbar. If not visible, click the puzzle-piece icon → pin AI MOM.

### 11.3 Configure the API URL

By default the extension points to `http://localhost:5000`. When using a shared server, update it:

1. Open `chrome-extension/background.js`
2. Find:
   ```js
   const apiUrl = 'http://localhost:5000/api/v1';
   ```
3. Change to your server IP:
   ```js
   const apiUrl = 'http://192.168.1.100:5000/api/v1';
   ```
4. Save the file
5. Go to `chrome://extensions` → click **Reload** (↺) on the AI MOM card

### 11.4 Log In via the Extension

1. Open the AI MOM frontend in Chrome (e.g. `http://192.168.1.100:3000`)
2. Log in with your account
3. Open DevTools (`F12`) → **Application** → **Local Storage** → select the frontend URL
4. Find the key `token` → copy the value
5. Click the AI MOM extension icon → paste the token → **Save**

Each user uses their own token so recordings are attributed to the correct account.

### 11.5 Add Google Redirect URI for Server IP

When users connect Google Calendar from a server URL (not localhost):

1. Go to Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client ID
2. Under **Authorised redirect URIs** → Add URI:
   ```
   http://192.168.1.100:5000/api/v1/auth/google/callback
   ```
3. Save

Also update `backend/.env`:
```env
GOOGLE_REDIRECT_URI=http://192.168.1.100:5000/api/v1/auth/google/callback
FRONTEND_URL=http://192.168.1.100:3000
```

### 11.6 How Recording Works (End-to-End)

```
User joins Google Meet in Chrome
  → Extension detects meeting start (MutationObserver on page DOM)
  → MediaRecorder captures tab audio + video (WebM)
  → Meeting ends → background.js service worker uploads to POST /meetings/upload
  → Server: FFmpeg (WebM → MP3) → Whisper (transcription) → Claude (MOM JSON)
  → MOM stored in MySQL
  → Visible at: http://<SERVER_IP>:3000/meetings
```

Extension badge states:
| Badge | Meaning |
|---|---|
| *(blank)* | Idle |
| **REC** (red) | Recording |
| **↑** | Uploading to server |
| **✓** (green) | Done — MOM being generated |
| **✗** (red) | Error (check service worker console) |

### 11.7 Verify the Extension is Working

1. Join a test Google Meet call
2. Badge shows **REC**
3. Leave the meeting
4. Badge shows **↑** → **✓**
5. Open AI MOM frontend → **Meetings** → the meeting appears with status `processing` then `completed`
6. Click the meeting → **View MOM**

**Debugging:** `chrome://extensions` → AI MOM → **Service worker** link → check Console for errors.
Most common issue: API URL still pointing to `localhost` instead of the server IP.

---

## 12. Troubleshooting

### "Cannot connect to MySQL"

```bash
brew services list | grep mysql
brew services restart mysql@8.0
lsof -i :3306
```

### "FFmpeg not found" in backend logs

```bash
which ffmpeg
which ffprobe

# Add to backend/.env:
FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
FFPROBE_PATH=/opt/homebrew/bin/ffprobe

pm2 restart mom-backend
# or
docker compose restart backend
```

### "EADDRINUSE port 3000" or "port 5000"

```bash
lsof -i :3000
lsof -i :5000
kill -9 PID_NUMBER
```

### Frontend builds but shows blank page

```bash
cat ~/ai-mom-system/frontend/.env.local   # check API URL is correct

cd ~/ai-mom-system/frontend
npm run build
pm2 restart mom-frontend
```

### Docker: "permission denied" or "port already in use"

```bash
lsof -i :3000
lsof -i :5000

docker compose down
docker compose up -d
```

### Check all backend errors at once

```bash
# PM2
pm2 logs mom-backend --lines 100

# Docker
docker compose logs --tail=100 backend
```

### Reset the database completely

```bash
mysql -u root -p -e "DROP DATABASE ai_mom_db; CREATE DATABASE ai_mom_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
cd ~/ai-mom-system/backend && node scripts/seed.js
```

### Google OAuth "redirect_uri_mismatch" (Error 400)

The redirect URI in your `.env` must exactly match what is registered in Google Cloud Console.

1. Check `backend/.env` → `GOOGLE_REDIRECT_URI`
2. Open Google Cloud Console → APIs & Services → Credentials → your OAuth client
3. Ensure the value from `.env` appears under **Authorised redirect URIs**
4. Save and wait 1–2 minutes for Google to propagate the change

---

## Quick Reference

| What | Value |
|---|---|
| Frontend | http://192.168.1.100:3000 |
| Backend API | http://192.168.1.100:5000/api/v1 |
| Backend health check | http://192.168.1.100:5000/health |
| Admin login | developer@mosaique.link / Admin@1234 |
| Member login | pranavswordsman5335@gmail.com / Pranav@1234 |
| View PM2 logs | `pm2 logs` |
| Restart all PM2 | `pm2 restart all` |
| Docker status | `docker compose ps` |
| Docker logs | `docker compose logs -f` |
| MySQL CLI | `mysql -u root -p ai_mom_db` |
| Extension install | `chrome://extensions` → Developer mode → Load unpacked |
| Extension API URL | Edit `chrome-extension/background.js` → `apiUrl` |
| Seed database | `node backend/scripts/seed.js` |
| Clear meetings | `node backend/scripts/clear-meetings.js` |

---

## File Structure on Mac Mini (after setup)

```
~/ai-mom-system/
├── backend/
│   ├── .env                    ← your secrets (never commit this)
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/           calendar, claude, ffmpeg, notification, scheduler
│   │   ├── models/
│   │   └── routes/
│   ├── scripts/
│   │   ├── seed.js             ← creates tables + sample data
│   │   └── clear-meetings.js   ← resets meetings, keeps users
│   └── temp/                   ← uploaded recordings (auto-deleted after processing)
├── frontend/
│   ├── .env.local              ← API URL
│   └── .next/                  ← production build
├── chrome-extension/           ← install this on each user's Chrome
│   ├── manifest.json
│   ├── background.js           ← update apiUrl here for LAN deployment
│   ├── content.js
│   ├── hook.js
│   └── popup.html/js
├── docker-compose.yml
└── MAC_MINI_DEPLOY.md          ← this file
```

---

*AI MOM System v1.0.0 — Pranav*
