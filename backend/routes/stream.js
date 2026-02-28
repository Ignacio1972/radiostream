const express = require('express');
const axios = require('axios');

const router = express.Router();

// Get stream info
router.get('/info', (req, res) => {
  res.json({
    url: '/stream/isla',
    mount: '/isla',
    format: 'mp3'
  });
});

// Get Icecast status
router.get('/status', async (req, res) => {
  try {
    const response = await axios.get('http://127.0.0.1:8000/status-json.xsl', {
      timeout: 3000
    });

    const sources = response.data?.icestats?.source;
    if (!sources) {
      return res.json({ active: false, listeners: 0 });
    }

    // sources can be an array or single object
    const sourceList = Array.isArray(sources) ? sources : [sources];
    const islaSource = sourceList.find(s => s.listenurl?.includes('/isla'));

    res.json({
      active: !!islaSource,
      listeners: islaSource?.listeners || 0,
      title: islaSource?.title || null,
      description: islaSource?.server_description || null
    });
  } catch (error) {
    res.json({ active: false, listeners: 0, error: 'Icecast not reachable' });
  }
});

module.exports = router;
