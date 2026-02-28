import { Volume2, VolumeX, Volume1 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import api from '../services/api';

function VolumeControl({ initialVolume }) {
  const [volume, setVolume] = useState(initialVolume ?? 50);
  const [isMuted, setIsMuted] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(initialVolume ?? 50);
  const debounceRef = useRef(null);
  const isUserDragging = useRef(false);

  useEffect(() => {
    if (initialVolume !== undefined && !isUserDragging.current && !debounceRef.current) {
      setVolume(initialVolume);
      setIsMuted(initialVolume === 0);
      if (initialVolume > 0) {
        setPreviousVolume(initialVolume);
      }
    }
  }, [initialVolume]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleVolumeChange = (newVolume) => {
    setVolume(newVolume);
    setIsMuted(newVolume === 0);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      try {
        await api.post('/api/playback/volume', { volume: newVolume });
      } catch (error) {
        console.error('Failed to set volume:', error);
      } finally {
        debounceRef.current = null;
        isUserDragging.current = false;
      }
    }, 300);
  };

  const handleInteractionStart = () => {
    isUserDragging.current = true;
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
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {getVolumeIcon()}
      </button>

      <input
        type="range"
        min="0"
        max="100"
        value={volume}
        onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
        onMouseDown={handleInteractionStart}
        onTouchStart={handleInteractionStart}
        className="range range-xs range-info flex-1"
        aria-label="Volume"
      />

      <span className="text-sm font-medium text-base-content/70 w-10 text-right tabular-nums">
        {volume}%
      </span>
    </div>
  );
}

export default VolumeControl;
