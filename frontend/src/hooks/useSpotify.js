import { useState, useEffect, useCallback } from 'react';
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
