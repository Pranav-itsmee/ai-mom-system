const nodemailer = require('nodemailer');
const https = require('https');
const url   = require('url');
const { MOM, MOMKeyPoint, Task, Meeting, User, MeetingAttendee } = require('../models');
const logger = require('../utils/logger');

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
        attributes: ['id', 'title', 'scheduled_at', 'location', 'meet_link'],
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

// ── Build HTML email body ─────────────────────────────────────────────────────

function buildEmailHTML(mom, frontendUrl) {
  const m = mom.meeting;
  const dateStr = m ? new Date(m.scheduled_at).toLocaleString() : 'N/A';
  const location = m?.location || (m?.meet_link ? 'Google Meet' : 'N/A');

  const keyPointsHTML = (mom.keyPoints ?? [])
    .map((kp) => `<li style="margin-bottom:6px">${kp.point_text}</li>`)
    .join('');

  const tasksHTML = (mom.tasks ?? [])
    .map((t) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${t.title}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${t.assignee?.name ?? t.assigned_to ?? '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${t.deadline ?? '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${t.priority}</td>
      </tr>`)
    .join('');

  const link = `${frontendUrl}/mom/${mom.id}`;

  return `
<!DOCTYPE html><html><body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <h1 style="color:#3A8899;font-size:20px;margin-bottom:4px">${m?.title ?? 'Meeting Minutes'}</h1>
  <p style="color:#888;font-size:13px;margin-bottom:20px">${dateStr} · ${location}</p>

  <h2 style="font-size:15px;border-bottom:2px solid #B4D3D9;padding-bottom:6px">Summary</h2>
  <p style="font-size:13px;line-height:1.7;white-space:pre-wrap">${mom.summary ?? ''}</p>

  ${mom.keyPoints?.length ? `
  <h2 style="font-size:15px;border-bottom:2px solid #B4D3D9;padding-bottom:6px;margin-top:24px">Key Points</h2>
  <ul style="font-size:13px;line-height:1.7;padding-left:20px">${keyPointsHTML}</ul>
  ` : ''}

  ${mom.tasks?.length ? `
  <h2 style="font-size:15px;border-bottom:2px solid #B4D3D9;padding-bottom:6px;margin-top:24px">Action Items</h2>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead>
      <tr style="background:#f5f5f5">
        <th style="padding:6px 8px;text-align:left">Task</th>
        <th style="padding:6px 8px;text-align:left">Assignee</th>
        <th style="padding:6px 8px;text-align:left">Deadline</th>
        <th style="padding:6px 8px;text-align:left">Priority</th>
      </tr>
    </thead>
    <tbody>${tasksHTML}</tbody>
  </table>
  ` : ''}

  <div style="margin-top:28px;text-align:center">
    <a href="${link}" style="background:#3A8899;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
      View Full MOM
    </a>
  </div>
  <p style="font-size:11px;color:#aaa;margin-top:24px;text-align:center">Sent via AI MOM System</p>
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

    // Build transporter from env (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM)
    // Falls back to a test-mode SMTP that logs to console if env vars are missing
    let transporter;
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      transporter = nodemailer.createTransport({
        host:   process.env.SMTP_HOST,
        port:   parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    } else {
      // ethereal / preview mode (no actual SMTP configured)
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      logger.warn('No SMTP env vars set — using Ethereal test account for email preview');
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const html = buildEmailHTML(mom, frontendUrl);
    const subject = `MOM: ${mom.meeting?.title ?? 'Meeting Minutes'}`;

    const info = await transporter.sendMail({
      from:    process.env.SMTP_FROM || '"AI MOM System" <noreply@aimom.local>',
      to:      emails.join(', '),
      subject,
      html,
    });

    // If using Ethereal, include preview URL for dev convenience
    const previewUrl = nodemailer.getTestMessageUrl(info);
    logger.info(`MOM ${mom.id} emailed to ${emails.join(', ')}${previewUrl ? ' — preview: ' + previewUrl : ''}`);

    res.json({ ok: true, ...(previewUrl ? { previewUrl } : {}) });
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

    const m = mom.meeting;
    const dateStr  = m ? new Date(m.scheduled_at).toLocaleString() : '';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const link = `${frontendUrl}/mom/${mom.id}`;

    const summarySnippet = (mom.summary ?? '').slice(0, 300).trim();
    const taskLines = (mom.tasks ?? [])
      .slice(0, 5)
      .map((t) => `• ${t.title} (${t.assignee?.name ?? t.assigned_to ?? 'unassigned'})`)
      .join('\n');

    // Google Chat Card v2 message
    const body = JSON.stringify({
      cardsV2: [{
        cardId: `mom-${mom.id}`,
        card: {
          header: {
            title: m?.title ?? 'Meeting Minutes',
            subtitle: dateStr,
            imageType: 'SQUARE',
          },
          sections: [
            {
              header: 'Summary',
              widgets: [{ textParagraph: { text: summarySnippet + (mom.summary?.length > 300 ? '…' : '') } }],
            },
            ...(taskLines ? [{
              header: 'Action Items',
              widgets: [{ textParagraph: { text: taskLines } }],
            }] : []),
            {
              widgets: [{
                buttonList: {
                  buttons: [{
                    text: 'View Full MOM',
                    onClick: { openLink: { url: link } },
                  }],
                },
              }],
            },
          ],
        },
      }],
    });

    // POST to webhook using built-in https (no extra deps)
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
