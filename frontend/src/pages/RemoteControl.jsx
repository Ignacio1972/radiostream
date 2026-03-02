import { useSpotify } from '../hooks/useSpotify';
import TrackInfo from '../components/TrackInfo';
import Controls from '../components/Controls';
import VolumeControl from '../components/VolumeControl';
import ProgressBar from '../components/ProgressBar';
import ExtraControls from '../components/ExtraControls';
import ConnectionStatus from '../components/ConnectionStatus';

function RemoteControl() {
  const {
    currentTrack,
    isPlaying,
    shuffle,
    repeat,
    loading,
    error,
    wsConnected,
    wsReconnecting,
    play,
    pause,
    next,
    previous,
    seek,
    toggleShuffle,
    toggleRepeat,
    kickstart,
    socket,
    pulseVolume
  } = useSpotify();

  if (loading) {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-base-content/60">Connecting to Radio Isla Negra...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100 flex items-start justify-center p-4 pt-6">
      <div
        className="fixed inset-0 opacity-30 transition-all duration-1000"
        style={{
          background: currentTrack?.artwork?.large
            ? `linear-gradient(to bottom, rgba(29, 185, 84, 0.3), transparent)`
            : 'transparent'
        }}
      />

      <div className="card bg-base-200/80 backdrop-blur-xl shadow-2xl max-w-md w-full relative z-10">
        <div className="card-body p-4 pb-8">
          {error && !currentTrack && (
            <div className="flex flex-col items-center gap-4 py-8">
              <p className="text-base-content/60 text-sm">Sin reproducción activa</p>
              <button className="btn btn-primary btn-lg gap-2" onClick={kickstart}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                  <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                </svg>
                Iniciar Radio
              </button>
            </div>
          )}

          {error && currentTrack && (
            <div className="alert alert-warning py-2 px-3 mb-3">
              <span className="text-sm">Stand by...</span>
            </div>
          )}

          <TrackInfo track={currentTrack} isPlaying={isPlaying} />

          <ProgressBar
            progress={currentTrack?.progress_ms || 0}
            duration={currentTrack?.duration_ms || 0}
            onSeek={seek}
          />

          <Controls
            isPlaying={isPlaying}
            onPlay={play}
            onPause={pause}
            onNext={next}
            onPrevious={previous}
          />

          <ExtraControls
            shuffle={shuffle}
            repeat={repeat}
            onToggleShuffle={toggleShuffle}
            onToggleRepeat={toggleRepeat}
          />

          <div className="mt-6">
            <VolumeControl socket={socket} initialVolume={pulseVolume} />
          </div>

          <div className="flex justify-center mt-8">
            <ConnectionStatus isConnected={wsConnected} isReconnecting={wsReconnecting} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default RemoteControl;
