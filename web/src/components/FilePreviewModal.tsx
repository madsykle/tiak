import { useEffect } from 'react';
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
    <CustomVideoPlayer
      src={src}
      onClose={onClose}
      onNext={onNext}
      onPrev={onPrev}
      hasNext={hasNext}
      hasPrev={hasPrev}
      filename={file.name}
      path={file.path}
      mode={playerType}
      onTogglePlayerType={onTogglePlayerType}
    />
  );
}
