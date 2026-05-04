const DASH_SEPARATOR = /\s+[-\u2013\u2014]\s+/;
const MEET_CODE_RE = /\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b/i;

const BROWSER_SUFFIX_RE = new RegExp(
  String.raw`(?:\s+(?:[-\u2013\u2014]|\|)\s+)(?:` +
  [
    'Google Chrome',
    'Chrome',
    'Microsoft Edge',
    'Edge',
    'Brave',
    'Opera GX',
    'Opera',
    'Mozilla Firefox',
    'Firefox',
    'Vivaldi',
    'Arc',
    'Chromium',
    'Yandex Browser',
    'DuckDuckGo',
    'Safari',
  ].join('|') +
  String.raw`)$`,
  'i',
);

function cleanWindowName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}

function stripBrowserSuffix(name) {
  return cleanWindowName(name).replace(BROWSER_SUFFIX_RE, '').trim();
}

function stripTrailingPlatform(name, platformName) {
  return stripBrowserSuffix(name)
    .replace(new RegExp(String.raw`\s+(?:[-\u2013\u2014]|\|)\s+${platformName}$`, 'i'), '')
    .trim();
}

function classifyMeetingWindow(windowName) {
  const name = cleanWindowName(windowName);
  if (!name) return null;

  const lower = name.toLowerCase();
  const noBrowser = stripBrowserSuffix(name);
  const noBrowserLower = noBrowser.toLowerCase();

  if (
    /^meet\s*[-\u2013\u2014]\s+/i.test(name) ||
    MEET_CODE_RE.test(name) ||
    /^.+\s+[-\u2013\u2014|]\s+google meet$/i.test(noBrowser) ||
    /\bmeet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}\b/i.test(name)
  ) {
    return { platform: 'Google Meet', title: extractMeetingTitle(name, 'Google Meet') };
  }

  if (
    /\bzoom\b/i.test(name) &&
    (
      /\b(meeting|webinar|workplace|conference|call)\b/i.test(name) ||
      /\bzoom\.us\b/i.test(lower) ||
      /^zoom$/i.test(noBrowser)
    )
  ) {
    return { platform: 'Zoom', title: extractMeetingTitle(name, 'Zoom') };
  }

  if (
    /\b(microsoft teams|teams)\b/i.test(name) &&
    (
      /\b(meeting|call|conference|webinar|live event)\b/i.test(name) ||
      /\bteams\.microsoft\.com\b/i.test(lower) ||
      /\|\s*microsoft teams$/i.test(name) ||
      /^microsoft teams\b/i.test(noBrowser)
    )
  ) {
    return { platform: 'Teams', title: extractMeetingTitle(name, 'Teams') };
  }

  if (
    /\b(webex|cisco webex)\b/i.test(name) &&
    /\b(meeting|webinar|call|event)\b/i.test(name)
  ) {
    return { platform: 'Webex', title: extractMeetingTitle(name, 'Webex') };
  }

  if (
    /\b(meet\.jit\.si|jitsi)\b/i.test(name) &&
    /\b(meeting|call|jitsi|meet\.jit\.si)\b/i.test(name)
  ) {
    return { platform: 'Jitsi Meet', title: extractMeetingTitle(name, 'Jitsi Meet') };
  }

  if (
    /\b(gotomeeting|go to meeting)\b/i.test(name) &&
    /\b(meeting|session|call)\b/i.test(name)
  ) {
    return { platform: 'GoTo Meeting', title: extractMeetingTitle(name, 'GoTo Meeting') };
  }

  if (
    /\b(slack)\b/i.test(name) &&
    /\b(huddle|call)\b/i.test(name)
  ) {
    return { platform: 'Slack', title: extractMeetingTitle(name, 'Slack') };
  }

  return null;
}

function extractMeetingTitle(windowName, platformHint) {
  const name = cleanWindowName(windowName);
  const noBrowser = stripBrowserSuffix(name);

  if (platformHint === 'Google Meet' || /^Meet\b/i.test(noBrowser) || /\bGoogle Meet\b/i.test(noBrowser)) {
    let inner = noBrowser
      .replace(/^Meet\s*[-\u2013\u2014]\s*/i, '')
      .replace(/\s*[-\u2013\u2014]\s*Google Meet$/i, '')
      .replace(/\s*\|\s*Google Meet$/i, '')
      .trim();
    if (!inner && MEET_CODE_RE.test(noBrowser)) inner = noBrowser.match(MEET_CODE_RE)[0];
    return inner || 'Google Meet';
  }

  if (platformHint === 'Teams' || /\bMicrosoft Teams\b/i.test(noBrowser)) {
    return stripTrailingPlatform(noBrowser, 'Microsoft Teams')
      .replace(/^Microsoft Teams\s*[-\u2013\u2014]\s*/i, '')
      .replace(/^Microsoft Teams$/i, 'Teams Meeting')
      .trim() || 'Teams Meeting';
  }

  if (platformHint === 'Zoom' || /\bZoom\b/i.test(noBrowser)) {
    const title = noBrowser
      .replace(/\s*[-\u2013\u2014|]\s*Zoom(?: Workplace)?$/i, '')
      .replace(/^Zoom\s*[-\u2013\u2014]\s*/i, '')
      .trim();
    if (/webinar/i.test(noBrowser)) return title || 'Zoom Webinar';
    return title || 'Zoom Meeting';
  }

  if (platformHint === 'Webex' || /\bWebex\b/i.test(noBrowser)) {
    return stripTrailingPlatform(noBrowser, '(?:Cisco )?Webex').replace(/^Cisco Webex\s*/i, '').trim() || 'Webex Meeting';
  }

  return noBrowser.split(DASH_SEPARATOR)[0]?.trim() || noBrowser || 'Meeting';
}

function findMeetingSource(sources) {
  for (const source of sources || []) {
    const meeting = classifyMeetingWindow(source.name);
    if (meeting) return { ...source, ...meeting };
  }
  return null;
}

module.exports = {
  classifyMeetingWindow,
  extractMeetingTitle,
  findMeetingSource,
  stripBrowserSuffix,
};
