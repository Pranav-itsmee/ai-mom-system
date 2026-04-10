require('dotenv').config();
const { google } = require('googleapis');
const readline  = require('readline');

const REDIRECT_URI = 'http://localhost';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\n──────────────────────────────────────────────────');
console.log('  Open this URL in your browser and authorize:');
console.log('──────────────────────────────────────────────────');
console.log('\n' + authUrl + '\n');
console.log('──────────────────────────────────────────────────\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Paste the authorization code here: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log('\n✅ Success! Copy this into your .env:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);

    if (!tokens.refresh_token) {
      console.log('\n⚠️ No refresh_token returned.');
      console.log('👉 Go here and remove access: https://myaccount.google.com/permissions');
      console.log('Then run this script again.\n');
    }
  } catch (err) {
    console.error('\n❌ Error exchanging code:', err.message);
  }
});