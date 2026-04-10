const logger = require('../utils/logger');

/**
 * Parse Claude's raw text response into the raw JSON object Claude produced.
 *
 * Claude is instructed to return pure JSON, but may occasionally wrap it in
 * a markdown code fence.  This parser strips fences, parses the JSON, and
 * does a minimal structural check before returning the raw object.
 *
 * The caller (normalizeForDB in claude.service.js) is responsible for
 * extracting language-specific fields from the returned object.
 *
 * @param {string} rawText - The text content from Claude's response message
 * @returns {object} The raw parsed Claude JSON object
 * @throws {Error} If the response cannot be parsed or is structurally invalid
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

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Claude response is not a JSON object');
  }

  // ── Step 4: minimal structural check ────────────────────────────────────
  // English: must have top-level summary
  // Japanese: must have japanese.summary or english.summary
  const isJapanese = parsed.language === 'japanese';
  const hasSummary = isJapanese
    ? (parsed.japanese?.summary || parsed.english?.summary)
    : parsed.summary;

  if (!hasSummary) {
    throw new Error('Claude response missing required field: summary');
  }

  const actionCount = isJapanese
    ? ((parsed.english?.action_items || parsed.japanese?.action_items) || []).length
    : (parsed.action_items || []).length;

  logger.info(
    `MOM parsed — language: ${parsed.language ?? 'english'}, ` +
    `action_items: ${actionCount}`
  );

  // Return the raw object — normalizeForDB extracts all fields
  return parsed;
}

module.exports = { parseMOMResponse };
