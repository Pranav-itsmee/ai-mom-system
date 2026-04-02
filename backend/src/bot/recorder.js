const fs = require('fs');
const { generateTempPath } = require('../utils/fileManager');
const logger = require('../utils/logger');

/**
 * Records Google Meet audio by injecting a MediaRecorder into the browser page.
 *
 * Each audio chunk is written to disk immediately via page.exposeFunction().
 * This means even if the bot gets kicked or the page crashes mid-meeting,
 * every chunk that arrived before the disconnect is already on disk and can
 * be processed by Claude.
 */
class MeetingRecorder {
  constructor(page) {
    this.page = page;
    this.outputPath = null;
    this._writeStream = null;
    this._chunkCount = 0;
    this.isRecording = false;
  }

  /**
   * Returns the script to pass to page.evaluateOnNewDocument().
   * Must be called BEFORE page.goto() so the RTCPeerConnection hook is in
   * place before Google Meet creates any peer connections.
   */
  static hookScript() {
    return () => {
      window.__audioTracks = [];

      const _OrigPC = window.RTCPeerConnection;
      window.RTCPeerConnection = function (...args) {
        const pc = new _OrigPC(...args);

        pc.addEventListener('track', (e) => {
          if (e.track.kind !== 'audio') return;
          window.__audioTracks.push(e.track);

          // Connect immediately if the recorder is already running
          if (window.__audioCtx && window.__audioDest) {
            try {
              window.__audioCtx
                .createMediaStreamSource(new MediaStream([e.track]))
                .connect(window.__audioDest);
            } catch (_) {}
          }
        });

        return pc;
      };

      window.RTCPeerConnection.prototype = _OrigPC.prototype;
      Object.setPrototypeOf(window.RTCPeerConnection, _OrigPC);
    };
  }

  /**
   * Start recording. Call this after the bot has joined the meeting.
   * Opens a write stream to disk and exposes __saveAudioChunk() to the page
   * so every MediaRecorder chunk is persisted immediately.
   *
   * @param {number} meetingId
   * @returns {Promise<string>} path of the output .webm file
   */
  async start(meetingId) {
    if (this.isRecording) throw new Error('Already recording');

    const filename = `meeting_${meetingId}_${Date.now()}.webm`;
    this.outputPath = generateTempPath(filename);
    this._writeStream = fs.createWriteStream(this.outputPath);
    this._chunkCount = 0;

    // Expose a Node.js callback the page calls for every audio chunk.
    // Chunks land on disk in real time — safe against page crashes / kicks.
    await this.page.exposeFunction('__saveAudioChunk', (base64Data) => {
      if (!this._writeStream || this._writeStream.destroyed) return;
      this._writeStream.write(Buffer.from(base64Data, 'base64'));
      this._chunkCount++;
    });

    await this.page.evaluate(() => {
      window.__audioCtx = new AudioContext();
      window.__audioDest = window.__audioCtx.createMediaStreamDestination();
      window.__audioCtx.resume();

      // Connect tracks that arrived before start() was called
      (window.__audioTracks || []).forEach((track) => {
        try {
          window.__audioCtx
            .createMediaStreamSource(new MediaStream([track]))
            .connect(window.__audioDest);
        } catch (_) {}
      });

      const rec = new MediaRecorder(window.__audioDest.stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 64_000,
      });

      rec.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          // reader.result = 'data:audio/webm;codecs=opus;base64,XXXX…'
          window.__saveAudioChunk(reader.result.split(',')[1]);
        };
        reader.readAsDataURL(e.data);
      };

      window.__meetRec = rec;
      rec.start(3_000); // emit a chunk every 3 seconds
    });

    this.isRecording = true;
    logger.info(`Audio recording started → ${this.outputPath}`);
    return this.outputPath;
  }

  /**
   * Graceful stop: tell the in-page MediaRecorder to flush its last chunk,
   * wait for it to arrive, then close the write stream.
   *
   * @returns {Promise<string>} path of the completed audio file
   */
  async stop() {
    if (!this.isRecording) throw new Error('Recorder is not active');

    // Ask the in-page recorder to stop and emit its final chunk
    await this.page.evaluate(() => {
      return new Promise((resolve) => {
        const rec = window.__meetRec;
        if (!rec || rec.state === 'inactive') { resolve(); return; }
        rec.onstop = resolve;
        rec.stop();
      });
    }).catch(() => {
      // Page may already be gone (kicked / crashed) — that's fine,
      // all chunks up to this point are already on disk.
    });

    // Allow the last FileReader + __saveAudioChunk call to complete
    await sleep(1_500);

    return this._finalise();
  }

  /**
   * Emergency stop when the page has crashed or navigated away.
   * Does not try to interact with the page — just closes the write stream.
   *
   * @returns {string} path of the partial audio file
   */
  forceStop() {
    this.isRecording = false;
    logger.warn(`Audio recording force-stopped → ${this.outputPath} (${this._chunkCount} chunks saved)`);
    return this._finalise();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _finalise() {
    return new Promise((resolve, reject) => {
      if (!this._writeStream || this._writeStream.destroyed) {
        this.isRecording = false;
        resolve(this.outputPath);
        return;
      }
      this._writeStream.end((err) => {
        this.isRecording = false;
        if (err) reject(err);
        else resolve(this.outputPath);
      });
    });
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = MeetingRecorder;
