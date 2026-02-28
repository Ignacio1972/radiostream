const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const TOKEN_FILE = path.join(__dirname, '../data/spotify-tokens.json');

// Ensure data directory exists
const dataDir = path.dirname(TOKEN_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let tokensCache = null;

function loadTokensSync() {
  if (tokensCache) return tokensCache;

  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      tokensCache = data;
      return data;
    }
  } catch (error) {
    console.error('[TokenStorage] Error loading tokens:', error);
  }

  return null;
}

const tokenStorage = {
  getTokens() {
    return loadTokensSync();
  },

  saveTokens(tokens) {
    const data = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      tokenTimestamp: tokens.tokenTimestamp || Date.now(),
      updatedAt: new Date().toISOString()
    };

    tokensCache = data;

    fsPromises.writeFile(TOKEN_FILE, JSON.stringify(data, null, 2))
      .catch(error => console.error('[TokenStorage] Error saving tokens:', error));

    return true;
  },

  updateAccessToken(accessToken, expiresIn) {
    const tokens = this.getTokens();
    if (tokens) {
      tokens.accessToken = accessToken;
      tokens.expiresIn = expiresIn;
      tokens.tokenTimestamp = Date.now();
      tokens.updatedAt = new Date().toISOString();
      return this.saveTokens(tokens);
    }
    return false;
  },

  needsRefresh() {
    const tokens = this.getTokens();
    if (!tokens || !tokens.tokenTimestamp || !tokens.expiresIn) {
      return true;
    }
    const elapsed = (Date.now() - tokens.tokenTimestamp) / 1000;
    return elapsed > (tokens.expiresIn - 300);
  },

  isConfigured() {
    const tokens = this.getTokens();
    return !!(tokens && tokens.accessToken && tokens.refreshToken);
  }
};

module.exports = { tokenStorage };
