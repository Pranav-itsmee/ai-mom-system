require('dotenv').config();
const { sequelize } = require('../src/config/db');

(async () => {
  await sequelize.authenticate();
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['notifications', 'tasks', 'mom_key_points', 'moms', 'meeting_attendees', 'meetings']) {
    await sequelize.query(`TRUNCATE TABLE \`${t}\``);
    console.log('truncated', t);
  }
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('done — users untouched');
  await sequelize.close();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
