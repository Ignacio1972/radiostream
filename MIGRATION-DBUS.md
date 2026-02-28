# Migración a D-Bus/MPRIS — Guía de implementación

RadioStream actualmente usa la Spotify Web API para metadata y control de playback. Esta guía migra todo a D-Bus/MPRIS, que spotifyd ya expone localmente.

## Por qué migrar

- Spotify Web API tiene rate limits agresivos y endpoints removidos (feb 2026)
- El backend hace polling cada 2-5s a `GET /me/player` — genera rate limiting constante
- spotifyd ya tiene toda la info via MPRIS, solo hay que habilitarlo correctamente

## Qué NO cambia

El audio pipeline sigue igual:
```
spotifyd → PulseAudio (spotify_out) → ffmpeg → Icecast (/isla)
```

---

## Paso 1: Configurar D-Bus en el servidor

### 1.1 Crear policy file para D-Bus system bus

spotifyd corre como servicio systemd en un servidor headless (no hay session bus). Necesita registrarse en el system bus.

```bash
sudo cat > /etc/dbus-1/system.d/spotifyd.conf << 'EOF'
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-BUS Bus Configuration 1.0//EN"
  "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <policy user="root">
    <allow own="org.mpris.MediaPlayer2.spotifyd"/>
    <allow send_destination="org.mpris.MediaPlayer2.spotifyd"/>
  </policy>
  <policy context="default">
    <allow send_destination="org.mpris.MediaPlayer2.spotifyd"/>
  </policy>
</busconfig>
EOF
```

### 1.2 Actualizar `/etc/spotifyd.conf`

El archivo actual es:
```ini
[global]
backend = "pulseaudio"
device = "spotify_out"
device_name = "RadioStream"
bitrate = 320
volume_normalisation = true
normalisation_pregain = -10
device_type = "computer"
use_mpris = true
```

Agregar `dbus_type`:
```ini
[global]
backend = "pulseaudio"
device = "spotify_out"
device_name = "RadioStream"
bitrate = 320
volume_normalisation = true
normalisation_pregain = -10
device_type = "computer"
use_mpris = true
dbus_type = "system"
```

### 1.3 Reiniciar y verificar

```bash
# Recargar policy de D-Bus
sudo systemctl reload dbus

# Reiniciar spotifyd
sudo systemctl restart spotifyd

# Verificar que MPRIS está registrado (con Spotify reproduciendo algo)
dbus-send --system --print-reply \
  --dest=org.mpris.MediaPlayer2.spotifyd \
  /org/mpris/MediaPlayer2 \
  org.freedesktop.DBus.Properties.GetAll \
  string:'org.mpris.MediaPlayer2.Player'
```

Si funciona, vas a ver las propiedades MPRIS (Metadata, PlaybackStatus, Volume, etc.). Si no hay nada reproduciéndose, spotifyd puede no registrarse en D-Bus hasta que se active.

---

## Paso 2: Instalar dbus-next

```bash
cd /var/www/radiostream/backend
npm install dbus-next
```

Esto agrega `dbus-next` a `package.json`. Sin dependencias binarias nativas.

### Desinstalar dependencias que ya no se necesitan

```bash
npm uninstall spotify-web-api-node
```

`axios` se puede mantener si `routes/stream.js` lo usa para consultar Icecast. Si no, también se puede remover.

---

## Paso 3: Crear `backend/services/dbusPlayer.js`

Este es el servicio central que reemplaza a `spotifyAPI.js`, `tokenStorage.js`, `auth.js` y `deviceManager.js`.

```js
const dbus = require('dbus-next');

const MPRIS_DEST = 'org.mpris.MediaPlayer2.spotifyd';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

class DbusPlayer {
  constructor() {
    this.bus = null;
    this.player = null;
    this.properties = null;
    this.connected = false;
    this.currentState = {
      track: null,
      is_playing: false,
      volume: 0,
      shuffle: false,
      repeat: 'None',
      position_us: 0
    };
    this._listeners = [];
  }

  async connect() {
    try {
      this.bus = dbus.systemBus();

      const obj = await this.bus.getProxyObject(MPRIS_DEST, MPRIS_PATH);
      this.player = obj.getInterface(PLAYER_IFACE);
      this.properties = obj.getInterface(PROPS_IFACE);

      // Leer estado inicial
      await this._refreshState();

      // Escuchar cambios en tiempo real
      this.properties.on('PropertiesChanged', (iface, changed) => {
        if (iface !== PLAYER_IFACE) return;

        if (changed.Metadata) {
          this.currentState.track = this._parseMetadata(changed.Metadata.value);
        }
        if (changed.PlaybackStatus) {
          this.currentState.is_playing = changed.PlaybackStatus.value === 'Playing';
        }
        if (changed.Volume) {
          this.currentState.volume = Math.round(changed.Volume.value * 100);
        }
        if (changed.Shuffle) {
          this.currentState.shuffle = changed.Shuffle.value;
        }
        if (changed.LoopStatus) {
          this.currentState.repeat = changed.LoopStatus.value;
        }

        // Notificar listeners (Socket.IO)
        this._emit('state-changed', this.getState());
      });

      this.connected = true;
      console.log('[D-Bus] Connected to spotifyd MPRIS');
    } catch (err) {
      console.error('[D-Bus] Connection failed:', err.message);
      this.connected = false;
      throw err;
    }
  }

  async _refreshState() {
    const getProperty = async (prop) => {
      try {
        const variant = await this.properties.Get(PLAYER_IFACE, prop);
        return variant.value;
      } catch {
        return null;
      }
    };

    const metadata = await getProperty('Metadata');
    const status = await getProperty('PlaybackStatus');
    const volume = await getProperty('Volume');
    const shuffle = await getProperty('Shuffle');
    const loop = await getProperty('LoopStatus');
    const position = await getProperty('Position');

    if (metadata) this.currentState.track = this._parseMetadata(metadata);
    if (status) this.currentState.is_playing = status === 'Playing';
    if (volume !== null) this.currentState.volume = Math.round(volume * 100);
    if (shuffle !== null) this.currentState.shuffle = shuffle;
    if (loop) this.currentState.repeat = loop;
    if (position !== null) this.currentState.position_us = position;
  }

  _parseMetadata(meta) {
    // meta es un dict de Variant values
    // Las keys de D-Bus usan Variant, hay que extraer .value
    const get = (key) => {
      const val = meta[key];
      if (!val) return null;
      // dbus-next wraps values in Variant, .value da el valor real
      return val.value !== undefined ? val.value : val;
    };

    const artists = get('xesam:artist');
    const artUrl = get('mpris:artUrl');
    const length = get('mpris:length'); // microsegundos

    return {
      name: get('xesam:title') || 'Unknown',
      artist: Array.isArray(artists) ? artists.join(', ') : (artists || 'Unknown'),
      album: get('xesam:album') || '',
      artwork: artUrl || null,
      duration_ms: length ? Math.round(length / 1000) : 0
    };
  }

  getState() {
    // Formato compatible con lo que el frontend espera
    const track = this.currentState.track;
    if (!track) return null;

    return {
      name: track.name,
      artist: track.artist,
      album: track.album,
      artwork: {
        large: track.artwork,
        medium: track.artwork,
        small: track.artwork
      },
      duration_ms: track.duration_ms,
      progress_ms: Math.round(this.currentState.position_us / 1000),
      is_playing: this.currentState.is_playing,
      shuffle_state: this.currentState.shuffle,
      repeat_state: this._mprisLoopToSpotify(this.currentState.repeat),
      device: {
        name: 'RadioStream',
        volume_percent: this.currentState.volume
      }
    };
  }

  // Conversión LoopStatus MPRIS <-> formato que usa el frontend
  _mprisLoopToSpotify(mprisLoop) {
    switch (mprisLoop) {
      case 'Track': return 'track';
      case 'Playlist': return 'context';
      default: return 'off';
    }
  }

  _spotifyLoopToMpris(spotifyRepeat) {
    switch (spotifyRepeat) {
      case 'track': return 'Track';
      case 'context': return 'Playlist';
      default: return 'None';
    }
  }

  // --- Control methods ---

  async play() {
    await this.player.Play();
  }

  async pause() {
    await this.player.Pause();
  }

  async next() {
    await this.player.Next();
  }

  async previous() {
    await this.player.Previous();
  }

  async seek(positionMs) {
    // MPRIS Seek() toma un offset en microsegundos relativo a la posición actual.
    // Para ir a una posición absoluta, calcular el offset.
    const currentPos = this.currentState.position_us;
    const targetUs = positionMs * 1000;
    const offsetUs = targetUs - currentPos;
    await this.player.Seek(BigInt(offsetUs));
  }

  async setVolume(volumePercent) {
    const vol = Math.max(0, Math.min(100, volumePercent)) / 100;
    await this.properties.Set(
      PLAYER_IFACE,
      'Volume',
      new dbus.Variant('d', vol)
    );
  }

  async setShuffle(state) {
    await this.properties.Set(
      PLAYER_IFACE,
      'Shuffle',
      new dbus.Variant('b', Boolean(state))
    );
  }

  async setRepeat(state) {
    // state viene como 'off', 'context', 'track' (formato frontend)
    const mprisState = this._spotifyLoopToMpris(state);
    await this.properties.Set(
      PLAYER_IFACE,
      'LoopStatus',
      new dbus.Variant('s', mprisState)
    );
  }

  async getPosition() {
    try {
      const variant = await this.properties.Get(PLAYER_IFACE, 'Position');
      this.currentState.position_us = Number(variant.value);
      return Math.round(this.currentState.position_us / 1000);
    } catch {
      return 0;
    }
  }

  // --- Event system ---

  onChange(callback) {
    this._listeners.push(callback);
  }

  _emit(event, data) {
    for (const cb of this._listeners) {
      try { cb(event, data); } catch (e) { console.error('[D-Bus] Listener error:', e); }
    }
  }

  async disconnect() {
    if (this.bus) {
      this.bus.disconnect();
      this.connected = false;
    }
  }
}

// Singleton
const dbusPlayer = new DbusPlayer();
module.exports = dbusPlayer;
```

---

## Paso 4: Refactorizar `backend/routes/playback.js`

Reemplazar todo el archivo. Ya no necesita auth middleware, SpotifyService ni deviceManager.

```js
const express = require('express');
const dbusPlayer = require('../services/dbusPlayer');

const router = express.Router();

// Get current state
router.get('/current', async (req, res, next) => {
  try {
    // Refrescar position antes de responder
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
```

---

## Paso 5: Refactorizar `backend/server.js`

Cambios:
- Eliminar imports de `authRoutes`, `express-session`
- Conectar `dbusPlayer` al iniciar
- Conectar eventos D-Bus → Socket.IO

```js
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

  // Enviar estado actual al conectarse
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

// Iniciar D-Bus y luego el servidor
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
```

---

## Paso 6: Actualizar frontend

### 6.1 `frontend/src/hooks/useSpotify.js`

Cambios principales:
- El backend ahora emite `state-update` via Socket.IO con el estado completo
- Ya no hay polling como fuente principal — Socket.IO push es la fuente
- Mantener un polling lento (30s) como fallback para Position
- Eliminar todo lo relacionado a like/unlike
- Eliminar manejo de auth-expired

```js
import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import api from '../services/api';

export function useSpotify() {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { socket, isConnected: wsConnected, isReconnecting: wsReconnecting } = useWebSocket();

  const fetchCurrentTrack = useCallback(async () => {
    try {
      const response = await api.get('/api/playback/current');
      const data = response.data;
      if (data) {
        setCurrentTrack(data);
        setIsPlaying(data.is_playing || false);
        setShuffle(data.shuffle_state || false);
        setRepeat(data.repeat_state || 'off');
      }
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Socket.IO push updates (primary)
  useEffect(() => {
    if (!socket) return;

    socket.on('state-update', (data) => {
      if (data) {
        setCurrentTrack(data);
        setIsPlaying(data.is_playing || false);
        setShuffle(data.shuffle_state || false);
        setRepeat(data.repeat_state || 'off');
        setLoading(false);
      }
    });

    return () => {
      socket.off('state-update');
    };
  }, [socket]);

  // Initial fetch + slow fallback polling
  useEffect(() => {
    fetchCurrentTrack();
    const interval = setInterval(fetchCurrentTrack, 30000);
    return () => clearInterval(interval);
  }, [fetchCurrentTrack]);

  const withErrorHandling = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      throw err;
    }
  };

  const play = () => withErrorHandling(async () => {
    await api.post('/api/playback/play');
    setIsPlaying(true);
  });

  const pause = () => withErrorHandling(async () => {
    await api.post('/api/playback/pause');
    setIsPlaying(false);
  });

  const next = () => withErrorHandling(async () => {
    await api.post('/api/playback/next');
  });

  const previous = () => withErrorHandling(async () => {
    await api.post('/api/playback/previous');
  });

  const seek = (positionMs) => withErrorHandling(async () => {
    await api.post('/api/playback/seek', { position_ms: Math.round(positionMs) });
    setCurrentTrack(prev => prev ? { ...prev, progress_ms: Math.round(positionMs) } : null);
  });

  const toggleShuffle = () => withErrorHandling(async () => {
    const newState = !shuffle;
    await api.post('/api/playback/shuffle', { state: newState });
    setShuffle(newState);
  });

  const toggleRepeat = () => withErrorHandling(async () => {
    const states = ['off', 'context', 'track'];
    const currentIndex = states.indexOf(repeat);
    const nextState = states[(currentIndex + 1) % states.length];
    await api.post('/api/playback/repeat', { state: nextState });
    setRepeat(nextState);
  });

  return {
    currentTrack,
    isPlaying,
    shuffle,
    repeat,
    loading,
    error,
    wsConnected,
    wsReconnecting,
    play,
    pause,
    next,
    previous,
    seek,
    toggleShuffle,
    toggleRepeat
  };
}
```

### 6.2 `frontend/src/hooks/useTrackPolling.js`

Este hook (usado por WebPlayer) ahora también puede usar Socket.IO en vez de polling. Pero si prefieres mantenerlo simple con polling lento, funciona igual — el endpoint `/api/playback/current` sigue existiendo.

No requiere cambios si se mantiene el polling. El endpoint devuelve el mismo formato.

### 6.3 Componentes que usan `isLiked` / `toggleLike`

Buscar y eliminar referencias a `isLiked` y `toggleLike` en:
- `frontend/src/pages/RemoteControl.jsx`
- `frontend/src/components/ExtraControls.jsx`

Eliminar el botón de like/unlike del UI.

---

## Paso 7: Eliminar archivos

```bash
cd /var/www/radiostream

# Backend — archivos que ya no se necesitan
rm backend/services/spotifyAPI.js
rm backend/services/tokenStorage.js
rm backend/services/deviceManager.js
rm backend/middleware/auth.js
rm backend/routes/auth.js
rm backend/config/spotify.js
rm -f backend/data/spotify-tokens.json

# Variables de entorno que ya no se necesitan (en backend/.env)
# Eliminar: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, SESSION_SECRET
```

---

## Paso 8: Actualizar `package.json`

```bash
cd /var/www/radiostream/backend
npm uninstall spotify-web-api-node express-session
npm install dbus-next
```

`dotenv` se puede eliminar si no queda ninguna variable de entorno necesaria. `axios` mantener si `routes/stream.js` lo usa.

---

## Paso 9: Deploy

```bash
cd /var/www/radiostream/frontend
npm run build

cd /var/www/radiostream
pm2 restart radiostream
```

---

## Notas importantes

### Position / Progress bar

MPRIS no emite `PropertiesChanged` para `Position` — es una propiedad read-only que hay que consultar activamente. Opciones:

1. **Timer local en el frontend**: al recibir `state-update` con `is_playing: true`, iniciar un `setInterval` de 1s que incrementa `progress_ms`. Resetear cuando llega nuevo `state-update`. Esto es lo más fluido.
2. **Polling ligero de Position**: el endpoint `GET /api/playback/current` llama a `dbusPlayer.getPosition()` via D-Bus local (< 1ms). El fallback polling de 30s ya lo hace. Si necesitas más precisión, bajar a 5-10s.

### Album art

MPRIS devuelve una sola URL de artwork (`mpris:artUrl`) del CDN de Spotify, no tres tamaños. El `getState()` de `dbusPlayer.js` ya mapea la misma URL a `artwork.large`, `artwork.medium` y `artwork.small` para mantener compatibilidad con el frontend.

### Like/Unlike

MPRIS no soporta guardar tracks en la librería. Opciones:
- **Eliminar la feature** (recomendado — simplifica todo)
- Mantener solo ese endpoint con un token hardcodeado de la Web API (no recomendado — sigue dependiendo de OAuth)

### Shuffle/Repeat

spotifyd 0.4.2 (la versión instalada) implementa `Shuffle` y `LoopStatus` como propiedades **read-write** en MPRIS. Ambos funcionan.

Mapeo de valores:
| Frontend | MPRIS LoopStatus |
|----------|-----------------|
| `'off'` | `'None'` |
| `'context'` | `'Playlist'` |
| `'track'` | `'Track'` |

### Reconexión D-Bus

Si spotifyd se reinicia, la conexión D-Bus se pierde. `dbusPlayer.js` debería tener lógica de reconexión. Agregar un try/catch en cada método que intente reconectar si falla, o un watcher que detecte cuando spotifyd vuelve al bus.

### Seek — posición absoluta vs offset

MPRIS `Seek(offset)` toma un **offset relativo** en microsegundos. Para ir a una posición absoluta (que es lo que el frontend envía), `dbusPlayer.seek()` calcula el offset restando la posición actual. Alternativa: usar `SetPosition(trackId, position)` que es absoluto, pero requiere el track object path.
