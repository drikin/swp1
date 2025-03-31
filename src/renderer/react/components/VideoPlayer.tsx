import React, { useRef, useEffect, useState, forwardRef } from 'react';

interface VideoPlayerProps {
  media: any | null;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onPlaybackRateChange?: (rate: number) => void;
}

export interface VideoPlayerRef {
  togglePlayback: () => void;
  stopPlayback: () => void;
  changePlaybackRate: (rate: number) => void;
  isPlaying: boolean;
  playbackRate: number;
}

// ビデオプレーヤーコンポーネント
const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(({ 
  media,
  onPlaybackStateChange,
  onPlaybackRateChange
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

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

  // 再生状態の変更を通知
  useEffect(() => {
    onPlaybackStateChange?.(isPlaying);
  }, [isPlaying, onPlaybackStateChange]);

  // 再生速度の変更を通知
  useEffect(() => {
    onPlaybackRateChange?.(playbackRate);
  }, [playbackRate, onPlaybackRateChange]);

  // 再生/一時停止のトグル
  const togglePlayback = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (isPlaying) {
      videoElement.pause();
      videoElement.playbackRate = 1;
      setPlaybackRate(1);
    } else {
      videoElement.play();
    }
    setIsPlaying(!isPlaying);
  };

  // 再生を停止
  const stopPlayback = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    videoElement.pause();
    videoElement.playbackRate = 1;
    setIsPlaying(false);
    setPlaybackRate(1);
  };

  // 再生速度を変更
  const changePlaybackRate = (rate: number) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    videoElement.playbackRate = rate;
    setPlaybackRate(rate);
  };

  // コンポーネントの外部から制御できるようにメソッドを公開
  React.useImperativeHandle(ref, () => ({
    togglePlayback,
    stopPlayback,
    changePlaybackRate,
    isPlaying,
    playbackRate
  }));

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>プレビュー</h2>
        {media && <span className="media-title">{media.name}</span>}
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
          <button onClick={togglePlayback}>
            <span role="img" aria-label={isPlaying ? "pause" : "play"}>
              {isPlaying ? "⏸️" : "▶️"}
            </span>
          </button>
          <button onClick={stopPlayback}>
            <span role="img" aria-label="stop">⏹️</span>
          </button>
        </div>
      </div>
    </div>
  );
});

export default VideoPlayer; 