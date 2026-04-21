/**
 * Seed script — clears all data and inserts fresh demo data.
 *
 * Usage:
 *   cd backend
 *   node scripts/seed.js
 *
 * Access control demo:
 *   Meeting 1 — attended by BOTH admin and Pranav → both can view MOM
 *   Meeting 2 — attended by admin ONLY             → only admin can view MOM
 *   Meeting 3 — attended by Pranav ONLY            → only Pranav can view MOM
 *   Meeting 4 — scheduled, both invited            → both can see it
 *
 * Login credentials:
 *   admin   developer@mosaique.link          Admin@1234
 *   member  pranavswordsman5335@gmail.com     Pranav@1234
 */

require('dotenv').config();
const bcrypt        = require('bcryptjs');
const { sequelize } = require('../src/config/db');

require('../src/models/index');
const { User, Meeting, MOM, MOMKeyPoint, Task, MeetingAttendee } = require('../src/models/index');

function daysAgo(n)     { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }
function addMinutes(date, m) { return new Date(date.getTime() + m * 60 * 1000); }

async function seed() {
  await sequelize.authenticate();
  console.log('✔ DB connected');

  // 1. Wipe all tables (FK-safe order)
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['notifications', 'tasks', 'mom_key_points', 'moms', 'meeting_attendees', 'meetings', 'users']) {
    await sequelize.query(`TRUNCATE TABLE \`${t}\``);
    console.log(`  truncated ${t}`);
  }
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('✔ All tables cleared');

  // 2. Users
  const [adminHash, pranavHash] = await Promise.all([
    bcrypt.hash('Admin@1234',  12),
    bcrypt.hash('Pranav@1234', 12),
  ]);

  const admin  = await User.create({ name: 'Admin',  email: 'developer@mosaique.link',         password: adminHash,  role: 'admin'  });
  const pranav = await User.create({ name: 'Pranav', email: 'pranavswordsman5335@gmail.com',   password: pranavHash, role: 'member' });
  console.log('✔ Users created (2)');

  // 3. Meetings
  const m1Start = daysAgo(7);
  const m1 = await Meeting.create({
    title: 'Q2 Product Roadmap Review',
    meet_link: 'https://meet.google.com/abc-defg-hij',
    scheduled_at: m1Start, started_at: m1Start,
    ended_at: addMinutes(m1Start, 52), duration_seconds: 52 * 60,
    organizer_id: admin.id, organizer_name: admin.name, organizer_email: admin.email,
    created_by: admin.id, status: 'completed', location: 'Google Meet',
  });

  const m2Start = daysAgo(4);
  const m2 = await Meeting.create({
    title: 'Infrastructure Cost Review',
    meet_link: 'https://meet.google.com/zzz-admin-only',
    scheduled_at: m2Start, started_at: m2Start,
    ended_at: addMinutes(m2Start, 30), duration_seconds: 30 * 60,
    organizer_id: admin.id, organizer_name: admin.name, organizer_email: admin.email,
    created_by: admin.id, status: 'completed', location: 'Google Meet',
  });

  const m3Start = daysAgo(2);
  const m3 = await Meeting.create({
    title: 'Frontend Design Review',
    meet_link: 'https://meet.google.com/yyy-pranav-only',
    scheduled_at: m3Start, started_at: m3Start,
    ended_at: addMinutes(m3Start, 45), duration_seconds: 45 * 60,
    organizer_id: pranav.id, organizer_name: pranav.name, organizer_email: pranav.email,
    created_by: pranav.id, status: 'completed', location: 'Google Meet',
  });

  const m4Start = daysFromNow(2);
  m4Start.setHours(10, 0, 0, 0);
  const m4 = await Meeting.create({
    title: 'Sprint 15 Planning',
    meet_link: 'https://meet.google.com/spr-int15-xyz',
    scheduled_at: m4Start,
    organizer_id: admin.id, organizer_name: admin.name, organizer_email: admin.email,
    created_by: admin.id, status: 'scheduled', location: 'Google Meet',
  });

  console.log('✔ Meetings created (4)');

  // 4. Attendees
  // M1 — BOTH users
  await MeetingAttendee.bulkCreate([
    { meeting_id: m1.id, user_id: admin.id,  email: admin.email,  name: admin.name,  status: 'present' },
    { meeting_id: m1.id, user_id: pranav.id, email: pranav.email, name: pranav.name, status: 'present' },
  ]);

  // M2 — admin ONLY (Pranav cannot see this unless assigned a task)
  await MeetingAttendee.bulkCreate([
    { meeting_id: m2.id, user_id: admin.id,  email: admin.email,  name: admin.name,  status: 'present' },
  ]);

  // M3 — Pranav ONLY (admin can see via admin role; non-admin users other than Pranav cannot)
  await MeetingAttendee.bulkCreate([
    { meeting_id: m3.id, user_id: pranav.id, email: pranav.email, name: pranav.name, status: 'present' },
  ]);

  // M4 — BOTH users (scheduled)
  await MeetingAttendee.bulkCreate([
    { meeting_id: m4.id, user_id: admin.id,  email: admin.email,  name: admin.name,  status: 'present' },
    { meeting_id: m4.id, user_id: pranav.id, email: pranav.email, name: pranav.name, status: 'present' },
  ]);

  console.log('✔ Attendees created');

  // 5. MOMs for completed meetings
  const mom1 = await MOM.create({
    meeting_id: m1.id,
    summary: 'The team reviewed the Q2 product roadmap and confirmed priorities. Key focus areas are the new onboarding flow, dashboard performance, and the AI MOM feature rollout. Budget was approved.',
    raw_transcript: '[Auto-generated transcript placeholder]',
  });

  const mom2 = await MOM.create({
    meeting_id: m2.id,
    summary: 'Admin-only review of cloud infrastructure costs. AWS spend is up 18% QoQ. Decision made to migrate two services to smaller instance types. Pranav assigned a task to implement caching to reduce DB query load.',
    raw_transcript: '[Auto-generated transcript placeholder]',
  });

  const mom3 = await MOM.create({
    meeting_id: m3.id,
    summary: 'Pranav led a frontend design review covering the component library updates and the new calendar page. Decisions made on typography scale and colour tokens for the dark-mode redesign.',
    raw_transcript: '[Auto-generated transcript placeholder]',
  });

  console.log('✔ MOMs created (3)');

  // 6. Key Points
  await MOMKeyPoint.bulkCreate([
    { mom_id: mom1.id, point_text: '[Agenda] Q2 product roadmap priorities and milestone targets',           order_index: 0 },
    { mom_id: mom1.id, point_text: '[Discussion] Onboarding redesign approved — wireframes due April 30',   order_index: 1 },
    { mom_id: mom1.id, point_text: '[Discussion] Dashboard performance target: <1 s load time',             order_index: 2 },
    { mom_id: mom1.id, point_text: '[Decision] AI MOM beta release in Week 3 of Q2',                        order_index: 3 },
    { mom_id: mom1.id, point_text: '[Decision] Q2 budget ¥2.4 M approved with ¥300 K contingency reserve', order_index: 4 },
  ]);

  await MOMKeyPoint.bulkCreate([
    { mom_id: mom2.id, point_text: '[Agenda] AWS cost review — 18% QoQ increase',                               order_index: 0 },
    { mom_id: mom2.id, point_text: '[Discussion] Two services to be migrated to smaller instance types',          order_index: 1 },
    { mom_id: mom2.id, point_text: '[Decision] Implement DB query caching to reduce RDS spend',                   order_index: 2 },
  ]);

  await MOMKeyPoint.bulkCreate([
    { mom_id: mom3.id, point_text: '[Agenda] Component library audit and dark-mode token updates',            order_index: 0 },
    { mom_id: mom3.id, point_text: '[Discussion] Typography scale locked to 4-step modular scale',            order_index: 1 },
    { mom_id: mom3.id, point_text: '[Decision] Colour tokens finalised — PR to be raised by end of week',    order_index: 2 },
  ]);

  console.log('✔ Key points created');

  // 7. Tasks
  const in7  = daysFromNow(7).toISOString().slice(0, 10);
  const in14 = daysFromNow(14).toISOString().slice(0, 10);

  await Task.bulkCreate([
    // MOM 1 — joint meeting, tasks for both users
    { mom_id: mom1.id, title: 'Deliver onboarding flow wireframes',   assignee_id: pranav.id, assigned_to: pranav.name, deadline: in7,  priority: 'high',   status: 'pending' },
    { mom_id: mom1.id, title: 'Prepare AI MOM beta release notes',    assignee_id: admin.id,  assigned_to: admin.name,  deadline: in7,  priority: 'medium', status: 'pending' },

    // MOM 2 — admin-only meeting, but one task assigned to Pranav
    // → Pranav gets task_only access to this MOM via the assignment
    { mom_id: mom2.id, title: 'Implement DB query caching',            assignee_id: pranav.id, assigned_to: pranav.name, deadline: in14, priority: 'high',   status: 'pending' },
    { mom_id: mom2.id, title: 'Migrate auth service to t3.small',      assignee_id: admin.id,  assigned_to: admin.name,  deadline: in14, priority: 'medium', status: 'pending' },

    // MOM 3 — Pranav-only meeting, task for Pranav
    { mom_id: mom3.id, title: 'Raise colour token PR',                 assignee_id: pranav.id, assigned_to: pranav.name, deadline: in7,  priority: 'high',   status: 'pending' },
  ]);

  console.log('✔ Tasks created');

  console.log('\n✅ Seed complete!\n');
  console.log('  Access control demo:');
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log('  Meeting 1 "Q2 Roadmap"           → admin ✓  Pranav ✓  (both attended)');
  console.log('  Meeting 2 "Infrastructure"        → admin ✓  Pranav ✓* (task_only — has task assigned)');
  console.log('  Meeting 3 "Frontend Design"       → admin ✓  Pranav ✓  (Pranav attended; admin sees all)');
  console.log('  Meeting 4 "Sprint 15" (scheduled) → admin ✓  Pranav ✓  (both invited)');
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log('\n  Login credentials:');
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log('  admin   developer@mosaique.link          Admin@1234');
  console.log('  member  pranavswordsman5335@gmail.com     Pranav@1234');
  console.log('  ─────────────────────────────────────────────────────────────────\n');

  await sequelize.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
