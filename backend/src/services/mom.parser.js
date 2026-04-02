const logger = require('../utils/logger');

/**
 * Parse Claude's raw text response into a structured MOM object.
 *
 * Claude is instructed to return pure JSON, but may occasionally wrap it in
 * a markdown code fence.  This parser strips fences, trims whitespace, and
 * validates the required fields before returning.
 *
 * @param {string} rawText - The text content from Claude's response message
 * @returns {{
 *   transcript: string,
 *   summary: string,
 *   key_points: string[],
 *   tasks: Array<{title,description,assigned_to,deadline,priority}>,
 *   attendees: string[],
 *   meeting_date: string|null
 * }}
 * @throws {Error} If the response cannot be parsed into a valid MOM structure
 */
function parseMOMResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Claude returned an empty or non-string response');
  }

  // ── Step 1: strip markdown code fences ──────────────────────────────────
  let cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')  // opening fence
    .replace(/\s*```\s*$/i, '')        // closing fence
    .trim();

  // ── Step 2: attempt direct JSON parse ───────────────────────────────────
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (directErr) {
    // ── Step 3: try to extract the first {...} block via regex ─────────────
    logger.warn(`Direct JSON parse failed (${directErr.message}) — attempting extraction`);
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`Cannot extract JSON from Claude response: ${directErr.message}`);
    }
    try {
      parsed = JSON.parse(match[0]);
    } catch (extractErr) {
      throw new Error(`Failed to parse extracted JSON: ${extractErr.message}`);
    }
  }

  // ── Step 4: validate required fields ────────────────────────────────────
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    throw new Error('Claude response missing required field: summary');
  }

  // ── Step 5: normalise optional fields with safe defaults ────────────────
  const normalized = {
    transcript:   typeof parsed.transcript  === 'string' ? parsed.transcript.trim()  : '',
    summary:      parsed.summary.trim(),
    key_points:   normaliseStringArray(parsed.key_points,  'key_points'),
    tasks:        normaliseTasks(parsed.tasks),
    attendees:    normaliseStringArray(parsed.attendees,    'attendees'),
    meeting_date: normaliseDate(parsed.meeting_date),
  };

  logger.info(
    `MOM parsed — ${normalized.key_points.length} key points, ` +
    `${normalized.tasks.length} tasks, ${normalized.attendees.length} attendees`
  );

  return normalized;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseStringArray(value, fieldName) {
  if (!value) return [];
  if (!Array.isArray(value)) {
    logger.warn(`Expected array for "${fieldName}", got ${typeof value} — treating as empty`);
    return [];
  }
  return value
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function normaliseTasks(raw) {
  if (!raw || !Array.isArray(raw)) return [];

  return raw
    .filter((t) => t && typeof t.title === 'string' && t.title.trim())
    .map((t) => ({
      title:       t.title.trim(),
      description: typeof t.description === 'string' ? t.description.trim() : null,
      assigned_to: typeof t.assigned_to === 'string' && t.assigned_to.trim()
        ? t.assigned_to.trim()
        : 'Unassigned',
      deadline:    normaliseDate(t.deadline),
      priority:    normalisePriority(t.priority),
    }));
}

function normaliseDate(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') return null;
  // Validate YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Try to parse freeform date and convert
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return null;
}

function normalisePriority(raw) {
  const valid = ['high', 'medium', 'low'];
  if (typeof raw === 'string' && valid.includes(raw.toLowerCase())) {
    return raw.toLowerCase();
  }
  return 'medium';
}

module.exports = { parseMOMResponse };
