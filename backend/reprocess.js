/**
 * One-time script to reprocess a meeting whose audio is already on disk
 * but MOM generation failed (e.g. after a Claude API error).
 *
 * Usage:
 *   node reprocess.js <meeting_id> [audio_path]
 *
 * Examples:
 *   node reprocess.js 6
 *   node reprocess.js 6 "D:\ai-mom-system\backend\temp\meeting_6_1774981546013.mp3"
 *
 * If audio_path is omitted, the script reads it from the meetings table.
 */

require('dotenv').config();

const path      = require('path');
const fs        = require('fs');
const { sequelize } = require('./src/config/db');

async function main() {
  const meetingId = parseInt(process.argv[2], 10);
  if (!meetingId) {
    console.error('Usage: node reprocess.js <meeting_id> [audio_path]');
    process.exit(1);
  }

  // Boot models
  require('./src/models');
  const { Meeting } = require('./src/models');

  await sequelize.authenticate();
  console.log(`DB connected. Looking up meeting ${meetingId}…`);

  const meeting = await Meeting.findByPk(meetingId);
  if (!meeting) {
    console.error(`Meeting ${meetingId} not found in DB`);
    process.exit(1);
  }

  const audioPath = process.argv[3] || meeting.audio_path;
  if (!audioPath) {
    console.error(`Meeting ${meetingId} has no audio_path in DB. Pass it as the second argument.`);
    process.exit(1);
  }

  if (!fs.existsSync(audioPath)) {
    console.error(`Audio file not found: ${audioPath}`);
    process.exit(1);
  }

  const sizeMB = (fs.statSync(audioPath).size / 1024 / 1024).toFixed(2);
  console.log(`Audio file: ${audioPath} (${sizeMB} MB)`);
  console.log(`Meeting status: ${meeting.status}`);
  console.log('Starting MOM generation…\n');

  // Reset status so the pipeline can write 'completed'
  await meeting.update({ status: 'processing', audio_path: audioPath });

  const claudeService = require('./src/services/claude.service');
  await claudeService.generateMOM(meetingId, audioPath);

  console.log(`\nDone! MOM generated for meeting ${meetingId}.`);
  await sequelize.close();
}

main().catch((err) => {
  console.error('Reprocess failed:', err.message);
  process.exit(1);
});
