import { useState, useRef } from 'react';
import { Radio, Square } from 'lucide-react';

function StreamPlayer() {
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);

  const toggleStream = async () => {
    if (!audioRef.current) return;

    if (isListening) {
      audioRef.current.pause();
      audioRef.current.src = '';
      setIsListening(false);
    } else {
      setIsLoading(true);
      audioRef.current.src = '/stream/isla';
      try {
        await audioRef.current.play();
        setIsListening(true);
      } catch (err) {
        console.error('Failed to play stream:', err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="mt-6">
      <button
        onClick={toggleStream}
        disabled={isLoading}
        className={`
          btn btn-block gap-2
          ${isListening
            ? 'btn-error btn-outline'
            : 'btn-primary'
          }
        `}
      >
        {isLoading ? (
          <span className="loading loading-spinner loading-sm"></span>
        ) : isListening ? (
          <>
            <Square size={18} fill="currentColor" />
            Stop Listening
          </>
        ) : (
          <>
            <Radio size={18} />
            Listen Live
          </>
        )}
      </button>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
}

export default StreamPlayer;
