const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-modify',
  'user-library-read',
  'streaming',
  'playlist-read-private',
  'playlist-modify-private',
  'playlist-modify-public'
];

const spotifyConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
  scopes: SPOTIFY_SCOPES
};

module.exports = spotifyConfig;
