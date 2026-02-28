# RadioStream — Radio Isla Negra

## What is this?
Web app that streams a Spotify-powered internet radio station via Icecast. Two interfaces:
- `/player` — Public web player (listen to Icecast stream + see current track)
- `/remote` — Spotify remote control (play/pause/next/prev/seek/shuffle/repeat/like/volume)
- `/` redirects to `/player`

## Architecture

### Audio pipeline
```
Spotify → spotifyd → PulseAudio (null sink: spotify_out) → ffmpeg (MP3) → Icecast (/isla) → listener
```
- **spotifyd**: Spotify Connect client, outputs to PulseAudio sink `spotify_out`
- **ffmpeg**: Captures `spotify_out.monitor`, encodes MP3, pushes to Icecast
- **Icecast**: Serves stream at mount `/isla` (port 8000, `audio/mpeg`)
- Systemd services in `systemd/` directory

### Backend (Node.js/Express, port 4001)
- `backend/server.js` — Express + Socket.IO setup, SPA fallback
- `backend/routes/playback.js` — Spotify playback API (play/pause/next/prev/seek/shuffle/repeat/like/volume)
- `backend/routes/stream.js` — Icecast stream info and status
- `backend/routes/auth.js` — Spotify OAuth flow
- `backend/services/spotifyAPI.js` — Spotify Web API wrapper
- `backend/services/tokenStorage.js` — Persists tokens to `backend/data/spotify-tokens.json`
- `backend/services/deviceManager.js` — Manages spotifyd device
- `backend/middleware/auth.js` — Auth middleware
- `backend/middleware/errorHandler.js` — Error handler

### Frontend (React 18 + Vite + Tailwind 4 + DaisyUI 5)
- `frontend/src/App.jsx` — React Router setup (BrowserRouter)
- `frontend/src/pages/WebPlayer.jsx` — Public player: Icecast stream + track info (read-only)
- `frontend/src/pages/RemoteControl.jsx` — Spotify remote: all playback controls
- `frontend/src/components/TrackInfo.jsx` — Album art + track name/artist
- `frontend/src/components/Controls.jsx` — Play/pause/next/prev buttons
- `frontend/src/components/ProgressBar.jsx` — Seek bar
- `frontend/src/components/ExtraControls.jsx` — Shuffle/like/repeat
- `frontend/src/components/VolumeControl.jsx` — Spotify device volume
- `frontend/src/components/ConnectionStatus.jsx` — WebSocket status indicator
- `frontend/src/hooks/useSpotify.js` — Spotify state + actions hook (WebSocket + polling, used by RemoteControl)
- `frontend/src/hooks/useTrackPolling.js` — Lightweight polling hook for track info (used by WebPlayer)
- `frontend/src/hooks/useWebSocket.js` — Socket.IO connection hook
- `frontend/src/services/api.js` — Axios instance

### Infrastructure
- **Nginx**: Reverse proxy on port 80 (vhost: `isla.mediaflow.cl`)
  - `/` → Node.js (port 4001)
  - `/stream/` → Icecast (port 8000)
  - `/socket.io/` → WebSocket upgrade
- **Cloudflare**: SSL termination, DNS
- **PM2**: Process manager (`ecosystem.config.js`, app name: `radiostream`)

## Dev commands
```bash
# Frontend
cd frontend && npm run dev      # Vite dev server
cd frontend && npm run build    # Production build → frontend/dist/

# Backend
cd backend && npm run dev       # Node --watch
pm2 restart radiostream         # Restart production

# Stream services
systemctl status spotifyd radiostream-ffmpeg radiostream-pulseaudio
```

## Key conventions
- Frontend code and component names in English
- UI text can be in Spanish (Radio Isla Negra is a Chilean radio)
- DaisyUI component classes (btn, card, alert, etc.)
- Tailwind 4 (CSS-first config, no tailwind.config.js)
- No TypeScript
