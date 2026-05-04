const assert = require('assert/strict');
const { classifyMeetingWindow, stripBrowserSuffix } = require('../src/meetingDetection');

const positives = [
  ['Meet - Daily Standup - Google Chrome', 'Google Meet', 'Daily Standup'],
  ['Meet - abc-defg-hij - Microsoft Edge', 'Google Meet', 'abc-defg-hij'],
  ['Sprint Review - Google Meet - Mozilla Firefox', 'Google Meet', 'Sprint Review'],
  ['meet.google.com/abc-defg-hij - Brave', 'Google Meet'],
  ['Microsoft Teams - Project Call', 'Teams', 'Project Call'],
  ['Project Sync | Microsoft Teams', 'Teams', 'Project Sync'],
  ['Teams meeting in General - Google Chrome', 'Teams'],
  ['Zoom Meeting', 'Zoom', 'Zoom Meeting'],
  ['Zoom Webinar - Google Chrome', 'Zoom'],
  ['Weekly planning - Zoom Workplace', 'Zoom', 'Weekly planning'],
  ['Cisco Webex Meeting - Edge', 'Webex'],
  ['Jitsi Meet - Mozilla Firefox', 'Jitsi Meet'],
  ['GoToMeeting session - Chrome', 'GoTo Meeting'],
  ['Slack huddle - Arc', 'Slack'],
];

const negatives = [
  'ZoomInfo pricing - Google Chrome',
  'Football teams standings - Microsoft Edge',
  'Meet our team - Company Site - Chrome',
  'Google Calendar - Mozilla Firefox',
  'Meet',
  'Google Meet',
  'Google Meet - Chrome',
  'AI MOM Desktop',
];

for (const [name, platform, title] of positives) {
  const result = classifyMeetingWindow(name);
  assert.ok(result, `Expected meeting for "${name}"`);
  assert.equal(result.platform, platform, `Platform mismatch for "${name}"`);
  if (title) assert.equal(result.title, title, `Title mismatch for "${name}"`);
}

for (const name of negatives) {
  assert.equal(classifyMeetingWindow(name), null, `Expected no meeting for "${name}"`);
}

assert.equal(stripBrowserSuffix('Project Sync | Microsoft Edge'), 'Project Sync');
assert.equal(stripBrowserSuffix('Project Sync - Google Chrome'), 'Project Sync');

console.log(`Detection checks passed (${positives.length} positive, ${negatives.length} negative).`);
