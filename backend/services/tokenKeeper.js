const SpotifyWebApi = require('spotify-web-api-node');
const { tokenStorage } = require('./tokenStorage');
const spotifyConfig = require('../config/spotify');

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;
const EXPIRY_THRESHOLD_MS = 15 * 60 * 1000;

let intervalId = null;
let io = null;

function needsRefresh(tokens) {
  if (!tokens || !tokens.tokenTimestamp || !tokens.expiresIn) return true;
  const expiresAt = tokens.tokenTimestamp + (tokens.expiresIn * 1000);
  return (expiresAt - Date.now()) < EXPIRY_THRESHOLD_MS;
}

async function refreshToken() {
  const tokens = tokenStorage.getTokens();

  if (!tokens || !tokens.refreshToken) {
    console.log('[TokenKeeper] No refresh token available');
    return;
  }

  if (!needsRefresh(tokens)) {
    const expiresAt = tokens.tokenTimestamp + (tokens.expiresIn * 1000);
    const minutesLeft = Math.round((expiresAt - Date.now()) / 60000);
    console.log(`[TokenKeeper] Token still valid (${minutesLeft} min left)`);
    return;
  }

  try {
    const spotifyApi = new SpotifyWebApi({
      clientId: spotifyConfig.clientId,
      clientSecret: spotifyConfig.clientSecret,
      redirectUri: spotifyConfig.redirectUri
    });
    spotifyApi.setRefreshToken(tokens.refreshToken);

    const data = await spotifyApi.refreshAccessToken();
    const { access_token, expires_in } = data.body;

    tokenStorage.updateAccessToken(access_token, expires_in);
    console.log('[TokenKeeper] Token refreshed successfully');
  } catch (error) {
    console.error('[TokenKeeper] Refresh failed:', error.message);

    const errorMsg = error.message || '';
    if (errorMsg.includes('invalid_grant') || errorMsg.includes('Refresh token revoked')) {
      console.error('[TokenKeeper] ALERT: Refresh token revoked. Re-authentication required.');
      if (io) {
        io.to('radiostream').emit('auth-expired', {
          code: 'REFRESH_TOKEN_REVOKED',
          message: 'Spotify authorization expired. Please re-authenticate.',
          timestamp: new Date().toISOString()
        });
      }
    }
  }
}

const tokenKeeper = {
  setIO(ioInstance) {
    io = ioInstance;
  },

  start() {
    if (intervalId) return;
    console.log('[TokenKeeper] Starting (every 20 min)');
    refreshToken();
    intervalId = setInterval(refreshToken, REFRESH_INTERVAL_MS);
  },

  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};

module.exports = tokenKeeper;
