const SpotifyWebApi = require('spotify-web-api-node');
const spotifyConfig = require('../config/spotify');
const { tokenStorage } = require('../services/tokenStorage');

let refreshPromise = null;

async function refreshTokenWithMutex(refreshToken) {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      console.log('[Auth] Token expired, attempting auto-refresh...');
      const spotifyApi = new SpotifyWebApi({
        clientId: spotifyConfig.clientId,
        clientSecret: spotifyConfig.clientSecret,
        redirectUri: spotifyConfig.redirectUri
      });
      spotifyApi.setRefreshToken(refreshToken);
      const data = await spotifyApi.refreshAccessToken();
      const { access_token, expires_in } = data.body;

      tokenStorage.updateAccessToken(access_token, expires_in);
      console.log('[Auth] Token refreshed successfully');
      return { success: true, accessToken: access_token };
    } catch (error) {
      console.error('[Auth] Auto-refresh failed:', error.message);
      return { success: false, error: error.message };
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function authMiddleware(req, res, next) {
  try {
    const tokens = tokenStorage.getTokens();

    if (!tokens || !tokens.accessToken) {
      return res.status(503).json({
        error: 'Service not configured',
        code: 'NO_SPOTIFY_TOKEN',
        message: 'Spotify is not authorized. Visit /auth/login'
      });
    }

    if (tokenStorage.needsRefresh()) {
      if (!tokens.refreshToken) {
        return res.status(503).json({
          error: 'No refresh token',
          code: 'NO_REFRESH_TOKEN'
        });
      }

      const result = await refreshTokenWithMutex(tokens.refreshToken);

      if (!result.success) {
        const isRevoked = result.error?.includes('invalid_grant') || result.error?.includes('Refresh token revoked');
        const io = req.app.get('io');
        if (isRevoked && io) {
          io.to('radiostream').emit('auth-expired', {
            code: 'REFRESH_TOKEN_REVOKED',
            message: 'Spotify authorization expired. Please re-authenticate.',
            timestamp: new Date().toISOString()
          });
        }

        return res.status(503).json({
          error: 'Service temporarily unavailable',
          code: isRevoked ? 'REFRESH_TOKEN_REVOKED' : 'REFRESH_FAILED'
        });
      }

      req.spotifyAccessToken = result.accessToken;
    } else {
      req.spotifyAccessToken = tokens.accessToken;
    }

    next();
  } catch (error) {
    console.error('[Auth] Error:', error);
    res.status(500).json({ error: 'Authentication error', details: error.message });
  }
}

module.exports = authMiddleware;
