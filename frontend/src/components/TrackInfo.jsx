import { Music } from 'lucide-react';

function TrackInfo({ track, isPlaying }) {
  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-48 h-48 bg-base-300 rounded-xl flex items-center justify-center mb-6">
          <Music size={64} className="text-base-content/20" />
        </div>
        <p className="text-base-content/50">No track playing</p>
        <p className="text-base-content/30 text-sm mt-1">Play something on Spotify</p>
      </div>
    );
  }

  return (
    <div className="mb-3">
      {/* Artwork Container */}
      <div className="relative mb-4">
        {/* Glow effect */}
        <div
          className="absolute inset-0 blur-2xl opacity-50 scale-90"
          style={{
            backgroundImage: `url(${track.artwork?.large})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />

        {/* Main Artwork */}
        <div className="relative">
          <div className="aspect-square rounded-2xl overflow-hidden shadow-2xl">
            <img
              src={track.artwork?.large || '/placeholder.png'}
              alt={track.name}
              className={`
                w-full h-full object-cover
                ${isPlaying ? 'scale-100' : 'scale-[1.01]'}
                transition-transform duration-500
              `}
            />
          </div>

          {/* Brand Badge */}
          <div className="absolute bottom-4 right-4">
            <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg">
              <p className="text-lg font-semibold text-white">Radio Isla Negra</p>
            </div>
          </div>
        </div>
      </div>

      {/* Track Info */}
      <div className="text-center">
        <h1 className="text-xl font-bold text-base-content line-clamp-1">
          {track.name}
        </h1>
        <p className="text-base-content/60 text-sm mt-1 line-clamp-1">
          {track.artist}
        </p>
      </div>
    </div>
  );
}

export default TrackInfo;
