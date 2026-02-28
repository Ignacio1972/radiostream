import { useState, useRef, useEffect, useCallback } from 'react';
import { Radio, Square, Volume2, VolumeX, Music } from 'lucide-react';
import { useTrackPolling } from '../hooks/useTrackPolling';
import api from '../services/api';

function WebPlayer() {
  const { currentTrack, isPlaying } = useTrackPolling();

  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [streamActive, setStreamActive] = useState(false);
  const [volume, setVolume] = useState(80);
  const audioRef = useRef(null);

  const checkStreamStatus = useCallback(async () => {
    try {
      const res = await api.get('/api/stream/status');
      setStreamActive(res.data?.active || false);
    } catch {
      setStreamActive(false);
    }
  }, []);

  useEffect(() => {
    checkStreamStatus();
    const interval = setInterval(checkStreamStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStreamStatus]);

  const toggleStream = async () => {
    if (!audioRef.current) return;

    if (isListening) {
      audioRef.current.pause();
      audioRef.current.src = '';
      setIsListening(false);
    } else {
      setIsLoading(true);
      audioRef.current.src = '/stream/isla';
      audioRef.current.volume = volume / 100;
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

  const handleVolume = (e) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val / 100;
    }
  };

  const artwork = currentTrack?.artwork?.large;

  return (
    <div className="min-h-screen bg-base-100 flex items-start justify-center p-4 pt-6">
      <div
        className="fixed inset-0 opacity-30 transition-all duration-1000"
        style={{
          background: artwork
            ? `linear-gradient(to bottom, rgba(29, 185, 84, 0.3), transparent)`
            : 'transparent'
        }}
      />

      <div className="card bg-base-200/80 backdrop-blur-xl shadow-2xl max-w-md w-full relative z-10">
        <div className="card-body p-4 pb-8">
          {/* Live Indicator */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${streamActive ? 'bg-red-500 animate-pulse' : 'bg-base-content/30'}`} />
            <span className={`text-sm font-semibold uppercase tracking-wider ${streamActive ? 'text-red-500' : 'text-base-content/40'}`}>
              {streamActive ? 'En Vivo' : 'Fuera de Aire'}
            </span>
          </div>

          {/* Artwork */}
          <div className="relative mb-4">
            {artwork && (
              <div
                className="absolute inset-0 blur-2xl opacity-50 scale-90"
                style={{
                  backgroundImage: `url(${artwork})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            )}
            <div className="relative">
              <div className="aspect-square rounded-2xl overflow-hidden shadow-2xl">
                {artwork ? (
                  <img
                    src={artwork}
                    alt={currentTrack?.name}
                    className={`w-full h-full object-cover ${isPlaying ? 'scale-100' : 'scale-[1.01]'} transition-transform duration-500`}
                  />
                ) : (
                  <div className="w-full h-full bg-base-300 flex items-center justify-center">
                    <Music size={64} className="text-base-content/20" />
                  </div>
                )}
              </div>
              <div className="absolute bottom-4 right-4">
                <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg">
                  <p className="text-lg font-semibold text-white">Radio Isla Negra</p>
                </div>
              </div>
            </div>
          </div>

          {/* Track Info */}
          {currentTrack ? (
            <div className="text-center mb-4">
              <h1 className="text-xl font-bold text-base-content line-clamp-1">{currentTrack.name}</h1>
              <p className="text-base-content/60 text-sm mt-1 line-clamp-1">{currentTrack.artist}</p>
            </div>
          ) : (
            <div className="text-center mb-4">
              <p className="text-base-content/50">Radio Isla Negra</p>
            </div>
          )}

          {/* Play/Stop Stream */}
          <button
            onClick={toggleStream}
            disabled={isLoading || !streamActive}
            className={`btn btn-block btn-lg gap-2 ${isListening ? 'btn-error btn-outline' : 'btn-primary'}`}
          >
            {isLoading ? (
              <span className="loading loading-spinner loading-sm"></span>
            ) : !streamActive ? (
              <>
                <Radio size={18} />
                Stream no disponible
              </>
            ) : isListening ? (
              <>
                <Square size={18} fill="currentColor" />
                Stop
              </>
            ) : (
              <>
                <Radio size={18} />
                Escuchar en Vivo
              </>
            )}
          </button>

          {/* Volume */}
          {isListening && (
            <div className="mt-4 flex items-center gap-3">
              {volume === 0 ? <VolumeX size={18} className="text-base-content/50" /> : <Volume2 size={18} className="text-base-content/50" />}
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolume}
                className="range range-sm range-primary flex-1"
              />
            </div>
          )}

          <audio ref={audioRef} className="hidden" />
        </div>
      </div>
    </div>
  );
}

export default WebPlayer;
