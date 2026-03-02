# Volume Control Redesign — PulseAudio + WebSocket

## Problem
The current volume control in the Remote (`/remote`) uses D-Bus/MPRIS to change spotifyd's volume via HTTP REST calls with 300ms debounce. This is sluggish and unreliable — MPRIS may not be connected, and HTTP round-trips add latency when dragging the slider.

## Goal
Fluid, immediate volume control from the Remote, affecting the audio level heard by all Player listeners.

## Solution
Replace the current D-Bus volume with PulseAudio sink volume via WebSocket.

## Architecture

```
Remote (slider drag) → Socket.IO "volume-change" → Backend → pactl set-sink-volume → PulseAudio (spotify_out) → ffmpeg → Icecast → all listeners
```

- **No HTTP requests** — volume changes go through the existing Socket.IO connection
- **No debounce needed** — PulseAudio handles rapid changes natively
- **No D-Bus dependency** — works even when MPRIS is disconnected
- **Instant feedback** — Socket.IO emits back to all clients so other Remotes stay in sync

## Implementation Steps

### 1. Backend: Add Socket.IO volume handler in `backend/server.js`

In the `io.on('connection')` block (around line 65), add a listener for `volume-change`:

```js
socket.on('volume-change', async (volumePercent) => {
  // Clamp 0-100
  const vol = Math.max(0, Math.min(100, Math.round(volumePercent)));

  // Apply via PulseAudio (instant, no D-Bus needed)
  const { exec } = require('child_process');
  exec(`pactl set-sink-volume spotify_out ${vol}%`, (err) => {
    if (err) console.error('[Volume] pactl error:', err.message);
  });

  // Broadcast to all clients so other Remotes stay in sync
  io.to('radiostream').emit('volume-update', vol);
});
```

### 2. Backend: Add GET endpoint for current volume in `backend/routes/playback.js`

Add a route to read the current PulseAudio volume (needed on page load):

```js
const { execSync } = require('child_process');

router.get('/volume', (req, res) => {
  try {
    // pactl outputs volume as "Volume: front-left: 52428 /  80% / -5.81 dB, ..."
    const output = execSync('pactl get-sink-volume spotify_out').toString();
    const match = output.match(/(\d+)%/);
    const volume = match ? parseInt(match[1]) : 80;
    res.json({ volume });
  } catch (err) {
    console.error('[API] GET /volume error:', err.message);
    res.json({ volume: 80 }); // fallback
  }
});
```

### 3. Frontend: Update `VolumeControl.jsx`

Replace the current HTTP-based volume control with Socket.IO:

```jsx
import { Volume2, VolumeX, Volume1 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

function VolumeControl({ socket, initialVolume }) {
  const [volume, setVolume] = useState(initialVolume ?? 80);
  const [isMuted, setIsMuted] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(initialVolume ?? 80);

  // Sync from server (other Remote changed volume)
  useEffect(() => {
    if (!socket) return;
    socket.on('volume-update', (vol) => {
      setVolume(vol);
      setIsMuted(vol === 0);
    });
    return () => socket.off('volume-update');
  }, [socket]);

  // Sync initialVolume on mount
  useEffect(() => {
    if (initialVolume !== undefined) {
      setVolume(initialVolume);
      setIsMuted(initialVolume === 0);
      if (initialVolume > 0) setPreviousVolume(initialVolume);
    }
  }, [initialVolume]);

  const handleVolumeChange = (newVolume) => {
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    // Send directly via WebSocket — no debounce, no HTTP
    if (socket) socket.emit('volume-change', newVolume);
  };

  const toggleMute = () => {
    if (isMuted) {
      handleVolumeChange(previousVolume || 50);
    } else {
      setPreviousVolume(volume);
      handleVolumeChange(0);
    }
  };

  const getVolumeIcon = () => {
    if (isMuted || volume === 0) return <VolumeX size={28} />;
    if (volume < 50) return <Volume1 size={28} />;
    return <Volume2 size={28} />;
  };

  return (
    <div className="flex-1 flex items-center gap-2">
      <button
        onClick={toggleMute}
        className="btn btn-ghost btn-circle btn-sm text-base-content/70 hover:text-base-content"
      >
        {getVolumeIcon()}
      </button>
      <input
        type="range"
        min="0"
        max="100"
        value={volume}
        onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
        className="range range-xs range-info flex-1"
      />
      <span className="text-sm font-medium text-base-content/70 w-10 text-right tabular-nums">
        {volume}%
      </span>
    </div>
  );
}

export default VolumeControl;
```

### 4. Frontend: Pass socket to VolumeControl

In `RemoteControl.jsx`, the `useSpotify` hook already has access to the WebSocket. Expose the socket:

**In `useSpotify.js`**: add `socket` to the return object:
```js
return {
  // ...existing values...
  socket,  // add this
};
```

The `socket` comes from the `useWebSocket` hook which is already called inside `useSpotify`.

**In `RemoteControl.jsx`**: pass it to VolumeControl:
```jsx
const { socket, /* ...rest */ } = useSpotify();

// Then in JSX:
<VolumeControl socket={socket} initialVolume={currentTrack?.device?.volume_percent} />
```

### 5. Frontend: Fetch initial volume on mount

In `useSpotify.js`, fetch PulseAudio volume on mount:
```js
const [pulseVolume, setPulseVolume] = useState(null);

useEffect(() => {
  api.get('/api/playback/volume').then(res => {
    setPulseVolume(res.data.volume);
  }).catch(() => {});
}, []);
```

Return `pulseVolume` and use it as `initialVolume` for VolumeControl instead of `currentTrack?.device?.volume_percent`.

### 6. Remove old D-Bus volume code

- Remove the `/api/playback/volume` POST route from `backend/routes/playback.js` (the old D-Bus one)
- Remove the `setVolume` method usage from `dbusPlayer.js` (keep the method in case it's needed later)
- Remove the `debounceRef` and `isUserDragging` logic from VolumeControl (no longer needed)

## Files to modify
- `backend/server.js` — add Socket.IO `volume-change` handler
- `backend/routes/playback.js` — replace POST `/volume` with GET `/volume` (PulseAudio read)
- `frontend/src/components/VolumeControl.jsx` — rewrite to use Socket.IO
- `frontend/src/hooks/useSpotify.js` — expose socket, fetch initial PulseAudio volume
- `frontend/src/pages/RemoteControl.jsx` — pass socket to VolumeControl

## Testing
1. Open `/remote` on your phone
2. Drag the volume slider — should feel instant
3. Open `/remote` on another device — volume should stay in sync
4. Open `/player` on another device — audio level should change in real time
5. Verify with: `pactl get-sink-volume spotify_out` — should match slider value
6. Test when D-Bus is disconnected — volume should still work
