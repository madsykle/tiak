import React from 'react';

interface CustomVideoPlayerProps {
  src: string;
}

const CustomVideoPlayer: React.FC<CustomVideoPlayerProps> = ({ src }) => {
  return (
    <div data-testid="custom-video-player">
      <video src={src} controls style={{ width: '100%', height: 'auto' }} />
    </div>
  );
};

export default CustomVideoPlayer;