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
    toggleRepeat
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

  if (error) {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-spinner loading-lg text-success"></span>
          <p className="text-success">Stand by</p>
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
            <VolumeControl initialVolume={currentTrack?.device?.volume_percent} />
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
