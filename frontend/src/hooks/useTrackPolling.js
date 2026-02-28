import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const POLL_INTERVAL = 10000;

export function useTrackPolling() {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTrack = useCallback(async () => {
    try {
      const response = await api.get('/api/playback/current');
      const data = response.data;
      setCurrentTrack(data);
      setIsPlaying(data?.is_playing || false);
    } catch {
      // silently ignore — player is read-only
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrack();
    const interval = setInterval(fetchTrack, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchTrack]);

  return { currentTrack, isPlaying, loading };
}
