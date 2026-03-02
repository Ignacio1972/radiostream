const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const dbusPlayer = require('../services/dbusPlayer');

const router = express.Router();

const KICKSTART_SCRIPT = path.join(__dirname, '..', 'scripts', 'spotify-kickstart.sh');

// Get current state
router.get('/current', async (req, res, next) => {
  try {
    const posMs = await dbusPlayer.getPosition();
    const state = dbusPlayer.getState();
    console.log(`[API] GET /current → connected=${dbusPlayer.connected}, state=${state ? 'ok' : 'null'}, pos=${posMs}ms, playing=${state?.is_playing}`);
    res.json(state);
  } catch (error) {
    console.error(`[API] GET /current → ERROR: ${error.message}`);
    next(error);
  }
});

// Play
router.post('/play', async (req, res, next) => {
  try {
    console.log('[API] POST /play');
    await dbusPlayer.play();
    res.json({ success: true });
  } catch (error) {
    console.error(`[API] POST /play → ERROR: ${error.message}`);
    next(error);
  }
});

// Pause
router.post('/pause', async (req, res, next) => {
  try {
    console.log('[API] POST /pause');
    await dbusPlayer.pause();
    res.json({ success: true });
  } catch (error) {
    console.error(`[API] POST /pause → ERROR: ${error.message}`);
    next(error);
  }
});

// Next
router.post('/next', async (req, res, next) => {
  try {
    console.log('[API] POST /next');
    await dbusPlayer.next();
    res.json({ success: true });
  } catch (error) {
    console.error(`[API] POST /next → ERROR: ${error.message}`);
    next(error);
  }
});

// Previous
router.post('/previous', async (req, res, next) => {
  try {
    console.log('[API] POST /previous');
    await dbusPlayer.previous();
    res.json({ success: true });
  } catch (error) {
    console.error(`[API] POST /previous → ERROR: ${error.message}`);
    next(error);
  }
});

// Volume (read from PulseAudio)
router.get('/volume', (req, res) => {
  try {
    const { execSync } = require('child_process');
    const output = execSync('pactl get-sink-volume spotify_out').toString();
    const match = output.match(/(\d+)%/);
    const volume = match ? parseInt(match[1]) : 80;
    res.json({ volume });
  } catch (err) {
    console.error('[API] GET /volume error:', err.message);
    res.json({ volume: 80 });
  }
});

// Seek
router.post('/seek', async (req, res, next) => {
  try {
    const { position_ms } = req.body;
    if (position_ms === undefined || position_ms < 0) {
      return res.status(400).json({ error: 'Position must be >= 0' });
    }
    await dbusPlayer.seek(position_ms);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Shuffle
router.post('/shuffle', async (req, res, next) => {
  try {
    const { state } = req.body;
    await dbusPlayer.setShuffle(state);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Repeat
router.post('/repeat', async (req, res, next) => {
  try {
    const { state } = req.body;
    await dbusPlayer.setRepeat(state);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Kickstart — start playback via Spotify Web API (when D-Bus can't)
router.post('/kickstart', async (req, res, next) => {
  try {
    console.log('[API] POST /kickstart');
    const playlist = req.body.playlist_uri || '';
    const args = playlist ? [playlist] : [];
    const result = await new Promise((resolve, reject) => {
      execFile(KICKSTART_SCRIPT, args, { timeout: 15000 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout + stderr);
      });
    });
    console.log('[API] Kickstart result:', result.trim());
    res.json({ success: true, message: result.trim() });
  } catch (error) {
    console.error(`[API] POST /kickstart → ERROR: ${error.message}`);
    next(error);
  }
});

module.exports = router;
