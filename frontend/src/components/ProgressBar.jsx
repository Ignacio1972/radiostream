import { useState, useRef, useEffect } from 'react';
import { formatTime } from '../utils/formatTime';

function ProgressBar({ progress, duration, onSeek }) {
  const [isDragging, setIsDragging] = useState(false);
  const [localProgress, setLocalProgress] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const currentProgress = localProgress !== null ? localProgress : progress;
  const progressValue = duration > 0 ? (currentProgress / duration) * 100 : 0;

  const handleChange = (e) => {
    const percent = parseInt(e.target.value);
    const newProgress = (percent / 100) * duration;
    setLocalProgress(newProgress);
    setIsDragging(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      if (onSeek) {
        try {
          await onSeek(newProgress);
        } catch (error) {
          console.error('Failed to seek:', error);
          setLocalProgress(null);
        }
      }
      setIsDragging(false);
    }, 150);
  };

  useEffect(() => {
    if (localProgress !== null && !isDragging) {
      if (Math.abs(progress - localProgress) < 2000) {
        setLocalProgress(null);
      }
    }
  }, [progress, localProgress, isDragging]);

  return (
    <div className="w-full mb-2">
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round(progressValue)}
        onChange={handleChange}
        className="custom-progress-bar"
        aria-label="Track progress"
      />
      <div className="flex justify-between text-xs text-base-content/50 mt-1">
        <span>{formatTime(currentProgress)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

export default ProgressBar;
