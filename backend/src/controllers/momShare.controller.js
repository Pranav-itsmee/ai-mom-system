const nodemailer = require('nodemailer');
const https = require('https');
const url   = require('url');
const axios = require('axios');
const {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, Packer, convertInchesToTwip,
} = require('docx');
const { MOM, MOMKeyPoint, Task, Meeting, User, MeetingAttendee } = require('../models');
const logger = require('../utils/logger');

// ── Claude rewrite for professional DOCX ─────────────────────────────────────

async function rewriteWithClaude(mom, agendaTexts, discTexts, decTexts) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const prompt = `You are a professional business writer preparing an official Minutes of Meeting document.

Your task: consolidate and rewrite the raw meeting content below into clean bullet points.

CONSOLIDATION RULES (most important):
- If two or more items talk about the same topic or subject, MERGE them into ONE bullet that covers both
- Each bullet must be a single, self-contained statement about ONE distinct topic
- Remove duplicates and overlapping points entirely
- Keep bullets concise — one clear sentence each
- Use formal business tone throughout
- Do not invent information not present in the raw content
- If a section is empty, return []

Return ONLY a valid JSON object — no markdown, no explanation:
{
  "summary": "<2–3 sentence professional executive summary combining all key points>",
  "agenda": ["<consolidated agenda bullet>", ...],
  "discussion": ["<consolidated discussion bullet>", ...],
  "decisions": ["<consolidated decision bullet>", ...]
}

--- RAW CONTENT ---
SUMMARY: ${mom.summary ?? ''}
AGENDA: ${agendaTexts.join(' | ')}
DISCUSSION: ${discTexts.join(' | ')}
DECISIONS: ${decTexts.join(' | ')}`;

  try {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key':         process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
      },
    );
    const raw  = res.data.content?.[0]?.text ?? '';
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : null;
  } catch (err) {
    logger.warn(`[MOM Share] Claude rewrite failed — using raw content: ${err.message}`);
    return null;
  }
}

// ── Shared: load MOM with all context ────────────────────────────────────────

async function loadMOM(momId) {
  return MOM.findByPk(momId, {
    include: [
      { model: MOMKeyPoint, as: 'keyPoints', order: [['order_index', 'ASC']] },
      {
        model: Task, as: 'tasks',
        include: [{ model: User, as: 'assignee', attributes: ['id', 'name', 'email'] }],
      },
      {
        model: Meeting,
        as: 'meeting',
        attributes: ['id', 'title', 'scheduled_at', 'location', 'meet_link', 'organizer_id'],
        include: [
          { model: User, as: 'organizer', attributes: ['id', 'name', 'email'] },
          {
            model: MeetingAttendee, as: 'attendees',
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
          },
        ],
      },
    ],
  });
}

// ── Build DOCX buffer ─────────────────────────────────────────────────────────

async function buildMOMDocx(mom, sender) {
  const m        = mom.meeting;
  const title    = m?.title ?? 'Meeting Minutes';
  const dateStr  = m?.scheduled_at
    ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(m.scheduled_at))
    : 'N/A';
  const location = m?.location || (m?.meet_link ? 'Virtual Meeting (Online)' : 'N/A');
  const organizer = m?.organizer;
  const momRef   = `MOM-${String(mom.id).padStart(4, '0')}`;

  // ── Colors ──
  const TEAL   = '3A8899';
  const BLUE   = '3B82F6';
  const PURPLE = '7C3AED';
  const GREEN  = '16A34A';
  const AMBER  = 'D97706';
  const RED    = 'DC2626';
  const GRAY   = '64748B';
  const BLACK  = '1A1A2E';
  const WHITE  = 'FFFFFF';

  // ── parsePrefix — mirrors frontend logic ──
  const KNOWN_PREFIXES = [
    '[EN Agenda]', '[EN Discussion]', '[EN Decision]', '[EN Risk]',
    '[Agenda]', '[Discussion]', '[Decision]', '[Risk]',
    '[議題]', '[議論]', '[決定]', '[リスク]',
  ];
  function parsePrefix(text) {
    for (const p of KNOWN_PREFIXES) {
      if (text.startsWith(p)) return { prefix: p, rest: text.slice(p.length).trimStart() };
    }
    const match = text.match(/^(\[[^\]]+\])\s*/);
    if (match) return { prefix: match[1], rest: text.slice(match[0].length) };
    return { prefix: null, rest: text };
  }

  // ── Categorise key points ──
  const AGENDA_PFX     = ['[Agenda]',    '[EN Agenda]',    '[議題]'];
  const DISCUSSION_PFX = ['[Discussion]','[EN Discussion]','[議論]'];
  const DECISION_PFX   = ['[Decision]',  '[EN Decision]',  '[決定]'];
  const RISK_PFX       = ['[Risk]',      '[EN Risk]',      '[リスク]'];
  const ALL_KNOWN      = [...AGENDA_PFX, ...DISCUSSION_PFX, ...DECISION_PFX, ...RISK_PFX];

  const keyPoints      = mom.keyPoints ?? [];
  const agendaPoints   = keyPoints.filter((kp) => AGENDA_PFX.some((p) => kp.point_text.startsWith(p)));
  const discussionPts  = keyPoints.filter((kp) => DISCUSSION_PFX.some((p) => kp.point_text.startsWith(p)));
  const decisionPoints = keyPoints.filter((kp) => DECISION_PFX.some((p) => kp.point_text.startsWith(p)));
  const riskPoints     = keyPoints.filter((kp) => RISK_PFX.some((p) => kp.point_text.startsWith(p)));
  const otherPoints    = keyPoints.filter((kp) => !ALL_KNOWN.some((p) => kp.point_text.startsWith(p)));
  const agendaDiscRows = [
    ...agendaPoints.map((kp) => ({ id: kp.id, point_text: kp.point_text, type: 'agenda' })),
    ...discussionPts.map((kp) => ({ id: kp.id, point_text: kp.point_text, type: 'discussion' })),
  ];

  const attendees = m?.attendees ?? [];

  // ── Border helpers — use subtle visible borders for Google Docs compatibility ──
  // (BorderStyle.NONE causes Google Docs to silently hide table content)
  const ghostBorder  = { style: BorderStyle.SINGLE, size: 1, color: 'F1F5F9' }; // near-invisible
  const thinBorder   = { style: BorderStyle.SINGLE, size: 3, color: 'E2E8F0' };
  const allGhost     = { top: ghostBorder, bottom: ghostBorder, left: ghostBorder, right: ghostBorder };
  const bottomBorder = { top: ghostBorder, bottom: thinBorder, left: ghostBorder, right: ghostBorder };

  // ── Cell builders ──
  function hdrCell(text) {
    return new TableCell({
      shading: { fill: 'E8F4F6' },
      borders: { top: ghostBorder, bottom: thinBorder, left: ghostBorder, right: ghostBorder },
      children: [new Paragraph({
        children: [new TextRun({ text, bold: true, size: 16, color: TEAL, allCaps: true })],
        spacing: { before: 60, after: 60 },
      })],
    });
  }

  function dataCell(text, color = BLACK, bold = false) {
    return new TableCell({
      borders: bottomBorder,
      children: [new Paragraph({
        children: [new TextRun({ text: String(text ?? '—'), size: 18, color, bold })],
        spacing: { before: 60, after: 60 },
      })],
    });
  }

  function multiLineCell(lines) {
    return new TableCell({
      borders: bottomBorder,
      children: lines.map(({ text, size = 18, color = BLACK, bold = false }) =>
        new Paragraph({
          children: [new TextRun({ text, size, color, bold })],
          spacing: { before: 30, after: 30 },
        })
      ),
    });
  }

  // ── Section heading builder ──
  let sectionNum = 0;
  function sectionHeader(text, accentColor) {
    sectionNum += 1;
    return [
      new Paragraph({ spacing: { before: 440, after: 0 } }),
      new Paragraph({
        children: [
          new TextRun({ text: `${sectionNum}.  `, size: 22, color: GRAY, bold: true }),
          new TextRun({ text: text.toUpperCase(), size: 22, color: BLACK, bold: true }),
        ],
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: accentColor } },
        spacing: { before: 0, after: 140 },
      }),
    ];
  }

  const children = [];

  // ── DOCUMENT TITLE BANNER ──
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'MINUTES OF MEETING', size: 22, color: TEAL, bold: true, allCaps: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [new TextRun({ text: title, size: 56, color: BLACK, bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: dateStr, size: 24, color: GRAY })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [new TextRun({ text: location !== 'N/A' ? location : '', size: 22, color: GRAY, italics: true })],
      alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL } },
      spacing: { after: 0 },
    }),
  );

  // ── SECTION 1: Meeting Details — 2-column layout avoids colspan (breaks Google Docs) ──
  children.push(...sectionHeader('Meeting Details', TEAL));
  const detailRows = [
    ['Date & Time',      dateStr],
    ['Venue / Platform', location],
    ['Host',             organizer?.name ?? '—'],
    ['Contact',          organizer?.email ?? '—'],
    ['Meeting Type',     m?.meet_link ? 'Virtual (Online)' : 'In-Person'],
    ['MOM Reference',    momRef],
    ...(m?.meet_link ? [['Meeting Link', m.meet_link]] : []),
  ];
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [2340, 7020], // label 25% | value 75%  (total 9360 twips = 6.5" at 1440 twips/inch)
    rows: detailRows.map(([label, value]) => new TableRow({
      children: [
        new TableCell({
          shading: { fill: 'E8F4F6' },
          borders: { top: ghostBorder, bottom: thinBorder, left: ghostBorder, right: ghostBorder },
          width: { size: 25, type: WidthType.PERCENTAGE },
          children: [new Paragraph({
            children: [new TextRun({ text: label, bold: true, size: 16, color: TEAL, allCaps: true })],
            spacing: { before: 60, after: 60 },
          })],
        }),
        new TableCell({
          borders: bottomBorder,
          width: { size: 75, type: WidthType.PERCENTAGE },
          children: [new Paragraph({
            children: [new TextRun({ text: String(value ?? '—'), size: 18, color: label === 'MOM Reference' ? TEAL : BLACK, bold: label === 'MOM Reference' })],
            spacing: { before: 60, after: 60 },
          })],
        }),
      ],
    })),
  }));

  // ── Summary / Purpose ──
  if (mom.summary) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Purpose / Objective', size: 19, color: GRAY, bold: true, allCaps: true })],
        spacing: { before: 200, after: 100 },
      }),
      ...(mom.summary).split('\n').map((line) => new Paragraph({
        children: [new TextRun({ text: line || ' ', size: 20, color: BLACK })],
        spacing: { after: 60 },
      })),
    );
  }

  // Page usable width at 1-inch margins: 6.5" = 9360 twips

  // ── SECTION 2: Attendees ──
  if (attendees.length > 0) {
    children.push(...sectionHeader('Attendees', BLUE));
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [500, 2560, 4460, 1840], // # | Name | Email | Role  (total 9360)
      rows: [
        new TableRow({
          tableHeader: true,
          children: ['#', 'Name', 'Email', 'Role'].map((h) => hdrCell(h)),
        }),
        ...attendees.map((a, i) => {
          const displayName  = a.user?.name  ?? a.name  ?? '—';
          const displayEmail = a.user?.email ?? a.email ?? '—';
          const isOrganizer  = m?.organizer_id && (a.user?.id === m.organizer_id);
          return new TableRow({
            children: [
              dataCell(String(i + 1), GRAY),
              new TableCell({
                borders: bottomBorder,
                children: [new Paragraph({
                  children: [
                    new TextRun({ text: displayName, size: 18, color: BLACK }),
                    ...(isOrganizer ? [new TextRun({ text: '  [Host]', size: 16, color: AMBER, bold: true })] : []),
                  ],
                  spacing: { before: 60, after: 60 },
                })],
              }),
              dataCell(displayEmail, GRAY),
              dataCell(a.status === 'absent' ? 'Absent' : 'Present', a.status === 'absent' ? RED : GREEN, true),
            ],
          });
        }),
      ],
    }));
  }

  // ── Claude professional rewrite (falls back to raw if API unavailable) ──
  const rawAgenda  = agendaPoints.map((kp) => parsePrefix(kp.point_text).rest);
  const rawDisc    = discussionPts.map((kp) => parsePrefix(kp.point_text).rest);
  const rawDec     = decisionPoints.map((kp) => parsePrefix(kp.point_text).rest);
  const rewritten  = await rewriteWithClaude(mom, rawAgenda, rawDisc, rawDec);
  const proSummary    = rewritten?.summary    || mom.summary || '';
  const proAgenda     = rewritten?.agenda?.length     ? rewritten.agenda     : rawAgenda;
  const proDiscussion = rewritten?.discussion?.length ? rewritten.discussion : rawDisc;
  const proDecisions  = rewritten?.decisions?.length  ? rewritten.decisions  : rawDec;

  // Overwrite the summary paragraph with the professional version
  const summaryIdx = children.findIndex((c) => c instanceof Paragraph &&
    c.options?.children?.some?.((r) => r instanceof TextRun && r.options?.text === 'Purpose / Objective'));
  if (summaryIdx !== -1 && proSummary) {
    // Replace all paragraphs after the Purpose label until the next non-paragraph
    let i = summaryIdx + 1;
    while (i < children.length && children[i] instanceof Paragraph) {
      children.splice(i, 1);
    }
    proSummary.split('\n').forEach((line, idx) => {
      children.splice(summaryIdx + 1 + idx, 0, new Paragraph({
        children: [new TextRun({ text: line || ' ', size: 20, color: BLACK })],
        spacing: { after: 60 },
      }));
    });
  }

  // Helper — always renders as bullets; Claude has already consolidated same-topic items
  function bulletSection(headerText, accentColor, items) {
    if (!items.length) return;
    children.push(...sectionHeader(headerText, accentColor));
    items.forEach((text) => children.push(new Paragraph({
      bullet: { level: 0 },
      children: [new TextRun({ text, size: 20, color: BLACK })],
      spacing: { after: 80 },
    })));
  }

  // ── SECTION 3: Agenda ──
  bulletSection('Agenda', PURPLE, proAgenda);

  // ── SECTION 4: Discussion Points ──
  bulletSection('Discussion Points', BLUE, proDiscussion);

  // ── SECTION 5: Decisions Made ──
  bulletSection('Decisions Made', GREEN, proDecisions);

  // Action Items intentionally excluded from the emailed DOCX

  // ── SECTION 6: Risks, Blockers & Notes ──
  const allRisks = [...riskPoints, ...otherPoints];
  if (allRisks.length > 0) {
    children.push(...sectionHeader('Risks, Blockers & Notes', RED));
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [600, 7320, 1440], // Ref | Description | Severity  (total 9360)
      rows: [
        new TableRow({ tableHeader: true, children: ['Ref', 'Description', 'Severity'].map((h) => hdrCell(h)) }),
        ...allRisks.map((kp, i) => {
          const { rest } = parsePrefix(kp.point_text);
          const isRisk    = RISK_PFX.some((p) => kp.point_text.startsWith(p));
          return new TableRow({
            children: [
              dataCell(`R${i + 1}`, RED, true),
              dataCell(rest),
              dataCell(isRisk ? 'Risk' : 'Note', isRisk ? RED : GRAY, true),
            ],
          });
        }),
      ],
    }));
  }

  // ── Footer ──
  children.push(
    new Paragraph({ spacing: { before: 480 } }),
    new Paragraph({
      children: [new TextRun({
        text: `Generated by AI MOM System  ·  Shared by ${sender?.name ?? 'a team member'}${sender?.email ? ` (${sender.email})` : ''}`,
        size: 16, color: GRAY, italics: true,
      })],
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' } },
      spacing: { before: 120 },
    }),
  );

  const doc = new Document({
    creator:     sender?.name ?? 'AI MOM System',
    title,
    description: `Minutes of Meeting — ${title} — ${dateStr}`,
    sections: [{
      properties: {
        page: {
          margin: {
            top:    convertInchesToTwip(1),
            right:  convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left:   convertInchesToTwip(1),
          },
        },
      },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}

// ── Build plain-text email body ───────────────────────────────────────────────

function buildEmailHTML(mom, sender) {
  const m       = mom.meeting;
  const dateStr = m?.scheduled_at ? new Date(m.scheduled_at).toLocaleString() : 'N/A';
  const location = m?.location || (m?.meet_link ? 'Virtual Meeting' : 'N/A');
  const title   = m?.title ?? 'Meeting Minutes';

  return `
<!DOCTYPE html><html><body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <h1 style="color:#3A8899;font-size:20px;margin-bottom:4px">${title}</h1>
  <p style="color:#888;font-size:13px;margin-bottom:20px">${dateStr} · ${location}</p>

  <p style="font-size:13px;line-height:1.7;color:#555">
    Please find the full Minutes of Meeting attached as a Word document (<strong>.docx</strong>).
  </p>

  <h2 style="font-size:15px;border-bottom:2px solid #B4D3D9;padding-bottom:6px;margin-top:24px">Summary</h2>
  <p style="font-size:13px;line-height:1.7;white-space:pre-wrap">${mom.summary ?? ''}</p>

  <p style="font-size:11px;color:#aaa;margin-top:32px;text-align:center">
    Shared by <strong>${sender?.name ?? 'a team member'}</strong>${sender?.email ? ` (${sender.email})` : ''} via AI MOM System
  </p>
</body></html>`;
}

// ── POST /mom/:id/share/email ─────────────────────────────────────────────────

async function shareByEmail(req, res, next) {
  try {
    const { emails } = req.body;
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'At least one recipient email is required' });
    }

    const mom = await loadMOM(req.params.id);
    if (!mom) return res.status(404).json({ error: 'MOM not found' });

    const sender = await User.findByPk(req.user.id, { attributes: ['id', 'name', 'email'] });

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      return res.status(503).json({ error: 'Email is not configured on this server. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env.' });
    }

    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const subject     = `MOM: ${mom.meeting?.title ?? 'Meeting Minutes'}`;
    const html        = buildEmailHTML(mom, sender);
    const docxBuffer  = await buildMOMDocx(mom, sender);
    const filename    = `MOM_${(mom.meeting?.title ?? 'Meeting').replace(/[^a-z0-9]/gi, '_')}.docx`;

    const rawFrom  = process.env.SMTP_FROM || process.env.SMTP_USER;
    const fromField = rawFrom.includes('<') ? rawFrom : `"AI MOM System" <${rawFrom}>`;

    await transporter.sendMail({
      from:    fromField,
      replyTo: sender ? `"${sender.name}" <${sender.email}>` : undefined,
      to:      emails.join(', '),
      subject,
      html,
      attachments: [{
        filename,
        content:     docxBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }],
    });

    logger.info(`MOM ${mom.id} emailed (with DOCX) to ${emails.join(', ')}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ── POST /mom/:id/share/googlechat ────────────────────────────────────────────

async function shareByGoogleChat(req, res, next) {
  try {
    const { webhook_url } = req.body;
    if (!webhook_url) return res.status(400).json({ error: 'webhook_url is required' });

    const mom = await loadMOM(req.params.id);
    if (!mom) return res.status(404).json({ error: 'MOM not found' });

    const sender = await User.findByPk(req.user.id, { attributes: ['id', 'name', 'email'] });

    const m = mom.meeting;
    const dateStr     = m ? new Date(m.scheduled_at).toLocaleString() : '';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const link        = `${frontendUrl}/mom/${mom.id}`;

    const summarySnippet = (mom.summary ?? '').slice(0, 300).trim();
    const taskLines = (mom.tasks ?? [])
      .slice(0, 5)
      .map((t) => `• ${t.title} (${t.assignee?.name ?? t.assigned_to ?? 'unassigned'})`)
      .join('\n');

    const body = JSON.stringify({
      cardsV2: [{
        cardId: `mom-${mom.id}`,
        card: {
          header: {
            title:     m?.title ?? 'Meeting Minutes',
            subtitle:  dateStr,
            imageType: 'SQUARE',
          },
          sections: [
            {
              header:   'Summary',
              widgets: [{ textParagraph: { text: summarySnippet + (mom.summary?.length > 300 ? '…' : '') } }],
            },
            ...(taskLines ? [{
              header:   'Action Items',
              widgets: [{ textParagraph: { text: taskLines } }],
            }] : []),
            {
              widgets: [{
                buttonList: {
                  buttons: [{ text: 'View Full MOM', onClick: { openLink: { url: link } } }],
                },
              }],
            },
            {
              widgets: [{
                textParagraph: {
                  text: `<font color="#888888"><i>Shared by ${sender?.name ?? 'a team member'}</i></font>`,
                },
              }],
            },
          ],
        },
      }],
    });

    const parsed = new url.URL(webhook_url);
    await new Promise((resolve, reject) => {
      const options = {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      };
      const req2 = https.request(options, (r) => {
        r.resume();
        if (r.statusCode >= 200 && r.statusCode < 300) resolve(null);
        else reject(new Error(`Google Chat webhook returned ${r.statusCode}`));
      });
      req2.on('error', reject);
      req2.write(body);
      req2.end();
    });

    logger.info(`MOM ${mom.id} shared to Google Chat webhook`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { shareByEmail, shareByGoogleChat };
