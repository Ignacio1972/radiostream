const express = require('express');
const SpotifyService = require('../services/spotifyAPI');
const deviceManager = require('../services/deviceManager');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

const getAccessToken = (req) => req.spotifyAccessToken;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getDeviceId(spotify) {
  const playbackState = await spotify.getPlaybackState();
  if (playbackState?.device?.id) {
    deviceManager.setPreferredDevice(playbackState.device.id);
    return playbackState.device.id;
  }

  const cachedId = deviceManager.getPreferredDevice();
  if (cachedId) return cachedId;

  const devices = await spotify.getDevices();
  if (devices.length === 0) return null;

  const preferred = deviceManager.findPreferredDevice(devices);
  return preferred?.id || devices[0].id;
}

// Get current playing track
router.get('/current', async (req, res, next) => {
  try {
    const spotify = new SpotifyService(getAccessToken(req));
    const state = await spotify.getPlaybackState();

    if (!state || !state.item) {
      return res.json(null);
    }

    const item = state.item;
    const isTrack = item.type === 'track';

    res.json({
      id: item.id,
      name: item.name,
      type: item.type,
      artist: isTrack ? item.artists.map(a => a.name).join(', ') : item.show?.name,
      artists: isTrack ? item.artists.map(a => ({ id: a.id, name: a.name })) : [],
      album: isTrack ? item.album.name : item.show?.name,
      album_id: isTrack ? item.album.id : null,
      artwork: {
        large: item.album?.images[0]?.url || item.images?.[0]?.url || null,
        medium: item.album?.images[1]?.url || item.images?.[1]?.url || null,
        small: item.album?.images[2]?.url || item.images?.[2]?.url || null
      },
      duration_ms: item.duration_ms,
      progress_ms: state.progress_ms,
      is_playing: state.is_playing,
      shuffle_state: state.shuffle_state,
      repeat_state: state.repeat_state,
      context: state.context ? {
        type: state.context.type,
        uri: state.context.uri
      } : null,
      device: state.device ? {
        id: state.device.id,
        name: state.device.name,
        type: state.device.type,
        volume_percent: state.device.volume_percent
      } : null
    });
  } catch (error) {
    next(error);
  }
});

// Play
router.post('/play', async (req, res, next) => {
  try {
    const spotify = new SpotifyService(getAccessToken(req));
    const devices = await spotify.getDevices();

    if (!devices || devices.length === 0) {
      return res.status(503).json({
        error: 'No devices available. Make sure spotifyd is running.'
      });
    }

    let targetDevice = devices.find(d => d.is_active);

    if (!targetDevice) {
      targetDevice = deviceManager.findPreferredDevice(devices) || devices[0];
      await spotify.transferPlayback(targetDevice.id, true);
      console.log(`[Play] Activated device "${targetDevice.name}" via transferPlayback`);
    } else {
      await spotify.play(targetDevice.id);
      console.log(`[Play] Resumed on active device "${targetDevice.name}"`);
    }

    const io = req.app.get('io');
    io.to('radiostream').emit('playback-changed', { is_playing: true });

    res.json({ success: true, device: targetDevice.name });
  } catch (error) {
    next(error);
  }
});

// Pause
router.post('/pause', async (req, res, next) => {
  try {
    const spotify = new SpotifyService(getAccessToken(req));
    await spotify.pause();

    const io = req.app.get('io');
    io.to('radiostream').emit('playback-changed', { is_playing: false });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Next track
router.post('/next', async (req, res, next) => {
  try {
    const spotify = new SpotifyService(getAccessToken(req));
    const deviceId = await getDeviceId(spotify);
    await spotify.next(deviceId);

    const io = req.app.get('io');
    io.to('radiostream').emit('track-changed');

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Previous track
router.post('/previous', async (req, res, next) => {
  try {
    const spotify = new SpotifyService(getAccessToken(req));
    const deviceId = await getDeviceId(spotify);
    await spotify.previous(deviceId);

    const io = req.app.get('io');
    io.to('radiostream').emit('track-changed');

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Set volume
router.post('/volume', async (req, res, next) => {
  try {
    const { volume } = req.body;
    if (volume === undefined || volume < 0 || volume > 100) {
      return res.status(400).json({ error: 'Volume must be between 0 and 100' });
    }

    const spotify = new SpotifyService(getAccessToken(req));
    const deviceId = await getDeviceId(spotify);
    await spotify.setVolume(volume, deviceId);

    const io = req.app.get('io');
    io.to('radiostream').emit('volume-changed', { volume });

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

    const spotify = new SpotifyService(getAccessToken(req));
    const deviceId = await getDeviceId(spotify);
    await spotify.seek(position_ms, deviceId);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Toggle shuffle
router.post('/shuffle', async (req, res, next) => {
  try {
    const { state } = req.body;
    const spotify = new SpotifyService(getAccessToken(req));
    const deviceId = await getDeviceId(spotify);
    await spotify.setShuffle(state, deviceId);

    const io = req.app.get('io');
    io.to('radiostream').emit('playback-changed', { shuffle_state: state });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Toggle repeat
router.post('/repeat', async (req, res, next) => {
  try {
    const { state } = req.body;
    const spotify = new SpotifyService(getAccessToken(req));
    const deviceId = await getDeviceId(spotify);
    await spotify.setRepeat(state, deviceId);

    const io = req.app.get('io');
    io.to('radiostream').emit('playback-changed', { repeat_state: state });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Check if tracks are liked
router.get('/check-liked', async (req, res, next) => {
  try {
    const { ids } = req.query;
    if (!ids) return res.status(400).json({ error: 'Track IDs required' });

    const spotify = new SpotifyService(getAccessToken(req));
    const trackIds = ids.split(',');
    const result = await spotify.checkSavedTracks(trackIds);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Like
router.put('/like', async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: 'Track IDs array required' });
    }

    const spotify = new SpotifyService(getAccessToken(req));
    await spotify.saveTracks(ids);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Unlike
router.delete('/like', async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: 'Track IDs array required' });
    }

    const spotify = new SpotifyService(getAccessToken(req));
    await spotify.removeTracks(ids);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
