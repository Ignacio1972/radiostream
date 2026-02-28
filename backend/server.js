const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { createServer } = require('http');
const { Server } = require('socket.io');

const errorHandler = require('./middleware/errorHandler');
const tokenKeeper = require('./services/tokenKeeper');

const authRoutes = require('./routes/auth');
const playbackRoutes = require('./routes/playback');
const streamRoutes = require('./routes/stream');

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

app.use(session({
  secret: process.env.SESSION_SECRET || 'radiostream-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    domain: process.env.NODE_ENV === 'production' ? '.mediaflow.cl' : undefined
  }
}));

// Routes
app.use('/auth', authRoutes);
app.use('/api/playback', playbackRoutes);
app.use('/api/stream', streamRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

// Share io instance
app.set('io', io);
tokenKeeper.setIO(io);

// Socket.IO
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Connected: ${socket.id}`);
  socket.join('radiostream');

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Disconnected: ${socket.id}`);
  });

  socket.on('ping', (callback) => {
    if (callback) callback('pong');
  });
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
  if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/health')) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 4001;
httpServer.listen(PORT, () => {
  console.log('═══════════════════════════════════════════');
  console.log('  RadioStream Server');
  console.log('═══════════════════════════════════════════');
  console.log(`  Port:        ${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('═══════════════════════════════════════════');

  tokenKeeper.start();
});

module.exports = { app, io };
