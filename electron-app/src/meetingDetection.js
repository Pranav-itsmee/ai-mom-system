const DASH_SEPARATOR = /\s+[-\u2013\u2014]\s+/;
const MEET_CODE_RE = /\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b/i;
const ENDED_STATE_RE = /\b(you (left|have left|were removed)|meeting (ended|has ended|is over)|call (ended|has ended)|this (meeting|call) has ended|thank you for joining|return to home screen|rejoin|join again)\b/i;
const ZOOM_NOT_JOINED_RE = /^(join|launch|start|schedule|new)\b.*\bmeeting\b/i;
const ZOOM_IDLE_AREA_RE = /^(team chat|chat|meetings?|scheduler|calendar|contacts|mail|clips|whiteboards?|home|upcoming|notes?|starred|settings?|profile|admin)\s+[-\u2013\u2014|]\s+zoom(?: workplace)?$/i;
const TEAMS_IDLE_TABS_RE = /^(activity|chat|teams|calendar|calls?|files?|apps?|dashboard|settings?)\s*[-\u2013\u2014|]\s*(?:microsoft\s+)?teams$/i;

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

function isEndedMeetingWindow(windowName) {
  return ENDED_STATE_RE.test(cleanWindowName(windowName));
}

function isZoomMeetingWindow(name, noBrowser) {
  if (!/\bzoom\b/i.test(name)) return false;
  if (/^zoom$/i.test(noBrowser)) return false; // bare "Zoom" app = idle
  if (ZOOM_NOT_JOINED_RE.test(noBrowser)) return false;
  if (ZOOM_IDLE_AREA_RE.test(noBrowser)) return false;

  // Zoom Workplace main window \u2014 may host an active integrated meeting.
  // Audio probe in renderer validates whether a real meeting is in progress.
  if (/^zoom\s+workplace$/i.test(noBrowser)) return true;

  // Standalone Zoom desktop app \u2014 must end with "Zoom Meeting" or "Zoom Webinar"
  if (/\bzoom\s+(meeting|webinar)\s*$/i.test(noBrowser)) return true;

  // Browser: "[topic] - Zoom" or "[topic] | Zoom" (non-navigation prefix)
  if (/\b(meeting|webinar|conference|call)\s+[-\u2013\u2014|]\s+zoom(?: workplace)?$/i.test(noBrowser)) return true;

  // Zoom Workplace desktop: "[topic] - Zoom Workplace" \u2014 has a non-generic prefix
  if (/^.+\s+[-\u2013\u2014|]\s+zoom\s+workplace\s*$/i.test(noBrowser)) {
    // Exclude if the prefix itself is a navigation area name
    const prefix = noBrowser.replace(/\s+[-\u2013\u2014|]\s+zoom\s+workplace\s*$/i, '').trim();
    if (ZOOM_IDLE_AREA_RE.test(`${prefix} - Zoom Workplace`)) return false;
    return true;
  }

  return false;
}

function isTeamsMeetingWindow(name, noBrowser) {
  if (!/\b(microsoft teams|teams)\b/i.test(name)) return false;
  if (/^microsoft teams$/i.test(noBrowser) || /^teams$/i.test(noBrowser)) return false;
  if (TEAMS_IDLE_TABS_RE.test(noBrowser)) return false;

  // Require "Microsoft Teams" to be the app identifier — suffix or prefix with separator.
  // This prevents random web pages that mention "Teams" and "meeting" from matching.
  const hasSuffix = /\s+[-–—|]\s+(?:microsoft\s+)?teams\s*$/i.test(noBrowser);
  const hasPrefix = /^microsoft\s+teams\s*[-–—]\s+/i.test(noBrowser);
  // Teams web client in browser shows "Teams meeting in General" without the suffix
  const hasBrowserMeetingPrefix = /^teams\s+meeting\b/i.test(noBrowser);

  if (!hasSuffix && !hasPrefix && !hasBrowserMeetingPrefix) return false;

  if (hasSuffix) {
    // Strip the trailing "| Microsoft Teams" to examine only the content prefix
    const prefix = noBrowser.replace(/\s+[-–—|]\s+(?:microsoft\s+)?teams\s*$/i, '').trim();
    // Exclude chat/activity windows: "Chat | Contact Name | Microsoft Teams"
    if (/^(chat|activity|calendar|files?|calls?|apps?)\s*[-–—|]/i.test(prefix)) return false;
    return /\b(meeting|call|conference|webinar|live event)\b/i.test(prefix);
  }

  return /\b(meeting|call|conference|webinar|live event)\b/i.test(noBrowser);
}

function classifyMeetingWindow(windowName) {
  const name = cleanWindowName(windowName);
  if (!name) return null;
  if (isEndedMeetingWindow(name)) return null;

  const noBrowser = stripBrowserSuffix(name);

  if (
    /^meet\s*[-\u2013\u2014]\s+/i.test(name) ||
    MEET_CODE_RE.test(name) ||
    /^.+\s+[-\u2013\u2014|]\s+google meet$/i.test(noBrowser) ||
    /\bmeet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}\b/i.test(name)
  ) {
    return { platform: 'Google Meet', title: extractMeetingTitle(name, 'Google Meet') };
  }

  if (isZoomMeetingWindow(name, noBrowser)) {
    return { platform: 'Zoom', title: extractMeetingTitle(name, 'Zoom') };
  }

  if (isTeamsMeetingWindow(name, noBrowser)) {
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
      .replace(/^Zoom\s*(?:Workplace\s*)?[-\u2013\u2014]\s*/i, '')
      .replace(/^zoom\s+workplace$/i, '') // bare "Zoom Workplace" \u2192 generic title
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
  isEndedMeetingWindow,
  isTeamsMeetingWindow,
  isZoomMeetingWindow,
  stripBrowserSuffix,
};
