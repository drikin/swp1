import React, { useRef, useEffect, useState, forwardRef } from 'react';
import { Typography } from '@mui/material';

interface VideoPlayerProps {
  media: any | null;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onPlaybackRateChange?: (rate: number) => void;
  onTimeUpdate?: (time: number) => void;
}

export interface VideoPlayerRef {
  togglePlayback: () => void;
  stopPlayback: () => void;
  changePlaybackRate: (rate: number) => void;
  seekToTime: (time: number) => void;
  isPlaying: boolean;
  playbackRate: number;
}

// ビデオプレーヤーコンポーネント
const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(({ 
  media,
  onPlaybackStateChange,
  onPlaybackRateChange,
  onTimeUpdate
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isReversePlayback, setIsReversePlayback] = useState(false);
  const reverseIntervalRef = useRef<number | null>(null);

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

  // 逆再生の実装
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // 再生方向が変更されたとき
    if (isPlaying) {
      if (isReversePlayback) {
        // 通常再生を停止し、逆再生を開始
        videoElement.pause();
        startReversePlayback();
      } else {
        // 逆再生を停止し、通常再生を開始
        stopReversePlayback();
        videoElement.play();
      }
    }

    return () => {
      stopReversePlayback();
    };
  }, [isPlaying, isReversePlayback]);

  // 逆再生の開始
  const startReversePlayback = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // 既存の逆再生を停止
    stopReversePlayback();

    // 逆再生のステップサイズを計算（速度に応じて調整）
    const stepSize = Math.abs(playbackRate) * 0.04;

    // 逆再生インターバルの設定
    reverseIntervalRef.current = window.setInterval(() => {
      if (videoElement.currentTime <= 0) {
        // 動画の先頭に達したら逆再生を停止
        stopReversePlayback();
        setIsPlaying(false);
      } else {
        // 時間を逆方向に進める
        videoElement.currentTime = Math.max(0, videoElement.currentTime - stepSize);
      }
    }, 16) as unknown as number; // 約60fpsのレート
  };

  // 逆再生の停止
  const stopReversePlayback = () => {
    if (reverseIntervalRef.current !== null) {
      clearInterval(reverseIntervalRef.current);
      reverseIntervalRef.current = null;
    }
  };

  // 再生/一時停止のトグル
  const togglePlayback = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (isPlaying) {
      if (isReversePlayback) {
        stopReversePlayback();
      } else {
        videoElement.pause();
      }
      // 再生停止時は常に再生速度を1に設定
      videoElement.playbackRate = 1;
      setPlaybackRate(1);
      setIsReversePlayback(false);
    } else {
      if (playbackRate < 0) {
        setIsReversePlayback(true);
      } else {
        videoElement.play();
      }
    }
    setIsPlaying(!isPlaying);
  };

  // 再生を停止
  const stopPlayback = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (isReversePlayback) {
      stopReversePlayback();
    } else {
      videoElement.pause();
    }
    videoElement.playbackRate = 1;
    setIsPlaying(false);
    setPlaybackRate(1);
    setIsReversePlayback(false);
  };

  // 再生速度を変更
  const changePlaybackRate = (rate: number) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    setPlaybackRate(rate);

    // 正の値なら通常再生速度を設定
    if (rate > 0) {
      videoElement.playbackRate = rate;
      setIsReversePlayback(false);
      
      // 再生中ならば逆再生停止して通常再生に切り替え
      if (isPlaying && reverseIntervalRef.current !== null) {
        stopReversePlayback();
        videoElement.play();
      }
    } 
    // 負の値なら逆再生を設定
    else if (rate < 0) {
      setIsReversePlayback(true);
      
      // 再生中ならば逆再生を開始
      if (isPlaying) {
        videoElement.pause();
        startReversePlayback();
      }
    }
  };

  // 再生位置を指定時間に移動
  const seekToTime = (time: number) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // 時間をクランプ（0からdurationの間）
    const clampedTime = Math.max(0, Math.min(time, videoElement.duration || Infinity));
    videoElement.currentTime = clampedTime;

    // TimeUpdateイベントを手動でトリガーしてUIを即時更新
    onTimeUpdate?.(clampedTime);
  };

  // コンポーネントの外部から制御できるようにメソッドを公開
  React.useImperativeHandle(ref, () => ({
    togglePlayback,
    stopPlayback,
    changePlaybackRate,
    seekToTime,
    isPlaying,
    playbackRate
  }));

  return (
    <div className="panel">
      <div className="panel-header">
        <Typography variant="body2" gutterBottom>プレビュー</Typography>
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
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => stopPlayback()} // 再生終了時に停止
              onTimeUpdate={() => { 
                if (videoRef.current && onTimeUpdate) {
                  onTimeUpdate(videoRef.current.currentTime);
                }
              }}
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
          {isPlaying && <span className="playback-indicator">
            {isReversePlayback ? `◀ ${Math.abs(playbackRate)}x` : `${playbackRate}x ▶`}
          </span>}
        </div>
      </div>
    </div>
  );
});

export default VideoPlayer; 