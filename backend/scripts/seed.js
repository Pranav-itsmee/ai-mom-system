/**
 * Seed script — creates the database if missing, syncs all tables, then inserts demo data.
 *
 * Usage:
 *   cd backend
 *   node scripts/seed.js
 *
 * Users created:
 *   admin   developer@mosaique.link          Admin@123
 *   member  pranavswordsman5335@gmail.com     Pranav@2003
 *   member  bala@mosaique.link               Bala@123
 */

require('dotenv').config();
const bcrypt    = require('bcryptjs');
const mysql     = require('mysql2/promise');
const { sequelize } = require('../src/config/db');

require('../src/models/index');
const { User, Meeting, MOM, MOMKeyPoint, Task, MeetingAttendee } = require('../src/models/index');

function daysAgo(n)     { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }
function addMinutes(date, m) { return new Date(date.getTime() + m * 60 * 1000); }

async function createDatabaseIfMissing() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
  });
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'ai_mom_db'}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.end();
  console.log(`✔ Database "${process.env.DB_NAME || 'ai_mom_db'}" ready`);
}

async function seed() {
  // Step 1: ensure DB exists
  await createDatabaseIfMissing();

  // Step 2: connect + sync all models (creates tables if missing)
  await sequelize.authenticate();
  await sequelize.sync();
  console.log('✔ All tables synced');

  // Step 3: wipe existing data (FK-safe order)
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['notifications', 'tasks', 'mom_key_points', 'moms', 'meeting_attendees', 'meetings', 'users']) {
    try { await sequelize.query(`TRUNCATE TABLE \`${t}\``); } catch {}
  }
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('✔ Tables cleared');

  // Step 4: Users
  const [adminHash, pranavHash, balaHash] = await Promise.all([
    bcrypt.hash('Admin@123',   12),
    bcrypt.hash('Pranav@2003', 12),
    bcrypt.hash('Bala@123',    12),
  ]);

  const admin  = await User.create({ name: 'Admin',  email: 'developer@mosaique.link',       password: adminHash,  role: 'admin'  });
  const pranav = await User.create({ name: 'Pranav', email: 'pranavswordsman5335@gmail.com', password: pranavHash, role: 'member' });
  const bala   = await User.create({ name: 'Bala',   email: 'bala@mosaique.link',            password: balaHash,   role: 'member' });
  console.log('✔ Users created (3)');

  // Step 5: Meetings
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
    meet_link: 'https://meet.google.com/zzz-infra-cost',
    scheduled_at: m2Start, started_at: m2Start,
    ended_at: addMinutes(m2Start, 35), duration_seconds: 35 * 60,
    organizer_id: admin.id, organizer_name: admin.name, organizer_email: admin.email,
    created_by: admin.id, status: 'completed', location: 'Google Meet',
  });

  const m3Start = daysAgo(2);
  const m3 = await Meeting.create({
    title: 'Frontend Design Review',
    meet_link: 'https://meet.google.com/yyy-design-rev',
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

  // Step 6: Attendees
  // M1 — all 3 users
  await MeetingAttendee.bulkCreate([
    { meeting_id: m1.id, user_id: admin.id,  email: admin.email,  name: admin.name,  status: 'present' },
    { meeting_id: m1.id, user_id: pranav.id, email: pranav.email, name: pranav.name, status: 'present' },
    { meeting_id: m1.id, user_id: bala.id,   email: bala.email,   name: bala.name,   status: 'present' },
  ]);
  // M2 — admin + bala
  await MeetingAttendee.bulkCreate([
    { meeting_id: m2.id, user_id: admin.id,  email: admin.email,  name: admin.name,  status: 'present' },
    { meeting_id: m2.id, user_id: bala.id,   email: bala.email,   name: bala.name,   status: 'present' },
  ]);
  // M3 — pranav + bala
  await MeetingAttendee.bulkCreate([
    { meeting_id: m3.id, user_id: pranav.id, email: pranav.email, name: pranav.name, status: 'present' },
    { meeting_id: m3.id, user_id: bala.id,   email: bala.email,   name: bala.name,   status: 'present' },
  ]);
  // M4 — all 3 (scheduled)
  await MeetingAttendee.bulkCreate([
    { meeting_id: m4.id, user_id: admin.id,  email: admin.email,  name: admin.name,  status: 'present' },
    { meeting_id: m4.id, user_id: pranav.id, email: pranav.email, name: pranav.name, status: 'present' },
    { meeting_id: m4.id, user_id: bala.id,   email: bala.email,   name: bala.name,   status: 'present' },
  ]);
  console.log('✔ Attendees created');

  // Step 7: MOMs
  const mom1 = await MOM.create({
    meeting_id: m1.id,
    summary: 'The team reviewed the Q2 product roadmap and confirmed priorities. Key focus areas are the new onboarding flow, dashboard performance, and the AI MOM feature rollout. Budget was approved.',
    raw_transcript: '[Auto-generated transcript placeholder]',
  });
  const mom2 = await MOM.create({
    meeting_id: m2.id,
    summary: 'Admin and Bala reviewed cloud infrastructure costs. AWS spend is up 18% QoQ. Decision made to migrate two services to smaller instance types and implement DB query caching.',
    raw_transcript: '[Auto-generated transcript placeholder]',
  });
  const mom3 = await MOM.create({
    meeting_id: m3.id,
    summary: 'Pranav and Bala conducted a frontend design review covering component library updates and the new calendar page. Decisions made on typography scale and colour tokens for dark-mode.',
    raw_transcript: '[Auto-generated transcript placeholder]',
  });
  console.log('✔ MOMs created (3)');

  // Step 8: Key Points
  await MOMKeyPoint.bulkCreate([
    { mom_id: mom1.id, point_text: '[Agenda] Q2 product roadmap priorities and milestone targets',           order_index: 0 },
    { mom_id: mom1.id, point_text: '[Discussion] Onboarding redesign approved — wireframes due April 30',   order_index: 1 },
    { mom_id: mom1.id, point_text: '[Discussion] Dashboard performance target: <1 s load time',             order_index: 2 },
    { mom_id: mom1.id, point_text: '[Decision] AI MOM beta release in Week 3 of Q2',                        order_index: 3 },
    { mom_id: mom1.id, point_text: '[Decision] Q2 budget approved with contingency reserve',                order_index: 4 },
  ]);
  await MOMKeyPoint.bulkCreate([
    { mom_id: mom2.id, point_text: '[Agenda] AWS cost review — 18% QoQ increase',                          order_index: 0 },
    { mom_id: mom2.id, point_text: '[Discussion] Two services to be migrated to smaller instance types',    order_index: 1 },
    { mom_id: mom2.id, point_text: '[Decision] Implement DB query caching to reduce RDS spend',             order_index: 2 },
  ]);
  await MOMKeyPoint.bulkCreate([
    { mom_id: mom3.id, point_text: '[Agenda] Component library audit and dark-mode token updates',          order_index: 0 },
    { mom_id: mom3.id, point_text: '[Discussion] Typography scale locked to 4-step modular scale',          order_index: 1 },
    { mom_id: mom3.id, point_text: '[Decision] Colour tokens finalised — PR to be raised by end of week',   order_index: 2 },
  ]);
  console.log('✔ Key points created');

  // Step 9: Tasks
  const in7  = daysFromNow(7).toISOString().slice(0, 10);
  const in14 = daysFromNow(14).toISOString().slice(0, 10);

  await Task.bulkCreate([
    { mom_id: mom1.id, title: 'Deliver onboarding flow wireframes',  assignee_id: pranav.id, assigned_to: pranav.name, deadline: in7,  priority: 'high',   status: 'pending' },
    { mom_id: mom1.id, title: 'Prepare AI MOM beta release notes',   assignee_id: admin.id,  assigned_to: admin.name,  deadline: in7,  priority: 'medium', status: 'pending' },
    { mom_id: mom1.id, title: 'Run dashboard load time benchmark',   assignee_id: bala.id,   assigned_to: bala.name,   deadline: in7,  priority: 'medium', status: 'pending' },
    { mom_id: mom2.id, title: 'Implement DB query caching',          assignee_id: pranav.id, assigned_to: pranav.name, deadline: in14, priority: 'high',   status: 'pending' },
    { mom_id: mom2.id, title: 'Migrate auth service to t3.small',    assignee_id: bala.id,   assigned_to: bala.name,   deadline: in14, priority: 'medium', status: 'pending' },
    { mom_id: mom3.id, title: 'Raise colour token PR',               assignee_id: pranav.id, assigned_to: pranav.name, deadline: in7,  priority: 'high',   status: 'pending' },
    { mom_id: mom3.id, title: 'Update component library docs',       assignee_id: bala.id,   assigned_to: bala.name,   deadline: in14, priority: 'low',    status: 'pending' },
  ]);
  console.log('✔ Tasks created');

  console.log('\n✅ Seed complete!\n');
  console.log('  Login credentials:');
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log('  admin   developer@mosaique.link          Admin@123');
  console.log('  member  pranavswordsman5335@gmail.com     Pranav@2003');
  console.log('  member  bala@mosaique.link               Bala@123');
  console.log('  ─────────────────────────────────────────────────────────────\n');

  await sequelize.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  console.error(err);
  process.exit(1);
});
