const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { sequelize } = require('../config/db');
const { Meeting, MOM, MOMKeyPoint, Task, MeetingAttendee } = require('../models');
const { parseMOMResponse } = require('./mom.parser');
const logger = require('../utils/logger');

// ─── Constants ────────────────────────────────────────────────────────────────

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const OPENAI_BASE    = 'https://api.openai.com/v1';
const MODEL          = 'claude-sonnet-4-6';

const CLAUDE_HEADERS = () => ({
  'x-api-key':         process.env.ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
  'Content-Type':      'application/json',
});

// ─── MOM Prompts ──────────────────────────────────────────────────────────────

const PROMPT_ENGLISH = `
You are an expert meeting documentation assistant.
The transcript below is in English. Generate the MOM in English.

Return ONLY a valid JSON object (no preamble, no markdown):

{
  "language": "english",
  "transcript": "<verbatim transcript as provided>",
  "title": "<meeting title inferred from discussion, or 'Untitled Meeting'>",
  "date_time": "<YYYY-MM-DD HH:MM if identifiable from conversation, else null>",
  "participants": ["<Name 1>", "<Name 2>"],
  "agenda": ["<agenda topic 1>", "<agenda topic 2>"],
  "key_discussion_points": ["<discussion point 1>", "<discussion point 2>"],
  "decisions": ["<decision 1>", "<decision 2>"],
  "action_items": [
    {
      "title": "<short task title, e.g. 'Design UI mockups'>",
      "description": "<what exactly needs to be done>",
      "assigned_to": "<person's name, or 'Unassigned'>",
      "deadline": "<YYYY-MM-DD if mentioned, else null>",
      "priority": "<high | medium | low>"
    }
  ],
  "summary": "<2–4 sentence professional executive summary>"
}

Rules:
- action_items is CRITICAL — extract EVERY task, assignment, or follow-up.
- Include ANY sentence where someone says they WILL DO, WILL HANDLE, WILL WORK ON, IS RESPONSIBLE FOR, or IS ASSIGNED something.
- Informal assignments like "Pranav will handle the design" or "Arul will work on the UI" MUST be extracted as action items.
- Each person mentioned with a responsibility gets their own action_item entry.
- Convert verbal deadlines ("by Friday", "end of month") to YYYY-MM-DD. Use current year if not specified.
- Do not invent information not present in the transcript.
- Return JSON only — no markdown, no explanation.
`.trim();

const PROMPT_JAPANESE = `
You are an expert meeting documentation assistant.
The transcript below is primarily in Japanese. Generate the MOM in BOTH Japanese and English.

Return ONLY a valid JSON object (no preamble, no markdown):

{
  "language": "japanese",
  "transcript": "<verbatim transcript as provided>",
  "japanese": {
    "title": "<会議タイトル（議論から推定）>",
    "date_time": "<YYYY-MM-DD HH:MM または null>",
    "participants": ["<参加者1>", "<参加者2>"],
    "agenda": ["<議題1>", "<議題2>"],
    "key_discussion_points": ["<議論のポイント1>", "<議論のポイント2>"],
    "decisions": ["<決定事項1>", "<決定事項2>"],
    "action_items": [
      {
        "title": "<タスク名>",
        "description": "<詳細>",
        "assigned_to": "<担当者名 または '未割当'>",
        "deadline": "<YYYY-MM-DD または null>",
        "priority": "<high | medium | low>"
      }
    ],
    "summary": "<2〜4文の要約（専門的なトーン）>"
  },
  "english": {
    "title": "<Meeting title>",
    "date_time": "<YYYY-MM-DD HH:MM or null>",
    "participants": ["<Name 1>", "<Name 2>"],
    "agenda": ["<agenda topic 1>", "<agenda topic 2>"],
    "key_discussion_points": ["<discussion point 1>", "<discussion point 2>"],
    "decisions": ["<decision 1>", "<decision 2>"],
    "action_items": [
      {
        "title": "<task title>",
        "description": "<what needs to be done>",
        "assigned_to": "<name or 'Unassigned'>",
        "deadline": "<YYYY-MM-DD or null>",
        "priority": "<high | medium | low>"
      }
    ],
    "summary": "<2–4 sentence professional executive summary (high-quality translation, not literal)>"
  }
}

Rules:
- Japanese section: use natural, professional Japanese.
- English section: natural English translation — preserve intent and nuance, not literal words.
- Extract every action item from both languages.
- Convert verbal deadlines to YYYY-MM-DD.
- Do not invent information not in the transcript.
- Return JSON only.
`.trim();

// ─── Language detection ───────────────────────────────────────────────────────

/**
 * Determine the primary meeting language from Whisper's detected language code
 * and a regex check on the transcript for Japanese characters.
 *
 * @param {string} whisperLang - ISO 639-1 code returned by Whisper (e.g. 'en', 'ja')
 * @param {string} transcript
 * @returns {'english' | 'japanese'}
 */
function detectLanguage(whisperLang, transcript) {
  if (whisperLang === 'ja') return 'japanese';
  // Fallback: Japanese Unicode ranges (hiragana, katakana, CJK)
  if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fef]/.test(transcript)) return 'japanese';
  return 'english';
}

// ─── Step 1: Transcribe audio via OpenAI Whisper ──────────────────────────────

/**
 * Transcribe an audio file using OpenAI Whisper (verbose_json for language detection).
 *
 * @param {string} audioPath
 * @returns {Promise<{ transcript: string, whisperLang: string }>}
 */
async function transcribeAudio(audioPath) {
  logger.info(`Transcribing audio: ${audioPath}`);

  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath), {
    filename: require('path').basename(audioPath),
    contentType: 'audio/mpeg',
  });
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json'); // includes language field

  const res = await axios.post(`${OPENAI_BASE}/audio/transcriptions`, form, {
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      ...form.getHeaders(),
    },
    maxBodyLength:    Infinity,
    maxContentLength: Infinity,
    timeout:          300_000,
  }).catch((err) => {
    if (err.response) {
      const body = JSON.stringify(err.response.data ?? {});
      throw new Error(`Whisper API ${err.response.status}: ${body}`);
    }
    throw err;
  });

  const transcript  = res.data.text ?? '';
  const whisperLang = res.data.language ?? 'en';
  logger.info(`Transcription complete — ${transcript.length} chars, Whisper language: ${whisperLang}`);
  return { transcript, whisperLang };
}

// ─── Step 2: Generate MOM via Claude ─────────────────────────────────────────

/**
 * Send the transcript to Claude with a language-appropriate prompt.
 *
 * @param {string} transcript
 * @param {'english' | 'japanese'} language
 * @returns {Promise<string>} Raw JSON text from Claude
 */
async function callClaudeWithTranscript(transcript, language) {
  const prompt = language === 'japanese' ? PROMPT_JAPANESE : PROMPT_ENGLISH;
  logger.info(`Calling Claude for MOM generation (language: ${language})…`);

  const res = await axios.post(
    `${ANTHROPIC_BASE}/messages`,
    {
      model:      MODEL,
      max_tokens: 8192,   // Japanese meetings produce larger output (two full MOMs)
      messages: [
        {
          role:    'user',
          content: `${prompt}\n\n---TRANSCRIPT---\n${transcript}`,
        },
      ],
    },
    {
      headers: CLAUDE_HEADERS(),
      timeout: 180_000,
    },
  ).catch((err) => {
    if (err.response) {
      const body = JSON.stringify(err.response.data ?? {});
      throw new Error(`Claude API ${err.response.status}: ${body}`);
    }
    throw err;
  });

  const block = res.data?.content?.find((b) => b.type === 'text');
  if (!block?.text) throw new Error('Claude returned no text content');
  return block.text;
}

// ─── Step 3: Normalise Claude output to DB format ────────────────────────────

/**
 * Convert the new rich MOM structure from Claude into the flat format
 * that persistMOM() / the existing DB schema expects.
 *
 * English meetings  → single flat object.
 * Japanese meetings → Japanese key points + English key points (labelled),
 *                     bilingual summary, action items in English (structured data).
 *
 * @param {object} parsed   - Parsed Claude JSON
 * @param {string} language - 'english' | 'japanese'
 * @returns {{ transcript, summary, key_points, tasks, attendees }}
 */
function normalizeForDB(parsed, language) {
  if (language === 'japanese') {
    const jp = parsed.japanese || {};
    const en = parsed.english  || {};

    const jpPoints = [
      ...(jp.agenda                || []).map((p) => `[議題] ${p}`),
      ...(jp.key_discussion_points || []).map((p) => `[議論] ${p}`),
      ...(jp.decisions             || []).map((p) => `[決定] ${p}`),
    ];
    const enPoints = [
      ...(en.agenda                || []).map((p) => `[EN Agenda] ${p}`),
      ...(en.key_discussion_points || []).map((p) => `[EN Discussion] ${p}`),
      ...(en.decisions             || []).map((p) => `[EN Decision] ${p}`),
    ];

    const tasks = (en.action_items || jp.action_items || []).map(normalizeTask);
    logger.info(`normalizeForDB [japanese] — ${tasks.length} action item(s) extracted`);
    return {
      transcript: parsed.transcript || '',
      summary:    `${jp.summary || ''}\n\n---\n[English Translation]\n${en.summary || ''}`,
      key_points: [...jpPoints, ...enPoints],
      // Use English action items so deadline/priority fields stay in English
      tasks,
      attendees:  en.participants || jp.participants || [],
    };
  }

  // English
  const tasks = (parsed.action_items || []).map(normalizeTask);
  logger.info(`normalizeForDB [english] — ${tasks.length} action item(s) extracted`);
  return {
    transcript: parsed.transcript || '',
    summary:    parsed.summary || '',
    key_points: [
      ...(parsed.agenda                || []).map((p) => `[Agenda] ${p}`),
      ...(parsed.key_discussion_points || []).map((p) => `[Discussion] ${p}`),
      ...(parsed.decisions             || []).map((p) => `[Decision] ${p}`),
    ],
    tasks,
    attendees: parsed.participants || [],
  };
}

function normalizeTask(t) {
  return {
    title:       String(t.title || '').trim(),
    description: t.description ? String(t.description).trim() : null,
    assigned_to: t.assigned_to ? String(t.assigned_to).trim() : 'Unassigned',
    deadline:    t.deadline    ? String(t.deadline).trim()    : null,
    priority:    ['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium',
  };
}

// ─── Step 4: Persist to DB ────────────────────────────────────────────────────

async function persistMOM(meeting, data) {
  await sequelize.transaction(async (t) => {
    const [mom, momCreated] = await MOM.findOrCreate({
      where:    { meeting_id: meeting.id },
      defaults: { meeting_id: meeting.id, raw_transcript: data.transcript, summary: data.summary },
      transaction: t,
    });

    if (!momCreated) {
      await mom.update({ raw_transcript: data.transcript, summary: data.summary }, { transaction: t });
    }

    await MOMKeyPoint.destroy({ where: { mom_id: mom.id }, transaction: t });
    if (data.key_points?.length > 0) {
      await MOMKeyPoint.bulkCreate(
        data.key_points.map((text, idx) => ({ mom_id: mom.id, point_text: text, order_index: idx })),
        { transaction: t },
      );
    }

    if (!momCreated) {
      await Task.destroy({ where: { mom_id: mom.id }, transaction: t });
    }
    if (data.tasks?.length > 0) {
      await Task.bulkCreate(
        data.tasks.map((task) => ({ mom_id: mom.id, ...task, status: 'pending' })),
        { transaction: t },
      );
    }

    if (data.attendees?.length > 0) {
      const existing = await MeetingAttendee.findAll({
        where: { meeting_id: meeting.id }, attributes: ['name'], transaction: t,
      });
      const existingNames = new Set(existing.map((a) => a.name?.toLowerCase()));
      const newOnes = data.attendees
        .filter((name) => name && !existingNames.has(name.toLowerCase()))
        .map((name) => ({ meeting_id: meeting.id, name }));
      if (newOnes.length > 0) {
        await MeetingAttendee.bulkCreate(newOnes, { transaction: t });
      }
    }

    await meeting.update({ status: 'completed' }, { transaction: t });
  });

  logger.info(`MOM persisted for meeting ${meeting.id}`);
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Full pipeline:
 *   1. Transcribe audio (OpenAI Whisper) + detect language
 *   2. Generate MOM (Claude) with language-appropriate prompt
 *   3. Normalise to DB format
 *   4. Persist to DB
 */
async function generateMOM(meetingId, audioPath) {
  const meeting = await Meeting.findByPk(meetingId);
  if (!meeting) throw new Error(`Meeting ${meetingId} not found`);

  if (!fs.existsSync(audioPath)) throw new Error(`Audio file not found: ${audioPath}`);

  const fileSizeMB = (fs.statSync(audioPath).size / 1024 / 1024).toFixed(1);
  logger.info(`Generating MOM for meeting ${meetingId} — audio: ${fileSizeMB} MB`);

  // Step 1 — transcribe + detect language
  const { transcript, whisperLang } = await transcribeAudio(audioPath);
  const language = detectLanguage(whisperLang, transcript);
  logger.info(`Meeting language: ${language} (Whisper reported: ${whisperLang})`);

  // Step 2 — generate MOM JSON
  const rawText = await callClaudeWithTranscript(transcript, language);

  // Step 3 — parse + normalise
  const parsed     = parseMOMResponse(rawText);
  const normalized = normalizeForDB(parsed, language);
  if (!normalized.transcript) normalized.transcript = transcript;

  // Step 4 — persist
  await persistMOM(meeting, normalized);
  return normalized;
}

module.exports = { generateMOM };
