import dynamic from 'next/dynamic';
import { formatBytes } from '../lib/utils';

const CustomVideoPlayer = dynamic(() => import('./CustomVideoPlayer'), { ssr: false });

type FilePreviewItem = {
  path: string;
  name: string;
  size: number;
  category: string;
};

interface FilePreviewModalProps {
  file: FilePreviewItem;
  src: string;
  playerType: 'native' | 'custom';
  hasPrev: boolean;
  hasNext: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlayerType: () => void;
}

export default function FilePreviewModal({
  file,
  src,
  playerType,
  hasPrev,
  hasNext,
  onClose,
  onPrev,
  onNext,
  onTogglePlayerType,
}: FilePreviewModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <div className="relative w-full max-w-6xl mx-4">
        <div className="flex justify-between items-center mb-4">
          <div className="text-white">
            <h3 className="text-lg font-semibold truncate">{file.name}</h3>
            <p className="text-sm text-white/70">
              {file.category} • {formatBytes(file.size)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 p-2 hover:bg-white/20 transition-colors"
          >
            <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className="relative aspect-video bg-black rounded-xl overflow-hidden"
          onClick={(event) => event.stopPropagation()}
        >
          {playerType === 'custom' ? (
            <CustomVideoPlayer
              src={src}
              onClose={onClose}
              onNext={onNext}
              onPrev={onPrev}
              hasNext={hasNext}
              hasPrev={hasPrev}
              filename={file.name}
              path={file.path}
            />
          ) : (
            <video
              src={src}
              controls
              autoPlay
              className="w-full h-full"
            />
          )}
        </div>

        <div className="flex justify-between mt-4">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="rounded-lg bg-white/10 px-4 py-2 text-white disabled:opacity-50 hover:bg-white/20 transition-colors"
          >
            Previous
          </button>
          <button
            onClick={onTogglePlayerType}
            className="rounded-lg bg-white/10 px-4 py-2 text-white hover:bg-white/20 transition-colors"
          >
            Switch to {playerType === 'custom' ? 'Native' : 'Custom'} Player
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="rounded-lg bg-white/10 px-4 py-2 text-white disabled:opacity-50 hover:bg-white/20 transition-colors"
          >
            Next
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-white/60">
          Use ←/→ to navigate and Esc to close
        </p>
      </div>
    </div>
  );
}
