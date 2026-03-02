import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Square, SkipForward, SkipBack, Heart, HeartOff, Volume2, VolumeX, Music } from 'lucide-react';
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

      <div className="card bg-base-200/80 backdrop-blur-xl shadow-2xl max-w-2xl w-full relative z-10">
        <div className="card-body p-6 pb-10">
          {/* Live Indicator */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className={`inline-block w-3 h-3 rounded-full ${streamActive ? 'bg-red-500 animate-pulse' : 'bg-base-content/30'}`} />
            <span className={`text-base font-semibold uppercase tracking-wider ${streamActive ? 'text-red-500' : 'text-base-content/40'}`}>
              {streamActive ? 'En Vivo' : 'Fuera de Aire'}
            </span>
          </div>

          {/* Artwork */}
          <div className="relative mb-6">
            {artwork && (
              <div
                className="absolute inset-0 blur-3xl opacity-50 scale-90"
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
                    <Music size={96} className="text-base-content/20" />
                  </div>
                )}
              </div>
              <div className="absolute bottom-6 right-6">
                <div className="bg-black/60 backdrop-blur-sm rounded-xl px-5 py-2.5 shadow-lg flex items-center gap-3">
                  <img src="/deportistas.png" alt="Los Deportistas" className="h-10 w-10 object-contain" />
                  <p className="text-2xl font-bold text-white">Los Deportistas</p>
                </div>
              </div>
            </div>
          </div>

          {/* Track Info */}
          {currentTrack ? (
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-base-content line-clamp-1">{currentTrack.name}</h1>
              <p className="text-base-content/60 text-lg mt-2 line-clamp-1">{currentTrack.artist}</p>
            </div>
          ) : (
            <div className="text-center mb-6">
              <p className="text-base-content/50 text-xl">Radio Isla Negra</p>
            </div>
          )}

          {/* Player Controls */}
          <div className="flex justify-center items-center gap-8 py-4">
            <button
              onClick={async () => { try { await api.post('/api/playback/previous'); } catch {} }}
              disabled={!streamActive}
              className="btn btn-ghost btn-circle btn-xl text-base-content hover:text-primary transition-colors"
              aria-label="Previous track"
            >
              <SkipBack size={40} fill="currentColor" />
            </button>

            <button
              onClick={toggleStream}
              disabled={isLoading || !streamActive}
              className={`
                btn btn-circle btn-xl
                bg-white hover:bg-white hover:scale-105
                text-black border-0
                shadow-lg
                transition-all duration-200
                ${isLoading ? 'opacity-70' : ''}
                ${!streamActive ? 'opacity-40' : ''}
              `}
              aria-label={isListening ? 'Stop' : 'Play'}
            >
              {isLoading ? (
                <span className="loading loading-spinner loading-lg"></span>
              ) : isListening ? (
                <Square size={36} fill="currentColor" />
              ) : (
                <Play size={36} fill="currentColor" className="ml-1" />
              )}
            </button>

            <button
              onClick={async () => { try { await api.post('/api/playback/next'); } catch {} }}
              disabled={!streamActive}
              className="btn btn-ghost btn-circle btn-xl text-base-content hover:text-primary transition-colors"
              aria-label="Next track"
            >
              <SkipForward size={40} fill="currentColor" />
            </button>
          </div>

          {/* Like / Dislike */}
          <div className="flex justify-center items-center gap-10">
            <button
              className="btn btn-ghost btn-circle btn-lg text-base-content/60 hover:text-red-500 transition-colors"
              aria-label="Like"
            >
              <Heart size={28} />
            </button>
            <button
              className="btn btn-ghost btn-circle btn-lg text-base-content/60 hover:text-base-content transition-colors"
              aria-label="Dislike"
            >
              <HeartOff size={28} />
            </button>
          </div>

          {/* Volume */}
          {isListening && (
            <div className="flex items-center gap-4 mt-2">
              {volume === 0 ? <VolumeX size={22} className="text-base-content/50" /> : <Volume2 size={22} className="text-base-content/50" />}
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
