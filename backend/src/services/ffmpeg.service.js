const ffmpeg = require('fluent-ffmpeg');
const logger = require('../utils/logger');

// Set FFmpeg / FFprobe paths from env so the service works regardless of
// whether ffmpeg is on the system PATH (required on Windows).
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}
if (process.env.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);
}

/**
 * Convert a meeting video file (webm/mp4) to a mono MP3 optimised for
 * speech recognition and the Claude Files API.
 *
 * Output settings (per CLAUDE.md Section 10):
 *   - Codec  : libmp3lame (MP3)
 *   - Bitrate: 128 kbps
 *   - Channels: 1 (mono) — halves file size, sufficient for speech
 *   - Sample rate: 16 000 Hz — optimal for speech recognition
 *
 * Resulting file sizes:
 *   30 min meeting → ~15–20 MB (well under Files API 500 MB limit)
 *   1 hr  meeting → ~30–40 MB
 *   2 hr  meeting → ~60–80 MB
 *
 * @param {string} inputPath  - Absolute path to the raw video file
 * @param {string} outputPath - Absolute path for the output .mp3 file
 * @returns {Promise<string>} Resolves with outputPath on success
 */
async function convertVideoToAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioChannels(1)
      .audioFrequency(16000)
      .output(outputPath)
      .on('start', (cmd) => logger.debug(`[Pipeline] FFmpeg cmd: ${cmd}`))
      .on('progress', (progress) => {
        if (progress.percent != null) {
          logger.debug(`[Pipeline] FFmpeg progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err, stdout, stderr) => {
        logger.error(`FFmpeg error: ${err.message}`);
        if (stderr) logger.error(`FFmpeg stderr: ${stderr}`);
        reject(new Error(`FFmpeg conversion failed: ${err.message}`));
      })
      .run();
  });
}

/**
 * Probe a media file and return its duration in seconds.
 * Useful for verifying the audio file before uploading to Claude.
 *
 * @param {string} filePath
 * @returns {Promise<number>} Duration in seconds
 */
async function getMediaDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(new Error(`ffprobe failed: ${err.message}`));
      resolve(metadata.format?.duration ?? 0);
    });
  });
}

module.exports = { convertVideoToAudio, getMediaDuration };
