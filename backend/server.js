const path = require('path');
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');

const errorHandler = require('./middleware/errorHandler');
const playbackRoutes = require('./routes/playback');
const streamRoutes = require('./routes/stream');
const dbusPlayer = require('./services/dbusPlayer');

const app = express();
app.set('trust proxy', 1);

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin ||
          /\.mediaflow\.cl$/.test(origin) ||
          /localhost/.test(origin) ||
          /127\.0\.0\.1/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin ||
        /\.mediaflow\.cl$/.test(origin) ||
        /localhost/.test(origin) ||
        /127\.0\.0\.1/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/playback', playbackRoutes);
app.use('/api/stream', streamRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    dbus: dbusPlayer.connected,
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Connected: ${socket.id}`);
  socket.join('radiostream');

  // Send current state on connect
  const state = dbusPlayer.getState();
  if (state) socket.emit('state-update', state);

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Disconnected: ${socket.id}`);
  });

  socket.on('ping', (callback) => {
    if (callback) callback('pong');
  });
});

// D-Bus events → Socket.IO broadcast
dbusPlayer.onChange((event, data) => {
  if (event === 'state-changed') {
    io.to('radiostream').emit('state-update', data);
  }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend/dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.match(/\.(js|css)$/) && filePath.includes('-')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

app.use(errorHandler);

const PORT = process.env.PORT || 4001;

// Start D-Bus then server
dbusPlayer.connect()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log('═══════════════════════════════════════════');
      console.log('  RadioStream Server (D-Bus/MPRIS)');
      console.log('═══════════════════════════════════════════');
      console.log(`  Port:        ${PORT}`);
      console.log(`  D-Bus:       connected`);
      console.log('═══════════════════════════════════════════');
    });
  })
  .catch((err) => {
    console.error('[Server] Failed to connect to D-Bus:', err.message);
    console.log('[Server] Starting without D-Bus — playback controls will not work');
    httpServer.listen(PORT, () => {
      console.log(`  RadioStream Server on port ${PORT} (D-Bus DISCONNECTED)`);
    });
  });

module.exports = { app, io };
