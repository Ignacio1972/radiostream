import { Play, Pause, SkipForward, SkipBack } from 'lucide-react';
import { useState } from 'react';

function Controls({
  isPlaying,
  onPlay,
  onPause,
  onNext,
  onPrevious
}) {
  const [loadingAction, setLoadingAction] = useState(null);

  const handleAction = async (action, callback) => {
    if (!callback) return;
    setLoadingAction(action);
    try {
      await callback();
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePlayPause = () => handleAction('play', isPlaying ? onPause : onPlay);
  const handleNext = () => handleAction('next', onNext);
  const handlePrevious = () => handleAction('previous', onPrevious);

  const isLoading = (action) => loadingAction === action;

  return (
    <div className="flex justify-center items-center gap-6 py-4">
      <button
        onClick={handlePrevious}
        disabled={isLoading('previous')}
        className="btn btn-ghost btn-circle btn-lg text-base-content hover:text-primary transition-colors"
        aria-label="Previous track"
      >
        {isLoading('previous') ? (
          <span className="loading loading-spinner loading-md"></span>
        ) : (
          <SkipBack size={32} fill="currentColor" />
        )}
      </button>

      <button
        onClick={handlePlayPause}
        disabled={isLoading('play')}
        className={`
          btn btn-circle btn-xl
          bg-white hover:bg-white hover:scale-105
          text-black border-0
          shadow-lg
          transition-all duration-200
          ${isLoading('play') ? 'opacity-70' : ''}
        `}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isLoading('play') ? (
          <span className="loading loading-spinner loading-lg"></span>
        ) : isPlaying ? (
          <Pause size={36} fill="currentColor" />
        ) : (
          <Play size={36} fill="currentColor" className="ml-1" />
        )}
      </button>

      <button
        onClick={handleNext}
        disabled={isLoading('next')}
        className="btn btn-ghost btn-circle btn-lg text-base-content hover:text-primary transition-colors"
        aria-label="Next track"
      >
        {isLoading('next') ? (
          <span className="loading loading-spinner loading-md"></span>
        ) : (
          <SkipForward size={32} fill="currentColor" />
        )}
      </button>
    </div>
  );
}

export default Controls;
