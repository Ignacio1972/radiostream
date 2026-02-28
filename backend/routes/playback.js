const express = require('express');
const dbusPlayer = require('../services/dbusPlayer');

const router = express.Router();

// Get current state
router.get('/current', async (req, res, next) => {
  try {
    await dbusPlayer.getPosition();
    const state = dbusPlayer.getState();
    res.json(state);
  } catch (error) {
    next(error);
  }
});

// Play
router.post('/play', async (req, res, next) => {
  try {
    await dbusPlayer.play();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Pause
router.post('/pause', async (req, res, next) => {
  try {
    await dbusPlayer.pause();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Next
router.post('/next', async (req, res, next) => {
  try {
    await dbusPlayer.next();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Previous
router.post('/previous', async (req, res, next) => {
  try {
    await dbusPlayer.previous();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Volume
router.post('/volume', async (req, res, next) => {
  try {
    const { volume } = req.body;
    if (volume === undefined || volume < 0 || volume > 100) {
      return res.status(400).json({ error: 'Volume must be between 0 and 100' });
    }
    await dbusPlayer.setVolume(volume);
    res.json({ success: true });
  } catch (error) {
    next(error);
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

module.exports = router;
