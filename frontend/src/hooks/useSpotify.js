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
  const [pulseVolume, setPulseVolume] = useState(null);
  const consecutiveErrors = useRef(0);

  const { socket, isConnected: wsConnected, isReconnecting: wsReconnecting } = useWebSocket();

  const fetchCurrentTrack = useCallback(async () => {
    try {
      const response = await api.get('/api/playback/current');
      const data = response.data;
      console.log('[useSpotify] poll:', data ? `playing=${data.is_playing}, track=${data.name}` : 'null (D-Bus disconnected)');
      if (data) {
        setCurrentTrack(data);
        setIsPlaying(data.is_playing || false);
        setShuffle(data.shuffle_state || false);
        setRepeat(data.repeat_state || 'off');
      } else {
        setIsPlaying(false);
      }
      consecutiveErrors.current = 0;
      setError(null);
    } catch (err) {
      consecutiveErrors.current++;
      console.warn(`[useSpotify] poll error #${consecutiveErrors.current}:`, err.message);
      if (consecutiveErrors.current >= 3) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Socket.IO push updates (primary)
  useEffect(() => {
    if (!socket) return;

    socket.on('state-update', (data) => {
      console.log('[useSpotify] state-update via Socket.IO:', data ? `playing=${data.is_playing}, track=${data.name}` : 'null (disconnected)');
      if (data) {
        setCurrentTrack(data);
        setIsPlaying(data.is_playing || false);
        setShuffle(data.shuffle_state || false);
        setRepeat(data.repeat_state || 'off');
      } else {
        // D-Bus disconnected — spotifyd lost session
        setIsPlaying(false);
      }
      setLoading(false);
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

  // Fetch PulseAudio volume on mount
  useEffect(() => {
    api.get('/api/playback/volume').then(res => {
      setPulseVolume(res.data.volume);
    }).catch(() => {});
  }, []);

  const withErrorHandling = async (fn) => {
    try {
      const result = await fn();
      setError(null);
      return result;
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      console.error('[useSpotify] Action error:', msg);
      // Don't set error state for transient failures — let the UI stay usable
      // Error state is only set by fetchCurrentTrack for persistent issues
    }
  };

  const play = () => withErrorHandling(async () => {
    console.log('[useSpotify] action: play');
    setIsPlaying(true);
    await api.post('/api/playback/play');
    await fetchCurrentTrack();
  });

  const kickstart = () => withErrorHandling(async () => {
    console.log('[useSpotify] action: kickstart');
    await api.post('/api/playback/kickstart');
    // Wait for spotifyd to start playing and register MPRIS
    setTimeout(fetchCurrentTrack, 3000);
  });

  const pause = () => withErrorHandling(async () => {
    console.log('[useSpotify] action: pause');
    await api.post('/api/playback/pause');
    setIsPlaying(false);
  });

  const next = () => withErrorHandling(async () => {
    console.log('[useSpotify] action: next');
    await api.post('/api/playback/next');
  });

  const previous = () => withErrorHandling(async () => {
    console.log('[useSpotify] action: previous');
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
    toggleRepeat,
    kickstart,
    socket,
    pulseVolume
  };
}
