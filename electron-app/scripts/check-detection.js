const assert = require('assert/strict');
const { classifyMeetingWindow, stripBrowserSuffix } = require('../src/meetingDetection');

const positives = [
  ['Meet - Daily Standup - Google Chrome', 'Google Meet', 'Daily Standup'],
  ['Meet - abc-defg-hij - Microsoft Edge', 'Google Meet', 'abc-defg-hij'],
  ['Sprint Review - Google Meet - Mozilla Firefox', 'Google Meet', 'Sprint Review'],
  ['meet.google.com/abc-defg-hij - Brave', 'Google Meet'],
  ['Microsoft Teams - Project Call', 'Teams', 'Project Call'],
  ['Project Sync meeting | Microsoft Teams', 'Teams', 'Project Sync meeting'],
  ['Teams meeting in General - Google Chrome', 'Teams'],
  ['Zoom Meeting', 'Zoom', 'Zoom Meeting'],
  ['Zoom Webinar - Google Chrome', 'Zoom'],
  ['Weekly planning - Zoom Workplace', 'Zoom', 'Weekly planning'],
  // Zoom Workplace main window — detected, audio probe validates if meeting is active
  ['Zoom Workplace', 'Zoom', 'Zoom Meeting'],
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
  'Zoom',
  'Zoom - Google Chrome',
  'Zoom Meetings - Google Chrome',
  'Team Chat - Zoom Workplace',
  'Join Meeting - Zoom Workplace',
  'Launch Meeting - Zoom',
  'Schedule Meeting - Zoom Workplace',
  'Home - Zoom Workplace',
  'Upcoming - Zoom Workplace',
  'Notes - Zoom Workplace',
  'Settings - Zoom Workplace',
  'Profile - Zoom Workplace',
  'Microsoft Teams',
  'Microsoft Teams - Google Chrome',
  'Project Sync | Microsoft Teams',
  'Calendar | Microsoft Teams',
  'Chat | Microsoft Teams',
  'Activity | Microsoft Teams',
  'Files | Microsoft Teams',
  'Teams | Microsoft Teams',
  'Calls | Microsoft Teams',
  // Chat windows where the contact/thread name contains "meeting"
  'Chat | MEETING WITH PRANAV | Microsoft Teams',
  'Chat | Meeting notes | Microsoft Teams',
  // Web pages that mention Teams + meetings (most common false positive)
  'BasedJellyfish11/Meeting-Auto-Recorder: Automatically local record Teams and Blackboard Collaborate meetings - Google Chrome',
  'How to schedule Teams meetings - Microsoft Edge',
  'Best practices for Teams meetings - Chrome',
  'You left the meeting - Google Chrome',
  'You have left the meeting | Microsoft Teams',
  'This meeting has ended - Zoom',
  'Thank you for joining - Zoom Workplace',
  'Meet - abc-defg-hij - You left the meeting - Google Chrome',
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
