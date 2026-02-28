import { useSpotify } from '../hooks/useSpotify';
import TrackInfo from './TrackInfo';
import Controls from './Controls';
import VolumeControl from './VolumeControl';
import ProgressBar from './ProgressBar';
import ExtraControls from './ExtraControls';
import StreamPlayer from './StreamPlayer';
import ConnectionStatus from './ConnectionStatus';

function Player() {
  const {
    currentTrack,
    isPlaying,
    shuffle,
    repeat,
    loading,
    error,
    isReconnecting,
    wsConnected,
    wsReconnecting,
    play,
    pause,
    next,
    previous,
    seek,
    toggleLike,
    isLiked,
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
      {/* Background gradient */}
      <div
        className="fixed inset-0 opacity-30 transition-all duration-1000"
        style={{
          background: currentTrack?.artwork?.large
            ? `linear-gradient(to bottom, rgba(29, 185, 84, 0.3), transparent)`
            : 'transparent'
        }}
      />

      {/* Main Player Card */}
      <div className="card bg-base-200/80 backdrop-blur-xl shadow-2xl max-w-md w-full relative z-10">
        <div className="card-body p-4 pb-8">
          {/* Reconnecting Banner */}
          {isReconnecting && (
            <div className="alert alert-warning py-2 px-3 mb-3">
              <span className="loading loading-spinner loading-xs"></span>
              <span className="text-sm">Reconnecting...</span>
            </div>
          )}

          {/* Track Info with Artwork */}
          <TrackInfo track={currentTrack} isPlaying={isPlaying} />

          {/* Progress Bar */}
          <ProgressBar
            progress={currentTrack?.progress_ms || 0}
            duration={currentTrack?.duration_ms || 0}
            onSeek={seek}
          />

          {/* Main Controls */}
          <Controls
            isPlaying={isPlaying}
            onPlay={play}
            onPause={pause}
            onNext={next}
            onPrevious={previous}
          />

          {/* Extra Controls: Shuffle, Like, Repeat */}
          <ExtraControls
            isLiked={isLiked}
            onToggleLike={toggleLike}
            trackId={currentTrack?.id}
            shuffle={shuffle}
            repeat={repeat}
            onToggleShuffle={toggleShuffle}
            onToggleRepeat={toggleRepeat}
          />

          {/* Volume Control */}
          <div className="mt-6">
            <VolumeControl initialVolume={currentTrack?.device?.volume_percent} />
          </div>

          {/* Stream Player */}
          <StreamPlayer />

          {/* Connection Status */}
          <div className="flex justify-center mt-8">
            <ConnectionStatus isConnected={wsConnected} isReconnecting={wsReconnecting} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Player;
