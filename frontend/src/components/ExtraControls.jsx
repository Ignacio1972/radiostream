import { Shuffle, Repeat, Repeat1 } from 'lucide-react';

function ExtraControls({
  shuffle,
  repeat,
  onToggleShuffle,
  onToggleRepeat
}) {
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
