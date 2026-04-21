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
12. [Troubleshooting](#11-troubleshooting)

---

## 0. What You Need Before You Start

Gather these **before** touching the Mac Mini:

| Item | Where to get it |
|---|---|
| Your current project folder | The `ai-mom-system` folder on your Windows PC |
| `backend/.env` file | Already exists in your project |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| Google `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN` | Google Cloud Console (see Step 6.4) |
| Mac Mini admin password | Set during macOS setup |
| USB drive or same Wi-Fi network | For transferring files |

---

## 1. Prepare the Mac Mini

### 1.1 Check macOS Version

Open **Terminal** on the Mac Mini (Applications → Utilities → Terminal) and run:

```bash
sw_vers
```

You need **macOS 12 Monterey or newer**. If older, update via System Settings → Software Update.

### 1.2 Install Xcode Command Line Tools

These provide `git`, `make`, `clang` etc.

```bash
xcode-select --install
```

A popup will appear. Click **Install** and wait (~5 minutes). Then verify:

```bash
xcode-select -p
# Should print: /Library/Developer/CommandLineTools
```

### 1.3 Install Homebrew (Mac Package Manager)

Homebrew is required for almost everything else.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**After it finishes**, follow the printed instructions to add Homebrew to your PATH. It will say something like:

```bash
# For Apple Silicon (M1/M2/M3/M4):
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

# For Intel Mac:
echo 'eval "$(/usr/local/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/usr/local/bin/brew shellenv)"
```

Verify:

```bash
brew --version
# Should print: Homebrew 4.x.x
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

Replace `your_mac_user` with the Mac Mini username and `MAC_MINI_IP` with its IP (e.g. `192.168.1.50`).

### Method C — Git (If project is on GitHub/GitLab)

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/ai-mom-system.git
```

### Verify the transfer

```bash
ls ~/ai-mom-system
# Should show: backend/  frontend/  docker-compose.yml  seed_data.sql  etc.
```

---

## PATH A — Docker Deployment (Recommended)

> Easiest path. Docker handles Node.js, MySQL, and all dependencies inside containers.
> Skip to PATH B if you prefer to run directly on the Mac Mini.

### A.1 Install Docker Desktop for Mac

1. Go to: **https://www.docker.com/products/docker-desktop/**
2. Click **"Download for Mac"** — choose **Apple Silicon** (M1/M2/M3/M4) or **Intel** based on your Mac Mini chip
   - Check chip: Apple menu → About This Mac → chip name
3. Open the downloaded `.dmg` file
4. Drag **Docker** to Applications
5. Open Docker from Applications — it will ask for your password, click OK
6. Wait for Docker to fully start (the whale icon in the menu bar stops animating)

Verify Docker works:

```bash
docker --version
docker compose version
```

### A.2 Configure Environment File

```bash
cd ~/ai-mom-system/backend
cp .env.example .env
nano .env
```

Fill in every value (see [Section 5 — Configure Environment Variables](#5-configure-environment-variables)).

Save with **Ctrl+X → Y → Enter**.

Also set the frontend URL:

```bash
cd ~/ai-mom-system/frontend
nano .env.local
```

If you'll access from other devices on the network:
```
NEXT_PUBLIC_API_URL=http://MAC_MINI_IP:5000/api/v1
```

Replace `MAC_MINI_IP` with the Mac Mini's IP address (e.g. `http://192.168.1.50:5000/api/v1`).
For localhost-only access keep: `http://localhost:5000/api/v1`

### A.3 Build and Start Everything

```bash
cd ~/ai-mom-system
docker compose up --build -d
```

This will:
- Pull MySQL 8 image (~500 MB, one-time)
- Build the backend Docker image (installs Node, FFmpeg, Chromium, Puppeteer)
- Build the frontend Docker image (installs Node, builds Next.js)
- Start all 3 services

Watch the logs:

```bash
docker compose logs -f
```

Press **Ctrl+C** to stop watching logs (services keep running).

### A.4 Load Seed Data into Docker MySQL

```bash
# Wait 30 seconds for MySQL to fully initialize, then:
docker compose exec db mysql -u root -p"YOUR_DB_PASSWORD" ai_mom_db < ~/ai-mom-system/seed_data.sql
```

Replace `YOUR_DB_PASSWORD` with the password you set in `.env`.

### A.5 Verify Everything is Running

```bash
docker compose ps
```

All three services should show `Up` or `running`:
```
NAME        STATUS
db          Up (healthy)
backend     Up
frontend    Up
```

Open browser on Mac Mini: **http://localhost:3000**

Login with: `admin@company.com` / `Admin@123`

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

# View frontend logs
docker compose logs -f frontend

# Rebuild after code changes
docker compose up --build -d

# Check container resource usage
docker stats
```

---

## PATH B — Manual Deployment

> More steps but gives you direct access to logs and easier debugging.
> Required if you want to run without Docker.

### B.1 Install Node.js via NVM

NVM lets you manage multiple Node versions.

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Reload shell (or open a new Terminal window)
source ~/.zshrc

# Verify NVM installed
nvm --version

# Install Node.js 20 (LTS)
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
```

After installation, Homebrew will print instructions. Run them:

```bash
# Add MySQL to PATH (Apple Silicon)
echo 'export PATH="/opt/homebrew/opt/mysql@8.0/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# For Intel Mac use:
# echo 'export PATH="/usr/local/opt/mysql@8.0/bin:$PATH"' >> ~/.zshrc

# Start MySQL service (starts automatically on login)
brew services start mysql@8.0

# Wait 5 seconds, then secure the installation
mysql_secure_installation
```

During `mysql_secure_installation`:
- Set root password: **choose a strong password and remember it**
- Remove anonymous users: **Y**
- Disallow remote root login: **Y**
- Remove test database: **Y**
- Reload privilege tables: **Y**

Verify MySQL is running:

```bash
mysql -u root -p
# Enter your password — should show mysql> prompt
exit;
```

### B.3 Create the Database

```bash
mysql -u root -p
```

Run these SQL commands:

```sql
CREATE DATABASE ai_mom_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mom_user'@'localhost' IDENTIFIED BY 'StrongPassword123!';
GRANT ALL PRIVILEGES ON ai_mom_db.* TO 'mom_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

You can use `root` directly instead of creating a new user — just use root credentials in `.env`.

### B.4 Install FFmpeg

FFmpeg converts video recordings to MP3 for Whisper transcription.

```bash
brew install ffmpeg
```

This may take 5–10 minutes. Verify:

```bash
ffmpeg -version
# Should print FFmpeg version info
which ffmpeg   # prints path, e.g. /opt/homebrew/bin/ffmpeg
which ffprobe  # prints path, e.g. /opt/homebrew/bin/ffprobe
```

**Save these paths** — you'll need them in the backend `.env`.

### B.5 Install Chromium (for Puppeteer Bot)

Puppeteer needs Chromium to join Google Meet sessions.

```bash
brew install --cask chromium
```

Or let Puppeteer download its own (handled automatically when you do `npm install` in backend).

### B.6 Install PM2 (Process Manager)

PM2 keeps the backend and frontend running and restarts them if they crash.

```bash
npm install -g pm2
pm2 --version
```

### B.7 Install Project Dependencies

```bash
# Backend dependencies
cd ~/ai-mom-system/backend
npm install

# Frontend dependencies
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

Fill in all values:

```env
# Server
PORT=5000
NODE_ENV=production
FRONTEND_URL=http://localhost:3000

# Database — use values from Step B.3
DB_HOST=localhost
DB_PORT=3306
DB_NAME=ai_mom_db
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_ROOT_PASSWORD

# JWT — generate a random secret:
# Run in terminal: openssl rand -hex 32
JWT_SECRET=PASTE_YOUR_64_CHAR_RANDOM_STRING_HERE
JWT_EXPIRES_IN=7d

# AI Keys
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx        # Whisper transcription

# Google OAuth (see Step 5.3 below)
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback
GOOGLE_REFRESH_TOKEN=1//xxxxxxxxxxxxxx

# FFmpeg paths (from Step B.4 — run: which ffmpeg)
FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
FFPROBE_PATH=/opt/homebrew/bin/ffprobe

# Temp directory for recordings/uploads
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
# For local-only access:
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1

# For access from other devices on your network:
# NEXT_PUBLIC_API_URL=http://192.168.1.50:5000/api/v1
```

Save: **Ctrl+X → Y → Enter**

### 5.3 Getting Google OAuth Credentials (for Calendar API)

Skip this section if you don't use Google Calendar sync.

1. Go to **https://console.cloud.google.com/**
2. Create a new project or select your existing one
3. Enable **Google Calendar API**: APIs & Services → Library → Search "Google Calendar API" → Enable
4. Create OAuth credentials: APIs & Services → Credentials → Create Credentials → OAuth Client ID
   - Application type: **Web application**
   - Authorised redirect URIs: `http://localhost:5000/auth/google/callback`
5. Copy `Client ID` and `Client Secret` into `.env`
6. Get Refresh Token using the OAuth Playground:
   - Go to https://developers.google.com/oauthplayground/
   - Click settings gear → check "Use your own OAuth credentials" → enter your Client ID and Secret
   - In Step 1, enter scopes (space-separated):
     ```
     https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/contacts.other.readonly
     ```
     The `contacts.other.readonly` scope is required to resolve attendee display names via the People API.
   - Click Authorise → sign in with your Google account
   - In Step 2, click "Exchange authorization code for tokens"
   - Copy the **Refresh token** into `.env`

### 5.4 Generate a JWT Secret

```bash
openssl rand -hex 32
```

Copy the output into `JWT_SECRET` in `.env`.

---

## 6. Set Up the Database

### 6.1 Run the Seed Data

This creates all tables and loads sample data.

```bash
mysql -u root -p ai_mom_db < ~/ai-mom-system/seed_data.sql
```

Enter your MySQL password when prompted.

### 6.1b Run Schema Migrations

After loading seed data, apply these column additions if upgrading from an older version:

```sql
-- Connect to DB
mysql -u root -p ai_mom_db

-- Organizer name/email stored directly on meetings (for non-system-user hosts)
ALTER TABLE meetings
  ADD COLUMN organizer_name  VARCHAR(255) NULL AFTER organizer_id,
  ADD COLUMN organizer_email VARCHAR(255) NULL AFTER organizer_name;

-- Attendee presence tracking
ALTER TABLE meeting_attendees
  ADD COLUMN status ENUM('present','absent') NOT NULL DEFAULT 'present';

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

On your **Windows PC**, export the existing database:

```powershell
mysqldump -u root -p ai_mom_db > ai_mom_backup.sql
```

Transfer `ai_mom_backup.sql` to the Mac Mini (via USB or SCP), then import:

```bash
mysql -u root -p ai_mom_db < ~/ai_mom_backup.sql
```

### 6.3 Verify Tables Were Created

```bash
mysql -u root -p -e "USE ai_mom_db; SHOW TABLES;"
```

Expected output:
```
meeting_attendees
meetings
mom_key_points
mom_versions
moms
notifications
tasks
users
```

> **Note:** `notifications` is created by the migration in Step 6.1b. If it's missing, run that migration.

---

## 7. Start the Application

### If Using Docker (PATH A)

Already covered in Section A.3. To start:

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

This takes 1–3 minutes and creates an optimised production build.

#### 7.2 Start Both Services with PM2

```bash
cd ~/ai-mom-system

# Start backend
pm2 start backend/src/server.js --name "mom-backend" --cwd backend

# Start frontend
pm2 start "npm run start" --name "mom-frontend" --cwd frontend

# Save PM2 process list so it restores after reboot
pm2 save

# View running processes
pm2 status
```

Expected output:
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
# View live logs
pm2 logs mom-backend
pm2 logs mom-frontend

# Restart a service
pm2 restart mom-backend

# Stop everything
pm2 stop all

# Start everything
pm2 start all

# Monitor CPU/memory
pm2 monit
```

### 7.4 Test in Browser

Open **Safari or Chrome** on the Mac Mini:
- Frontend: **http://localhost:3000**
- Backend health: **http://localhost:5000/health**

Login: `admin@company.com` / `Admin@123`

---

## 8. Access From Other Devices (Network Setup)

To access the app from your iPhone, iPad, or other computers on the same Wi-Fi:

### 8.1 Find the Mac Mini's Local IP

```bash
ipconfig getifaddr en0
# Example output: 192.168.1.50
```

### 8.2 Update Frontend API URL

Edit `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://192.168.1.50:5000/api/v1
```

If using Docker, rebuild:
```bash
docker compose up --build -d
```

If using PM2, rebuild and restart:
```bash
cd ~/ai-mom-system/frontend
npm run build
pm2 restart mom-frontend
```

Also update backend `.env`:
```env
FRONTEND_URL=http://192.168.1.50:3000
```

### 8.3 Allow Mac Mini Firewall (if enabled)

System Settings → Network → Firewall → Options → add the Terminal app or disable firewall for LAN.

Or allow the specific ports:

```bash
# Check if firewall is on
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# If firewall is on, open ports 3000 and 5000
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node
```

### 8.4 Set a Static IP for the Mac Mini (Recommended)

So the IP doesn't change after router restart:

1. System Settings → Network → Wi-Fi (or Ethernet) → Details
2. Click **TCP/IP** tab
3. Change "Configure IPv4" from **Using DHCP** to **Manually**
4. Enter:
   - IP Address: `192.168.1.100` (or any unused IP in your range)
   - Subnet Mask: `255.255.255.0`
   - Router: `192.168.1.1` (your router's IP)
5. Click OK → Apply

---

## 9. Auto-Start on Mac Mini Reboot

### If Using Docker

```bash
# Docker Desktop auto-starts by default. Verify:
# Docker Desktop → Settings → General → "Start Docker Desktop when you sign in" → check ON

# Also ensure the containers auto-restart:
# Already handled by "restart: unless-stopped" in docker-compose.yml
```

### If Using PM2

```bash
# Generate a startup script
pm2 startup

# PM2 will print a command like:
# sudo env PATH=$PATH:/Users/yourname/.nvm/.../node pm2 startup launchd -u yourname --hp /Users/yourname
# COPY AND RUN THAT EXACT COMMAND

# Then save the current process list
pm2 save
```

Verify by rebooting:

```bash
sudo reboot
```

After reboot, check services:

```bash
pm2 status
```

---

## 10. Optional — Nginx Reverse Proxy + Custom Domain

> Do this only if you want a clean URL like `http://moms.company.local` instead of `http://192.168.1.100:3000`

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
    # Frontend — Next.js
    server {
        listen 80;
        server_name moms.company.local 192.168.1.100;

        location / {
            proxy_pass http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }

        # API — forward /api requests to backend
        location /api {
            proxy_pass http://127.0.0.1:5000;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
```

Test and restart:

```bash
nginx -t
brew services restart nginx
```

Now access the app at: **http://192.168.1.100** (no port number needed)

### 10.3 Use a Local Hostname (Optional)

On each computer that needs to access the Mac Mini:

**Mac/Linux** — add to `/etc/hosts`:
```
192.168.1.100  moms.company.local
```

**Windows** — add to `C:\Windows\System32\drivers\etc\hosts`:
```
192.168.1.100  moms.company.local
```

Now access via: **http://moms.company.local**

---

## 11. Bot Account Pool — Simultaneous Meeting Recording

> One Google account can only be in **one** Meet call at a time.
> For N simultaneous meetings you need N bot Google accounts.

### 11.1 Create Bot Google Accounts

Create one Gmail/Google Workspace account per concurrent meeting slot:

| Slot | Email | Profile Dir |
|---|---|---|
| 1 | `bot1@yourcompany.com` | `~/bot-profile-1` |
| 2 | `bot2@yourcompany.com` | `~/bot-profile-2` |
| 3 | `bot3@yourcompany.com` | `~/bot-profile-3` |

Free Gmail accounts work fine (`aimom.bot1@gmail.com` etc.).

### 11.2 Log Each Bot Account into Chrome (One-time per account)

Run this once per bot account on the Mac Mini:

```bash
# Bot account 1
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir=/Users/$(whoami)/bot-profile-1 \
  --no-first-run

# Log into bot1@yourcompany.com in the browser that opens, then close it.
```

```bash
# Bot account 2
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir=/Users/$(whoami)/bot-profile-2 \
  --no-first-run

# Log into bot2@yourcompany.com, then close it.
```

Repeat for each bot account.

### 11.3 Configure the Pool in .env

```env
# backend/.env
BOT_PROFILE_DIRS=/Users/pranav/bot-profile-1,/Users/pranav/bot-profile-2,/Users/pranav/bot-profile-3
```

### 11.4 How It Works

When a meeting is about to start, the scheduler calls `joinMeeting()`:

```
Meeting A scheduled → acquireProfile() → picks bot-profile-1 (free) → Chrome #1 joins
Meeting B scheduled → acquireProfile() → picks bot-profile-2 (free) → Chrome #2 joins
Meeting C scheduled → acquireProfile() → bot-profile-3 (free)       → Chrome #3 joins
Meeting D scheduled → acquireProfile() → ALL PROFILES BUSY          → status: failed
```

When a meeting ends, the profile is released back to the pool and available for the next meeting.

### 11.5 Invite Bot Accounts to Meetings

Each bot account must be **invited** (or the meeting must allow "anyone with the link"):

- If your Google Meet meetings require sign-in: add each bot email as a guest in the Google Calendar event
- If your meetings use "anyone with the link": no extra step needed

### 11.6 Verify Pool is Loaded

Check the backend logs on startup:

```bash
pm2 logs mom-backend | grep "profile pool"
# Should print:
# Bot profile pool: 2 account(s) — /Users/pranav/bot-profile-1, /Users/pranav/bot-profile-2
```

---

## 12. Troubleshooting

### "Cannot connect to MySQL"

```bash
# Check MySQL is running
brew services list | grep mysql

# Restart MySQL
brew services restart mysql@8.0

# Check MySQL port
lsof -i :3306
```

### "FFmpeg not found" error in backend logs

```bash
# Find exact path
which ffmpeg
which ffprobe

# Add to backend/.env:
FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
FFPROBE_PATH=/opt/homebrew/bin/ffprobe

# Restart backend
pm2 restart mom-backend
# or
docker compose restart backend
```

### "EADDRINUSE port 3000" or "port 5000"

```bash
# Find what's using the port
lsof -i :3000
lsof -i :5000

# Kill the process
kill -9 PID_NUMBER
```

### Frontend builds but shows blank page

```bash
# Check for .env.local
cat ~/ai-mom-system/frontend/.env.local

# Rebuild
cd ~/ai-mom-system/frontend
npm run build
pm2 restart mom-frontend
```

### Puppeteer / Chrome fails to launch

```bash
# Install required dependencies
brew install --cask chromium

# Or tell Puppeteer to skip Chromium download and use system Chrome:
# Add to backend/.env:
PUPPETEER_EXECUTABLE_PATH=/Applications/Chromium.app/Contents/MacOS/Chromium
```

### Docker: "permission denied" or "port already in use"

```bash
# Check what's on port 3000 / 5000
lsof -i :3000
lsof -i :5000

# Stop conflicting processes, then restart Docker
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
mysql -u root -p ai_mom_db < ~/ai-mom-system/seed_data.sql
```

---

## Quick Reference

| What | URL / Command |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000/api/v1 |
| Backend health check | http://localhost:5000/health |
| Default admin login | admin@company.com / Admin@123 |
| View PM2 logs | `pm2 logs` |
| Restart all PM2 | `pm2 restart all` |
| Docker status | `docker compose ps` |
| Docker logs | `docker compose logs -f` |
| MySQL CLI | `mysql -u root -p ai_mom_db` |

---

## File Structure on Mac Mini (after setup)

```
~/ai-mom-system/
├── backend/
│   ├── .env                  ← your secrets (never commit this)
│   ├── src/
│   ├── temp/                 ← uploaded recordings stored here
│   └── logs/
├── frontend/
│   ├── .env.local            ← API URL
│   └── .next/                ← production build output
├── docker-compose.yml
├── seed_data.sql
└── MAC_MINI_DEPLOY.md        ← this file
```

---

*Generated for AI MOM System v1.0.0 — Pranav*
