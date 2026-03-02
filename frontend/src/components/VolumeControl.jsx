import { Volume2, VolumeX, Volume1 } from 'lucide-react';
import { useState, useEffect } from 'react';

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
