import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import api from '../services/api';

const isNetworkError = (err) => {
  const message = err.message?.toLowerCase() || '';
  return (
    !err.response &&
    (message.includes('network') ||
     message.includes('timeout') ||
     message.includes('aborted') ||
     err.code === 'ECONNABORTED')
  );
};

const MAX_CONSECUTIVE_ERRORS = 3;

export function useSpotify() {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off');
  const [isLiked, setIsLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const consecutiveErrors = useRef(0);

  const fetchUntilTrackChanges = useCallback(async (previousTrackId) => {
    const maxRetries = 5;
    const delays = [500, 1000, 1500, 2000, 3000];
    for (let i = 0; i < maxRetries; i++) {
      await new Promise(r => setTimeout(r, delays[i]));
      try {
        const response = await api.get('/api/playback/current');
        const data = response.data;
        if (data?.id && data.id !== previousTrackId) {
          setCurrentTrack(data);
          setIsPlaying(data?.is_playing || false);
          setShuffle(data?.shuffle_state || false);
          setRepeat(data?.repeat_state || 'off');
          consecutiveErrors.current = 0;
          setError(null);
          setIsReconnecting(false);
          if (data.id) checkIfLiked(data.id);
          return;
        }
      } catch (err) {
        // ignore during retry
      }
    }
    fetchCurrentTrack();
  }, []);

  const withErrorHandling = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      throw err;
    }
  };

  const { socket, isConnected: wsConnected, isReconnecting: wsReconnecting } = useWebSocket();

  const fetchCurrentTrack = useCallback(async () => {
    try {
      const response = await api.get('/api/playback/current');
      const data = response.data;

      setCurrentTrack(data);
      setIsPlaying(data?.is_playing || false);
      setShuffle(data?.shuffle_state || false);
      setRepeat(data?.repeat_state || 'off');

      consecutiveErrors.current = 0;
      setError(null);
      setIsReconnecting(false);

      if (data?.id) {
        checkIfLiked(data.id);
      }
    } catch (err) {
      consecutiveErrors.current++;

      const errorCode = err.response?.data?.code;
      if (errorCode === 'REFRESH_TOKEN_REVOKED') {
        setError('Spotify authorization expired. Please re-authenticate.');
        setIsReconnecting(false);
      } else if (isNetworkError(err)) {
        if (consecutiveErrors.current >= MAX_CONSECUTIVE_ERRORS) {
          setError('Connection lost. Please check your internet.');
          setIsReconnecting(false);
        } else {
          setIsReconnecting(true);
          setError(null);
        }
      } else {
        if (consecutiveErrors.current >= MAX_CONSECUTIVE_ERRORS) {
          setError(err.response?.data?.message || err.message);
          setIsReconnecting(false);
        } else {
          setIsReconnecting(true);
          setError(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const checkIfLiked = async (trackId) => {
    try {
      const response = await api.get(`/api/playback/check-liked?ids=${trackId}`);
      setIsLiked(response.data?.[0] || false);
    } catch (err) {
      console.error('Failed to check if track is liked:', err);
    }
  };

  useEffect(() => {
    fetchCurrentTrack();
    const pollInterval = wsConnected ? 5000 : 2000;
    const interval = setInterval(fetchCurrentTrack, pollInterval);
    return () => clearInterval(interval);
  }, [fetchCurrentTrack, wsConnected]);

  useEffect(() => {
    if (!socket) return;

    socket.on('track-changed', () => {
      setTimeout(fetchCurrentTrack, 800);
    });

    socket.on('playback-changed', (data) => {
      if (data.is_playing !== undefined) setIsPlaying(data.is_playing);
      if (data.shuffle_state !== undefined) setShuffle(data.shuffle_state);
      if (data.repeat_state !== undefined) setRepeat(data.repeat_state);
      if (data.volume !== undefined) {
        setCurrentTrack(prev => prev ? {
          ...prev,
          device: { ...prev.device, volume_percent: data.volume }
        } : null);
      }
    });

    socket.on('volume-changed', (data) => {
      if (data.volume !== undefined) {
        setCurrentTrack(prev => prev ? {
          ...prev,
          device: { ...prev.device, volume_percent: data.volume }
        } : null);
      }
    });

    socket.on('auth-expired', (data) => {
      console.error('[Spotify] Authorization expired:', data);
      setError('Spotify authorization expired. Please re-authenticate.');
      setIsReconnecting(false);
    });

    return () => {
      socket.off('track-changed');
      socket.off('playback-changed');
      socket.off('volume-changed');
      socket.off('auth-expired');
    };
  }, [socket, fetchCurrentTrack]);

  const play = () => withErrorHandling(async () => {
    await api.post('/api/playback/play');
    setIsPlaying(true);
  });

  const pause = () => withErrorHandling(async () => {
    await api.post('/api/playback/pause');
    setIsPlaying(false);
  });

  const next = () => withErrorHandling(async () => {
    const prevId = currentTrack?.id;
    await api.post('/api/playback/next');
    fetchUntilTrackChanges(prevId);
  });

  const previous = () => withErrorHandling(async () => {
    const prevId = currentTrack?.id;
    await api.post('/api/playback/previous');
    fetchUntilTrackChanges(prevId);
  });

  const seek = (positionMs) => withErrorHandling(async () => {
    await api.post('/api/playback/seek', { position_ms: Math.round(positionMs) });
    setCurrentTrack(prev => prev ? { ...prev, progress_ms: Math.round(positionMs) } : null);
    setTimeout(fetchCurrentTrack, 500);
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

  const toggleLike = (trackId) => {
    if (!trackId) return;
    return withErrorHandling(async () => {
      if (isLiked) {
        await api.delete('/api/playback/like', { data: { ids: [trackId] } });
      } else {
        await api.put('/api/playback/like', { ids: [trackId] });
      }
      setIsLiked(!isLiked);
    });
  };

  return {
    currentTrack,
    isPlaying,
    shuffle,
    repeat,
    isLiked,
    loading,
    error,
    isReconnecting,
    wsConnected,
    wsReconnecting,
    play,
    pause,
    next,
    previous,
    seek,
    toggleShuffle,
    toggleRepeat,
    toggleLike
  };
}
