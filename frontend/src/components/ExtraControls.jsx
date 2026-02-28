import { Heart, Shuffle, Repeat, Repeat1 } from 'lucide-react';
import { useState } from 'react';

function ExtraControls({
  isLiked,
  onToggleLike,
  trackId,
  shuffle,
  repeat,
  onToggleShuffle,
  onToggleRepeat
}) {
  const [isLiking, setIsLiking] = useState(false);

  const handleLike = async () => {
    if (!onToggleLike || !trackId) return;
    setIsLiking(true);
    try {
      await onToggleLike(trackId);
    } catch (error) {
      console.error('Failed to toggle like:', error);
    } finally {
      setIsLiking(false);
    }
  };

  return (
    <div className="flex items-center justify-center gap-6">
      {/* Shuffle */}
      <button
        onClick={onToggleShuffle}
        className={`
          btn btn-ghost btn-circle btn-sm
          ${shuffle ? 'text-primary' : 'text-base-content/50 hover:text-base-content'}
        `}
        aria-label="Toggle shuffle"
      >
        <Shuffle size={20} />
      </button>

      {/* Like */}
      <button
        onClick={handleLike}
        disabled={isLiking || !trackId}
        className={`
          btn btn-ghost btn-circle btn-lg
          transition-all duration-200
          ${isLiked ? 'text-red-500' : 'text-base-content/50 hover:text-base-content'}
          disabled:opacity-50
        `}
        aria-label={isLiked ? 'Remove from library' : 'Add to library'}
      >
        {isLiking ? (
          <span className="loading loading-spinner loading-sm"></span>
        ) : (
          <Heart
            size={28}
            className={`transition-transform ${isLiked ? 'scale-110' : ''}`}
            fill={isLiked ? 'currentColor' : 'none'}
          />
        )}
      </button>

      {/* Repeat */}
      <button
        onClick={onToggleRepeat}
        className={`
          btn btn-ghost btn-circle btn-sm
          ${repeat !== 'off' ? 'text-primary' : 'text-base-content/50 hover:text-base-content'}
        `}
        aria-label="Toggle repeat"
      >
        {repeat === 'track' ? <Repeat1 size={20} /> : <Repeat size={20} />}
      </button>
    </div>
  );
}

export default ExtraControls;
