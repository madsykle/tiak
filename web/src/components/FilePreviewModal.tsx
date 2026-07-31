import dynamic from "next/dynamic";
const VideoPlayer = dynamic(() => import("./VideoPlayer"), { ssr: false });

type FilePreviewItem = {
	path: string;
	name: string;
	size: number;
	category: string;
};

interface FilePreviewModalProps {
	file: FilePreviewItem;
	src: string;
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
	hasPrev,
	hasNext,
	onClose,
	onPrev,
	onNext,
	onTogglePlayerType,
}: FilePreviewModalProps) {
	return (
		<VideoPlayer
			src={src}
			onClose={onClose}
			onNext={onNext}
			onPrev={onPrev}
			hasNext={hasNext}
			hasPrev={hasPrev}
			filename={file.name}
			path={file.path}
			onTogglePlayerType={onTogglePlayerType}
		/>
	);
}
