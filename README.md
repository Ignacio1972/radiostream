# RadioStream — Radio Isla Negra

Controlador remoto de Spotify + audio streaming via web. Corre en el mismo VPS que SpotyFlow (`64.176.14.99`).

## Estado actual

| Componente | Estado | Notas |
|---|---|---|
| Backend (Node.js, puerto 4001) | Funcionando | PM2: `radiostream` |
| Frontend (React + Vite) | Funcionando | `https://isla.mediaflow.cl` |
| OAuth Spotify | Funcionando | Cuenta "Radio Isla Negra" autorizada |
| Cloudflare Tunnel | Funcionando | CNAME en `/etc/cloudflared/config.yml` |
| Nginx | Configurado | `/etc/nginx/sites-available/isla.mediaflow.cl` |
| PulseAudio null sink | **Pendiente** | Captura de audio |
| spotifyd | **Pendiente** | Cliente Spotify headless |
| Icecast2 | **Pendiente** | Servidor de streaming |
| FFmpeg | **Pendiente** | PulseAudio → MP3 → Icecast |

**Lo que funciona hoy:** Controles de playback (play/pause/next/prev/volume/seek/shuffle/repeat/like) desde cualquier dispositivo via `isla.mediaflow.cl`.

**Lo que falta:** Audio streaming. El botón "Listen Live" en el frontend apunta a `/stream/isla` que Nginx proxea a Icecast (puerto 8000), pero Icecast no está instalado aún.

---

## Arquitectura

```
Browser → Cloudflare Tunnel → Nginx (:80)
  ├── /             → Node.js (:4001)     ← Controles + frontend
  ├── /socket.io/   → Node.js (:4001)     ← WebSocket
  └── /stream/      → Icecast (:8000)     ← Audio stream (pendiente)

Spotify Connect:
  spotifyd → PulseAudio (sink: spotify_out) → FFmpeg → Icecast → Browser <audio>

Spotify Web API:
  Node.js → api.spotify.com (OAuth tokens)
```

**Importante:** spotifyd usa Spotify Connect (username/password), el backend usa OAuth (Web API). Son autenticaciones independientes pero la misma cuenta ("Radio Isla Negra", username `radioislanegra`).

---

## Archivos importantes

### Backend
| Archivo | Qué hace |
|---|---|
| `backend/server.js` | Entry point, Express + Socket.IO, puerto 4001 |
| `backend/.env` | Credenciales Spotify, session secret |
| `backend/config/spotify.js` | Scopes de Spotify |
| `backend/middleware/auth.js` | Inyecta token Spotify + auto-refresh con mutex |
| `backend/routes/auth.js` | OAuth flow (`/auth/login`, `/auth/callback`) |
| `backend/routes/playback.js` | Todos los controles de playback |
| `backend/routes/stream.js` | Info y status de Icecast |
| `backend/services/spotifyAPI.js` | Wrapper de la API de Spotify (copiado de SpotyFlow) |
| `backend/services/tokenStorage.js` | Tokens en `backend/data/spotify-tokens.json` |
| `backend/services/tokenKeeper.js` | Refresh proactivo cada 20 min |
| `backend/services/deviceManager.js` | Busca device "RadioStream" o "spotifyd" |

### Frontend
| Archivo | Qué hace |
|---|---|
| `frontend/src/components/Player.jsx` | UI principal (todo junto, sin feature flags) |
| `frontend/src/components/StreamPlayer.jsx` | Botón "Listen Live" + `<audio>` tag → `/stream/isla` |
| `frontend/src/hooks/useSpotify.js` | Polling + WebSocket + acciones de playback |
| `frontend/src/hooks/useWebSocket.js` | Conexión Socket.IO |

### Infra
| Archivo | Qué hace |
|---|---|
| `ecosystem.config.js` | Config PM2 |
| `/etc/cloudflared/config.yml` | Tunnel entry para `isla.mediaflow.cl` → `:4001` |
| `/etc/nginx/sites-available/isla.mediaflow.cl` | Nginx: proxy a Node.js + proxy `/stream/` a Icecast |
| `systemd/*.service` | Configs de referencia para systemd (no instaladas) |

---

## Fase pendiente: Audio Streaming

### Objetivo
Capturar el audio que spotifyd reproduce y enviarlo como stream MP3 al browser.

### Cadena de audio
```
spotifyd → PulseAudio (null sink "spotify_out") → FFmpeg (captura monitor) → Icecast2 (:8000/isla) → Nginx (/stream/isla) → Browser <audio>
```

### Paso 1: Instalar PulseAudio

```bash
apt install pulseaudio
# Iniciar en modo system-wide (no como user daemon)
pulseaudio --system --daemonize

# Crear null sink para capturar audio
pactl load-module module-null-sink sink_name=spotify_out sink_properties=device.description="SpotifyCapture"

# Verificar
pactl list sinks short
# Debe aparecer: spotify_out
```

**Consideración:** PulseAudio en un VPS sin display puede ser complicado. Puede necesitar `pulseaudio --system` y configurar `/etc/pulse/system.pa`. Una alternativa es usar PipeWire.

### Paso 2: Instalar y configurar spotifyd

```bash
# Opción 1: desde repos
apt install spotifyd

# Opción 2: binario precompilado
# https://github.com/Spotifyd/spotifyd/releases
```

Configuración en `/etc/spotifyd.conf` (ver `systemd/spotifyd.conf.toml`):
```toml
[global]
username = "radioislanegra"
# password via env var o password_cmd
backend = "pulseaudio"
device_name = "RadioStream"
bitrate = 320
```

```bash
# Ejecutar spotifyd apuntando al null sink
PULSE_SINK=spotify_out spotifyd --no-daemon --config-path /etc/spotifyd.conf

# Verificar: debe aparecer como device "RadioStream" en Spotify
```

**Consideración:** spotifyd necesita la contraseña de Spotify. Opciones:
- `password` en el .conf (inseguro)
- `password_cmd = "cat /etc/spotifyd-password"` (mejor)
- Variable de entorno `SPOTIFY_PASSWORD`

### Paso 3: Instalar Icecast2

```bash
apt install icecast2
```

Editar `/etc/icecast2/icecast.xml`:
```xml
<source-password>hackme</source-password>  <!-- password para FFmpeg -->
<admin-password>admin123</admin-password>
<hostname>localhost</hostname>
<listen-socket>
    <port>8000</port>
    <bind-address>127.0.0.1</bind-address>  <!-- solo local, Nginx proxea -->
</listen-socket>
```

```bash
systemctl enable icecast2
systemctl start icecast2

# Verificar
curl http://127.0.0.1:8000/status-json.xsl
```

### Paso 4: FFmpeg (PulseAudio → Icecast)

```bash
apt install ffmpeg

# Comando para capturar y streamear:
ffmpeg -f pulse -i spotify_out.monitor \
  -acodec libmp3lame -ab 192k -ar 44100 \
  -content_type audio/mpeg \
  -f mp3 icecast://source:hackme@127.0.0.1:8000/isla
```

Si funciona, configurar como servicio systemd (ver `systemd/radiostream-ffmpeg.service`).

### Paso 5: Verificar todo

```bash
# 1. Servicios corriendo
systemctl status pulseaudio spotifyd icecast2
# FFmpeg como servicio o verificar que el proceso existe

# 2. Stream activo
curl -I http://127.0.0.1:8000/isla
# Debe responder 200 con Content-Type: audio/mpeg

# 3. Status via API
curl http://localhost:4001/api/stream/status
# Debe mostrar: {"active": true, "listeners": 0}

# 4. Stream desde Nginx
curl -I http://localhost/stream/isla
# (con Host: isla.mediaflow.cl)

# 5. Browser
# Abrir isla.mediaflow.cl, click "Listen Live"
```

### Paso 6: Servicios systemd

Los archivos de referencia están en `systemd/`. Para instalarlos:

```bash
cp systemd/radiostream-pulseaudio.service /etc/systemd/system/
cp systemd/radiostream-ffmpeg.service /etc/systemd/system/
cp systemd/spotifyd.service /etc/systemd/system/

systemctl daemon-reload
systemctl enable radiostream-pulseaudio spotifyd radiostream-ffmpeg
systemctl start radiostream-pulseaudio spotifyd radiostream-ffmpeg
```

**Orden de arranque:** PulseAudio → spotifyd → Icecast2 → FFmpeg

---

## Comandos útiles

```bash
# Logs
pm2 logs radiostream
pm2 logs radiostream --err

# Restart backend
pm2 restart radiostream

# Rebuild frontend
cd /var/www/radiostream/frontend && npm run build

# Restart tunnel (si se cambia config)
systemctl restart cloudflared

# Tokens de Spotify (se guardan acá)
cat /var/www/radiostream/backend/data/spotify-tokens.json

# Re-autorizar OAuth (si token revocado)
# Visitar: https://isla.mediaflow.cl/auth/login
```

---

## Credenciales

- **Spotify App:** Client ID `63e10fa2802e4cf690f7045e79e32c00`
- **Spotify Account:** username `radioislanegra` (Premium requerido)
- **Redirect URI:** `https://isla.mediaflow.cl/auth/callback`
- **Icecast source password:** `hackme` (cambiar en producción, actualizar en FFmpeg command y `systemd/radiostream-ffmpeg.service`)

---

## Latencia esperada del stream

El audio via HTTP streaming tiene ~5-15 segundos de buffer. Esto es normal. Los controles en la UI reflejan el estado inmediato de la API de Spotify, pero el audio que se escucha va con delay.

---

## Troubleshooting

| Problema | Causa probable | Solución |
|---|---|---|
| Controles no funcionan | Token expirado | Visitar `/auth/login` |
| "No devices available" | spotifyd no corre o no aparece en Spotify | `systemctl status spotifyd`, verificar logs |
| Stream no suena | FFmpeg no corre, Icecast caído, o PulseAudio sin null sink | Verificar cada servicio en orden |
| 502 en isla.mediaflow.cl | Backend crasheado | `pm2 logs radiostream --err`, luego `pm2 restart radiostream` |
| Stream corta | FFmpeg se desconectó | Verificar `systemctl status radiostream-ffmpeg`, auto-restart lo debería recuperar |
