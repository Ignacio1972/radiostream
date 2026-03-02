# RadioStream — Radio Isla Negra

## What is this?
Web app that streams a Spotify-powered internet radio station via Icecast. Two interfaces:
- `/player` — Public web player (listen to Icecast stream + see current track)
- `/remote` — Spotify remote control (play/pause/next/prev/seek/shuffle/repeat/volume)
- `/` redirects to `/player`

## Architecture

### Audio pipeline
```
Spotify → spotifyd → PulseAudio (null sink: spotify_out) → ffmpeg (AAC 192kbps) → Icecast (/isla) → listener
```
- **spotifyd**: Spotify Connect client, outputs to PulseAudio sink `spotify_out`, D-Bus/MPRIS on system bus
- **ffmpeg**: Captures `spotify_out.monitor`, encodes AAC 192kbps 44100Hz, pushes to Icecast via ADTS
- **Icecast**: Serves stream at mount `/isla` (port 8000, `audio/aac`)
- Systemd services in `systemd/` directory

### Playback control (D-Bus/MPRIS + Spotify Web API)
Day-to-day playback control and metadata comes from spotifyd's MPRIS interface on the D-Bus system bus.
No rate limit concerns for play/pause/next/prev/seek/volume/shuffle/repeat — all via D-Bus.
- spotifyd registers as `org.mpris.MediaPlayer2.spotifyd.instance<PID>` (dynamic name discovery)
- D-Bus policy file: `/etc/dbus-1/system.d/spotifyd.conf`
- spotifyd config: `/etc/spotifyd.conf` (`dbus_type = "system"`)
- MPRIS only registers when spotifyd has active playback
- Backend auto-reconnects to D-Bus every 5s if disconnected

### Spotify Web API (minimal usage)
Used **only** for two things — starting playback and keeping the token alive.
Be very conservative with API calls to avoid rate limits.
- `backend/scripts/spotify-kickstart.sh` — Starts playback on RadioStream device (2 API calls: refresh token + play)
- `backend/scripts/spotify-token-refresh.sh` — Refreshes access token (1 API call)
- Cron job: token refresh every 50 minutes (`*/50 * * * *`)
- Credentials: `.env` file (CLIENT_ID, CLIENT_SECRET), refresh token in scripts
- Token cache: `/var/cache/spotifyd/spotify-api-token.json`

### spotifyd authentication
- spotifyd 0.4.2 uses OAuth only (no username/password support)
- OAuth tokens expire (~1 hour) and get revoked after prolonged inactivity
- To re-authenticate: `spotifyd authenticate --oauth-port 5588 --cache-path /var/cache/spotifyd`
  - Port 5588 because 8000 is used by Icecast
  - Open the URL in browser, authorize, copy redirect URL, curl it from the server
- OAuth credentials cached at `/var/cache/spotifyd/oauth/credentials.json`

### Backend (Node.js/Express, port 4001)
- `backend/server.js` — Express + Socket.IO + D-Bus event bridge
- `backend/routes/playback.js` — Playback API via D-Bus (play/pause/next/prev/seek/shuffle/repeat/volume)
- `backend/routes/stream.js` — Icecast stream info and status
- `backend/services/dbusPlayer.js` — D-Bus/MPRIS singleton (replaces all Spotify Web API services)
- `backend/middleware/errorHandler.js` — Error handler
- `backend/scripts/spotify-kickstart.sh` — Start playback via Spotify Web API (when D-Bus can't)
- `backend/scripts/spotify-token-refresh.sh` — Cron script to keep API token alive

### Frontend (React 18 + Vite + Tailwind 4 + DaisyUI 5)
- `frontend/src/App.jsx` — React Router setup (BrowserRouter)
- `frontend/src/pages/WebPlayer.jsx` — Public player: Icecast stream + track info (read-only)
- `frontend/src/pages/RemoteControl.jsx` — Spotify remote: all playback controls
- `frontend/src/components/TrackInfo.jsx` — Album art + track name/artist
- `frontend/src/components/Controls.jsx` — Play/pause/next/prev buttons
- `frontend/src/components/ProgressBar.jsx` — Seek bar
- `frontend/src/components/ExtraControls.jsx` — Shuffle/repeat toggles
- `frontend/src/components/VolumeControl.jsx` — Spotify device volume
- `frontend/src/components/ConnectionStatus.jsx` — WebSocket status indicator
- `frontend/src/hooks/useSpotify.js` — Spotify state + actions hook (Socket.IO push + 30s polling fallback)
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

# Start playback (when nothing is playing)
/var/www/radiostream/backend/scripts/spotify-kickstart.sh
/var/www/radiostream/backend/scripts/spotify-kickstart.sh spotify:playlist:XXXXX  # specific playlist

# Re-authenticate spotifyd (when OAuth token expires)
systemctl stop spotifyd
spotifyd authenticate --oauth-port 5588 --cache-path /var/cache/spotifyd --config-path /etc/spotifyd.conf
# → Open URL in browser, authorize, copy redirect URL, then:
# curl "http://127.0.0.1:5588/login?code=XXXXX..."
systemctl start spotifyd

# D-Bus debugging
dbus-send --system --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.ListNames
journalctl -u spotifyd -n 20

# Check token refresh cron
cat /var/log/spotify-refresh.log
```

## Key conventions
- Frontend code and component names in English
- UI text can be in Spanish (Radio Isla Negra is a Chilean radio)
- DaisyUI component classes (btn, card, alert, etc.)
- Tailwind 4 (CSS-first config, no tailwind.config.js)
- No TypeScript
