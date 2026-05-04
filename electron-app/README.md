# AI MOM Desktop App

Electron-based desktop app that automatically detects and records meetings from:
- Google Meet (any browser)
- Microsoft Teams (desktop app)
- Zoom (desktop app)

## Setup

```bash
cd electron-app
npm install
```

## Development

```bash
npm start
```

## Build Installers

```bash
# Windows (.exe NSIS installer)
npm run build:win

# macOS (.dmg)
npm run build:mac

# Both
npm run build
```

Output goes to `dist/`.

## Required: Icon files

Before building, place these in `assets/`:
- `icon.ico`            (Windows, 256×256)
- `icon.icns`           (macOS)
- `icon.png`            (256×256 PNG fallback)
- `icon-recording.png`  (same but with red dot overlay)

See `assets/README.md` for instructions.

## How It Works

1. App runs in the system tray
2. Every 3 seconds, polls open windows via `desktopCapturer.getSources()`
3. When a meeting window is detected (Teams/Zoom/Meet title patterns):
   - Intercepts `getDisplayMedia()` in renderer to auto-select the window + loopback audio
   - Starts `MediaRecorder` on the audio-only stream
4. When the meeting window disappears, stops recording and uploads to backend
5. Backend processes the audio (FFmpeg → Whisper → Claude MOM)

## Security

- JWT token stored via `electron-store` with encryption key
- `contextIsolation: true` + preload for renderer/main IPC
- No `nodeIntegration` in renderer
