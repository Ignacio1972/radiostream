const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');
const spotifyConfig = require('../config/spotify');
const { tokenStorage } = require('../services/tokenStorage');

const router = express.Router();

function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

router.get('/login', (req, res) => {
  const state = generateRandomString(16);
  req.session.state = state;

  const spotifyApi = new SpotifyWebApi({
    clientId: spotifyConfig.clientId,
    clientSecret: spotifyConfig.clientSecret,
    redirectUri: spotifyConfig.redirectUri
  });

  const authorizeURL = spotifyApi.createAuthorizeURL(spotifyConfig.scopes, state);

  req.session.save((err) => {
    if (err) {
      console.error('Error saving session:', err);
      return res.status(500).json({ error: 'Failed to initialize session' });
    }
    res.redirect(authorizeURL);
  });
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const storedState = req.session.state;

  if (state === null || state !== storedState) {
    return res.redirect('/#error=state_mismatch');
  }

  try {
    const spotifyApi = new SpotifyWebApi({
      clientId: spotifyConfig.clientId,
      clientSecret: spotifyConfig.clientSecret,
      redirectUri: spotifyConfig.redirectUri
    });

    const data = await spotifyApi.authorizationCodeGrant(code);
    const { access_token, refresh_token, expires_in } = data.body;

    tokenStorage.saveTokens({
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      tokenTimestamp: Date.now()
    });

    console.log('[Auth] Tokens saved successfully');

    res.redirect('/?auth=success');
  } catch (error) {
    console.error('Error getting tokens:', error);
    res.redirect('/#error=invalid_token');
  }
});

module.exports = router;
