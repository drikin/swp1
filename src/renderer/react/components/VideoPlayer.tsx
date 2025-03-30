import React, { useRef, useEffect } from 'react';

interface VideoPlayerProps {
  media: any | null;
}

// ビデオプレーヤーコンポーネント
const VideoPlayer: React.FC<VideoPlayerProps> = ({ media }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // メディアが変更されたときにビデオソースを更新
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (media && media.path) {
      // Electronでローカルファイルパスをソースとして設定
      // macOSやLinuxではファイルパスの先頭に'file://'を追加する必要がある
      const filePath = media.path.startsWith('file://') 
        ? media.path 
        : `file://${media.path}`;
      videoElement.src = filePath;
      videoElement.load();
    } else {
      videoElement.src = '';
    }
  }, [media]);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>プレビュー</h2>
        {media && <span>{media.name}</span>}
      </div>
      <div className="panel-content">
        <div className="video-player">
          {media ? (
            <video
              ref={videoRef}
              controls
              className="player-element"
              autoPlay={false}
            />
          ) : (
            <div className="empty-player">
              素材が選択されていません
            </div>
          )}
        </div>
        <div className="player-controls">
          <button>
            <span role="img" aria-label="play">▶️</span>
          </button>
          <button>
            <span role="img" aria-label="pause">⏸️</span>
          </button>
          <button>
            <span role="img" aria-label="stop">⏹️</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer; 