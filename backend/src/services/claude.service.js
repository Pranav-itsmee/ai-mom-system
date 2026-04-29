const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { sequelize } = require('../config/db');
const { Meeting, MOM, MOMKeyPoint, Task } = require('../models');
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

The transcript below has been classified as an ENGLISH meeting.

OUTPUT RULES (STRICT):
- Generate the MOM ONLY in English.
- DO NOT include Japanese text anywhere.
- DO NOT include translations.

Return ONLY a valid JSON object (no preamble, no markdown):

{
  "language": "english",
  "transcript": "<verbatim transcript as provided>",
  "title": "<meeting title inferred from discussion, or 'Untitled Meeting'>",
  "date_time": "<YYYY-MM-DD HH:MM if identifiable from conversation, else null>",
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

The transcript below has been classified as a JAPANESE meeting (Japanese is the primary or significantly present language).

OUTPUT RULES (STRICT):
- Generate the MOM in BOTH Japanese AND English.
- Japanese version MUST come first.
- The English section must be a faithful, professional translation of the Japanese content — not a summary, not a paraphrase. Preserve all intent, nuance, and detail.

Return ONLY a valid JSON object (no preamble, no markdown):

{
  "language": "japanese",
  "transcript": "<verbatim transcript as provided>",
  "japanese": {
    "title": "<会議タイトル（議論から推定）>",
    "date_time": "<YYYY-MM-DD HH:MM または null>",
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
    "title": "<Faithful English translation of the Japanese title>",
    "date_time": "<YYYY-MM-DD HH:MM or null>",
    "agenda": ["<faithful translation of agenda item 1>", "<faithful translation of agenda item 2>"],
    "key_discussion_points": ["<faithful translation of discussion point 1>", "<faithful translation of discussion point 2>"],
    "decisions": ["<faithful translation of decision 1>", "<faithful translation of decision 2>"],
    "action_items": [
      {
        "title": "<faithful translation of task title>",
        "description": "<faithful translation of what needs to be done>",
        "assigned_to": "<name or 'Unassigned'>",
        "deadline": "<YYYY-MM-DD or null>",
        "priority": "<high | medium | low>"
      }
    ],
    "summary": "<faithful, professional English translation of the Japanese summary — preserve full intent and detail>"
  }
}

Rules:
- Japanese section: use natural, professional Japanese.
- English section: faithful professional translation — NOT a summary, NOT a simplification. Every point in Japanese must appear in English.
- Extract every action item regardless of which language it was spoken in.
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
  // Whisper service already runs the jp-ratio check and overrides to 'ja' when needed,
  // but we run the same check here as a safety net (e.g. when using OpenAI Whisper which
  // only returns a single language code based on the first 30s of audio).
  if (whisperLang === 'ja') return 'japanese';

  // Count Japanese characters (hiragana, katakana, CJK unified ideographs)
  const jpChars    = (transcript.match(/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fef]/g) || []).length;
  const totalChars = transcript.replace(/\s/g, '').length;
  const jpRatio    = totalChars > 0 ? jpChars / totalChars : 0;

  logger.debug(`detectLanguage \u2014 whisper="${whisperLang}", jp_chars=${jpChars}, jp_ratio=${jpRatio.toFixed(3)}`);

  // \u22658% Japanese characters = Japanese is significantly present \u2192 use Japanese prompt
  if (jpRatio >= 0.08) return 'japanese';

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
  const fileSizeMB = (fs.statSync(audioPath).size / 1024 / 1024).toFixed(1);
  const useLocal   = !!process.env.WHISPER_URL;
  const backend    = useLocal ? 'local' : 'OpenAI';
  logger.info(`[Pipeline] [2/4] Whisper (${backend}): transcribing ${fileSizeMB} MB audio…`);
  const t0 = Date.now();

  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath), {
    filename:    require('path').basename(audioPath),
    contentType: 'audio/mpeg',
  });

  let url, headers;
  if (useLocal) {
    url     = `${process.env.WHISPER_URL}/transcribe`;
    headers = { ...form.getHeaders() };
  } else {
    url     = `${OPENAI_BASE}/audio/transcriptions`;
    headers = { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, ...form.getHeaders() };
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
  }

  const res = await axios.post(url, form, {
    headers,
    maxBodyLength:    Infinity,
    maxContentLength: Infinity,
    timeout:          600_000, // local processing can take longer than cloud
  }).catch((err) => {
    if (err.response) {
      const body = JSON.stringify(err.response.data ?? {});
      throw new Error(`Whisper ${backend} ${err.response.status}: ${body}`);
    }
    throw err;
  });

  const transcript  = res.data.text ?? '';
  const whisperLang = res.data.language ?? 'en';
  const elapsed     = ((Date.now() - t0) / 1000).toFixed(1);
  logger.info(`[Pipeline] [2/4] Whisper: done — ${transcript.length} chars, lang: ${whisperLang}, took ${elapsed}s`);
  if (transcript.length > 0) {
    logger.info(`[Pipeline] [2/4] Whisper: preview → "${transcript.slice(0, 120).replace(/\n/g, ' ')}…"`);
  }
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
  logger.info(`[Pipeline] [3/4] Claude: generating MOM (language: ${language}, transcript: ${transcript.length} chars)…`);
  const t0 = Date.now();

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
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  logger.info(`[Pipeline] [3/4] Claude: done — ${block.text.length} chars response, took ${elapsed}s`);
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
/**
 * Pair Japanese and English points side-by-side into a single entry.
 * Format: `[JP_PREFIX] jp text\n[EN] en translation`
 * Same-index items are assumed to be translations of each other (Claude produces them in order).
 * If counts differ, unpaired items are stored without a translation.
 */
function pairJpEn(jpList = [], enList = [], jpPrefix) {
  const len = Math.max(jpList.length, enList.length);
  const result = [];
  for (let i = 0; i < len; i++) {
    const jp = (jpList[i] || '').trim();
    const en = (enList[i] || '').trim();
    if (jp && en)  result.push(`${jpPrefix} ${jp}\n[EN] ${en}`);
    else if (jp)   result.push(`${jpPrefix} ${jp}`);
    // EN-only (no JP counterpart) — skip; EN is just a translation aid
  }
  return result;
}

function normalizeForDB(parsed, language) {
  if (language === 'japanese') {
    const jp = parsed.japanese || {};
    const en = parsed.english  || {};

    // Each JP point is paired with its EN translation in a single row.
    // Format: "[議題] japanese text\n[EN] english translation"
    const key_points = [
      ...pairJpEn(jp.agenda,                en.agenda,                '[議題]'),
      ...pairJpEn(jp.key_discussion_points, en.key_discussion_points, '[議論]'),
      ...pairJpEn(jp.decisions,             en.decisions,             '[決定]'),
    ];

    const tasks = (en.action_items || jp.action_items || []).map(normalizeTask);
    logger.info(`normalizeForDB [japanese] — ${tasks.length} action item(s) extracted`);
    return {
      transcript: parsed.transcript || '',
      summary:    `${jp.summary || ''}\n\n---\n[English Translation]\n${en.summary || ''}`,
      key_points,
      tasks,
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
  logger.info(`[Pipeline] [4/4] DB: persisting MOM — ${data.key_points?.length ?? 0} key points, ${data.tasks?.length ?? 0} tasks…`);
  const t0 = Date.now();
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

    await meeting.update({ status: 'completed' }, { transaction: t });
  });

  logger.info(`[Pipeline] [4/4] DB: done — meeting #${meeting.id} → completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Delete a file silently — used to clean up temp audio files after processing.
 */
function _deleteTempFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug(`Deleted temp file: ${filePath}`);
    }
  } catch (err) {
    logger.warn(`Could not delete temp file ${filePath}: ${err.message}`);
  }
}

/**
 * Full pipeline:
 *   1. Transcribe audio (OpenAI Whisper) + detect language
 *   2. Generate MOM (Claude) with language-appropriate prompt
 *   3. Normalise to DB format
 *   4. Persist to DB
 *   5. Clean up temp files (.webm + .mp3)
 */
async function generateMOM(meetingId, audioPath) {
  const meeting = await Meeting.findByPk(meetingId);
  if (!meeting) throw new Error(`Meeting ${meetingId} not found`);

  if (!fs.existsSync(audioPath)) throw new Error(`Audio file not found: ${audioPath}`);

  const fileSizeMB = (fs.statSync(audioPath).size / 1024 / 1024).toFixed(1);
  logger.info(`[Pipeline] Starting MOM generation for meeting #${meetingId} — "${meeting.title}" (${fileSizeMB} MB)`);
  const pipelineStart = Date.now();

  // Collect .webm files to delete immediately — MP3 is kept for 7 days (see scheduler cleanup)
  const webmFiles = new Set();
  if (audioPath.endsWith('.mp3')) {
    const originalWebm = audioPath.slice(0, -4); // strip trailing '.mp3'
    if (originalWebm) webmFiles.add(originalWebm);
  } else {
    // audioPath itself is a webm (no conversion happened)
    webmFiles.add(audioPath);
  }
  if (meeting.audio_path && meeting.audio_path !== audioPath && !meeting.audio_path.endsWith('.mp3')) {
    webmFiles.add(meeting.audio_path);
  }

  try {
    // Step 2 — transcribe + detect language
    const { transcript, whisperLang } = await transcribeAudio(audioPath);
    const language = detectLanguage(whisperLang, transcript);
    logger.info(`[Pipeline] Language detected: ${language} (Whisper: "${whisperLang}")`);

    // Step 3 — generate MOM JSON via Claude
    const rawText = await callClaudeWithTranscript(transcript, language);

    // Step 3b — parse + normalise
    const parsed     = parseMOMResponse(rawText);
    const normalized = normalizeForDB(parsed, language);
    if (!normalized.transcript) normalized.transcript = transcript;

    // Step 4 — persist to DB
    await persistMOM(meeting, normalized);

    const totalSec = ((Date.now() - pipelineStart) / 1000).toFixed(1);
    logger.info(`[Pipeline] ✓ Complete — meeting #${meetingId} processed in ${totalSec}s total`);
    return normalized;
  } finally {
    // Step 5 — delete raw .webm immediately; .mp3 is kept for 7 days (cleaned by scheduler)
    for (const f of webmFiles) _deleteTempFile(f);
  }
}

module.exports = { generateMOM };
