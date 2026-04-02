const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { sequelize } = require('../config/db');
const { Meeting, MOM, MOMKeyPoint, Task, MeetingAttendee } = require('../models');
const { parseMOMResponse } = require('./mom.parser');
const { deleteFile } = require('../utils/fileManager');
const logger = require('../utils/logger');

// ─── Constants ────────────────────────────────────────────────────────────────

const ANTHROPIC_BASE   = 'https://api.anthropic.com/v1';
const MODEL            = 'claude-sonnet-4-6';
const FILES_API_BETA   = 'files-api-2025-04-14';

// Files above this threshold are uploaded via Files API (500 MB limit).
// Files below are sent inline as base64 (32 MB limit).
const MAX_INLINE_BYTES = 32 * 1024 * 1024;

const BASE_HEADERS = () => ({
  'x-api-key':          process.env.ANTHROPIC_API_KEY,
  'anthropic-version':  '2023-06-01',
});

const FILES_API_HEADERS = () => ({
  ...BASE_HEADERS(),
  'anthropic-beta': FILES_API_BETA,
});

// ─── MOM Generation Prompt (CLAUDE.md Section 11) ─────────────────────────────

const MOM_GENERATION_PROMPT = `
You are an expert meeting documentation assistant.
Below is the full audio transcript of a meeting.

Your task is to generate a structured Minutes of Meeting (MOM) document.

Return ONLY a valid JSON object with this exact structure (no preamble, no markdown, no explanation):

{
  "transcript": "<full verbatim transcript of the audio>",
  "summary": "<2-4 sentence executive summary of the meeting>",
  "key_points": [
    "<key discussion point 1>",
    "<key discussion point 2>"
  ],
  "tasks": [
    {
      "title": "<clear task title>",
      "description": "<what needs to be done>",
      "assigned_to": "<name of person responsible, or 'Unassigned'>",
      "deadline": "<YYYY-MM-DD format if mentioned, or null>",
      "priority": "<high | medium | low — infer from urgency of discussion>"
    }
  ],
  "attendees": [
    "<Name 1>",
    "<Name 2>"
  ],
  "meeting_date": "<YYYY-MM-DD if identifiable from conversation, or null>"
}

Rules:
- Extract ALL action items and tasks discussed.
- If a deadline is mentioned verbally (e.g., "by Friday", "end of month"), convert to an approximate date.
- If a task owner is not clearly mentioned, set assigned_to to "Unassigned".
- Key points should capture major topics and decisions, not just a list of everything said.
- Do not hallucinate information not present in the audio.
- Return JSON only.
`.trim();

// ─── Files API ────────────────────────────────────────────────────────────────

/**
 * Upload an audio file to the Anthropic Files API.
 * Returns the file_id string.
 *
 * @param {string} audioPath - Local path to the .mp3 file
 * @returns {Promise<string>} file_id (e.g. "file_011CNha…")
 */
async function uploadToFilesAPI(audioPath) {
  logger.info(`Uploading ${audioPath} to Files API…`);

  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath), {
    filename: require('path').basename(audioPath),
    contentType: 'audio/mpeg',
  });

  const res = await axios.post(`${ANTHROPIC_BASE}/files`, form, {
    headers: {
      ...FILES_API_HEADERS(),
      ...form.getHeaders(),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const fileId = res.data.id;
  logger.info(`Files API upload complete — file_id: ${fileId}`);
  return fileId;
}

/**
 * Delete a file from the Anthropic Files API.
 * Always called after MOM generation — files are retained indefinitely otherwise.
 *
 * @param {string} fileId
 */
async function deleteFromFilesAPI(fileId) {
  try {
    await axios.delete(`${ANTHROPIC_BASE}/files/${fileId}`, {
      headers: FILES_API_HEADERS(),
    });
    logger.info(`Files API: deleted file ${fileId}`);
  } catch (err) {
    // Log but don't throw — a failed delete shouldn't break the MOM pipeline
    logger.error(`Files API: failed to delete ${fileId}: ${err.message}`);
  }
}

// ─── Messages API calls ───────────────────────────────────────────────────────

/**
 * Call Claude via Files API reference (for audio > 32 MB).
 * Requires the beta header to reference the uploaded file.
 */
async function callClaudeWithFileId(fileId) {
  logger.info(`Calling Claude (Files API) with file_id: ${fileId}`);

  const res = await axios.post(
    `${ANTHROPIC_BASE}/messages`,
    {
      model:      MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'audio',
              source: {
                type:    'file',
                file_id: fileId,
              },
            },
            {
              type: 'text',
              text: MOM_GENERATION_PROMPT,
            },
          ],
        },
      ],
    },
    {
      headers: {
        ...FILES_API_HEADERS(),
        'Content-Type': 'application/json',
      },
    }
  ).catch(handleAxiosError);

  return extractTextFromResponse(res.data);
}

/**
 * Call Claude with the audio file encoded as base64 inline (for files ≤ 32 MB).
 * Does not require the Files API beta header.
 */
async function callClaudeWithInlineBase64(audioPath) {
  logger.info(`Calling Claude (inline base64) for: ${audioPath}`);

  const audioData = fs.readFileSync(audioPath).toString('base64');

  const res = await axios.post(
    `${ANTHROPIC_BASE}/messages`,
    {
      model:      MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'audio',
              source: {
                type:       'base64',
                media_type: 'audio/mpeg',
                data:       audioData,
              },
            },
            {
              type: 'text',
              text: MOM_GENERATION_PROMPT,
            },
          ],
        },
      ],
    },
    {
      headers: {
        ...FILES_API_HEADERS(),   // audio support requires the beta header
        'Content-Type': 'application/json',
      },
    }
  ).catch(handleAxiosError);

  return extractTextFromResponse(res.data);
}

function extractTextFromResponse(responseData) {
  const block = responseData?.content?.find((b) => b.type === 'text');
  if (!block?.text) {
    throw new Error('Claude returned no text content in its response');
  }
  return block.text;
}

/** Throw a descriptive error that includes the actual Claude API error body. */
function handleAxiosError(err) {
  if (err.response) {
    const body = JSON.stringify(err.response.data ?? {});
    throw new Error(`Claude API ${err.response.status}: ${body}`);
  }
  throw err;
}

// ─── DB persistence ───────────────────────────────────────────────────────────

/**
 * Write the parsed MOM into the database — idempotent (upsert pattern):
 *   - Creates or updates the moms row
 *   - Replaces mom_key_points rows
 *   - Creates tasks rows (skipped if MOM already has tasks, unless forced)
 *   - Creates meeting_attendees rows for any new names
 *   - Sets meeting.status = 'completed'
 */
async function persistMOM(meeting, parsed) {
  await sequelize.transaction(async (t) => {
    // ── moms ────────────────────────────────────────────────────────────────
    const [mom, momCreated] = await MOM.findOrCreate({
      where:    { meeting_id: meeting.id },
      defaults: {
        meeting_id:      meeting.id,
        raw_transcript:  parsed.transcript,
        summary:         parsed.summary,
      },
      transaction: t,
    });

    if (!momCreated) {
      await mom.update(
        { raw_transcript: parsed.transcript, summary: parsed.summary },
        { transaction: t }
      );
    }

    // ── mom_key_points (full replace) ────────────────────────────────────────
    await MOMKeyPoint.destroy({ where: { mom_id: mom.id }, transaction: t });
    if (parsed.key_points.length > 0) {
      await MOMKeyPoint.bulkCreate(
        parsed.key_points.map((text, idx) => ({
          mom_id:      mom.id,
          point_text:  text,
          order_index: idx,
        })),
        { transaction: t }
      );
    }

    // ── tasks (only create on first generation; regeneration replaces) ───────
    if (!momCreated) {
      await Task.destroy({ where: { mom_id: mom.id }, transaction: t });
    }
    if (parsed.tasks.length > 0) {
      await Task.bulkCreate(
        parsed.tasks.map((task) => ({
          mom_id:      mom.id,
          title:       task.title,
          description: task.description,
          assigned_to: task.assigned_to,
          deadline:    task.deadline,
          priority:    task.priority,
          status:      'pending',
        })),
        { transaction: t }
      );
    }

    // ── meeting_attendees (add any new names found by AI) ────────────────────
    if (parsed.attendees.length > 0) {
      const existing = await MeetingAttendee.findAll({
        where: { meeting_id: meeting.id },
        attributes: ['name'],
        transaction: t,
      });
      const existingNames = new Set(existing.map((a) => a.name?.toLowerCase()));

      const newAttendees = parsed.attendees
        .filter((name) => !existingNames.has(name.toLowerCase()))
        .map((name) => ({ meeting_id: meeting.id, name }));

      if (newAttendees.length > 0) {
        await MeetingAttendee.bulkCreate(newAttendees, { transaction: t });
      }
    }

    // ── meeting: mark completed ──────────────────────────────────────────────
    await meeting.update(
      { status: 'completed', claude_file_id: null },
      { transaction: t }
    );
  });

  logger.info(`MOM persisted for meeting ${meeting.id}`);
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Full pipeline: upload audio → call Claude → parse response → save to DB.
 *
 * Automatically chooses Files API vs inline base64 based on file size.
 * Always deletes the Files API file after use (per CLAUDE.md Section 4.4).
 *
 * @param {number} meetingId
 * @param {string} audioPath  - Local path to the converted .mp3 file
 * @returns {Promise<object>} The parsed MOM object
 */
async function generateMOM(meetingId, audioPath) {
  const meeting = await Meeting.findByPk(meetingId);
  if (!meeting) throw new Error(`Meeting ${meetingId} not found`);

  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  const fileSizeBytes = fs.statSync(audioPath).size;
  const fileSizeMB    = (fileSizeBytes / 1024 / 1024).toFixed(1);
  logger.info(`Generating MOM for meeting ${meetingId} — audio: ${fileSizeMB} MB`);

  let rawClaudeText;

  if (fileSizeBytes > MAX_INLINE_BYTES) {
    // ── Large file: use Files API ──────────────────────────────────────────
    let fileId;
    try {
      fileId = await uploadToFilesAPI(audioPath);
      await meeting.update({ claude_file_id: fileId });

      rawClaudeText = await callClaudeWithFileId(fileId);
    } finally {
      // Mandatory cleanup — Files API files are never auto-deleted
      if (fileId) {
        await deleteFromFilesAPI(fileId);
        await meeting.update({ claude_file_id: null }).catch(() => {});
      }
    }
  } else {
    // ── Small file: inline base64 ──────────────────────────────────────────
    rawClaudeText = await callClaudeWithInlineBase64(audioPath);
  }

  // Parse and persist
  const parsed = parseMOMResponse(rawClaudeText);
  await persistMOM(meeting, parsed);

  return parsed;
}

module.exports = { generateMOM, uploadToFilesAPI, deleteFromFilesAPI };
