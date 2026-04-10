const { google } = require('googleapis');

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
  );
}

function getAuthenticatedClient() {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      'GOOGLE_REFRESH_TOKEN is not set in .env. ' +
      'Run: node scripts/get-refresh-token.js'
    );
  }

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  // Log token refresh errors clearly instead of cryptic "invalid_grant"
  oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      // A new refresh token was issued — update .env
      console.warn(
        '[googleAuth] New refresh token issued. Update GOOGLE_REFRESH_TOKEN in .env:\n' +
        tokens.refresh_token
      );
    }
  });

  return oauth2Client;
}

module.exports = { getOAuthClient, getAuthenticatedClient };
