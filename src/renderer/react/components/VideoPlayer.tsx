import React, { useRef, useEffect, useState, forwardRef, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  IconButton, 
  Paper,
  useTheme
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  Stop,
  VolumeUp,
  VolumeMute
} from '@mui/icons-material';
import Logger from '../utils/logger';

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
  seekRelative: (seconds: number) => void;
  changeVolume: (delta: number) => void;
  toggleMute: () => void;
  getCurrentTime: () => number;
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
      const filePath = media.path.startsWith('file://') 
        ? media.path 
        : `file://${media.path}`;
      
      // 現在のsrcと新しいpathが異なる場合のみ再読み込み
      if (videoElement.src !== filePath) {
        Logger.info('VideoPlayer', 'メディアソース変更', { path: media.path });
        videoElement.src = filePath;
        videoElement.load();
      }
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
        Logger.debug('VideoPlayer', '逆再生開始', { rate: playbackRate });
        videoElement.pause();
        startReversePlayback();
      } else {
        // 逆再生を停止し、通常再生を開始
        Logger.debug('VideoPlayer', '通常再生開始', { rate: playbackRate });
        stopReversePlayback();
        videoElement.play();
      }
    }

    return () => {
      stopReversePlayback();
    };
  }, [isPlaying, isReversePlayback, playbackRate]);

  // 逆再生の開始
  const startReversePlayback = useCallback(() => {
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
        Logger.debug('VideoPlayer', '逆再生終了（先頭に到達）');
        stopReversePlayback();
        setIsPlaying(false);
      } else {
        // 時間を逆方向に進める
        videoElement.currentTime = Math.max(0, videoElement.currentTime - stepSize);
      }
    }, 16) as unknown as number; // 約60fpsのレート
  }, [playbackRate]);

  // 逆再生の停止
  const stopReversePlayback = useCallback(() => {
    if (reverseIntervalRef.current !== null) {
      clearInterval(reverseIntervalRef.current);
      reverseIntervalRef.current = null;
    }
  }, []);

  // 再生/一時停止のトグル
  const togglePlayback = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (isPlaying) {
      Logger.debug('VideoPlayer', '再生停止');
      if (isReversePlayback) {
        stopReversePlayback();
      } else {
        videoElement.pause();
      }
      setIsPlaying(false);
    } else {
      Logger.debug('VideoPlayer', '再生開始', { reverse: isReversePlayback });
      if (isReversePlayback) {
        startReversePlayback();
      } else {
        videoElement.play();
      }
      setIsPlaying(true);
    }
  }, [isPlaying, isReversePlayback, startReversePlayback, stopReversePlayback]);

  // 再生を停止
  const stopPlayback = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    Logger.debug('VideoPlayer', '再生停止（完全停止）');
    
    // 逆再生または通常再生を停止
    if (isReversePlayback) {
      stopReversePlayback();
    } else {
      videoElement.pause();
    }
    
    // 再生位置を先頭に戻す
    videoElement.currentTime = 0;
    setIsPlaying(false);
  }, [isReversePlayback, stopReversePlayback]);

  // 再生速度を変更
  const changePlaybackRate = useCallback((rate: number) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    Logger.debug('VideoPlayer', '再生速度変更', { rate });
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
  }, [isPlaying, startReversePlayback, stopReversePlayback]);

  // 再生位置を指定時間に移動
  const seekToTime = useCallback((time: number) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // 時間をクランプ（0からdurationの間）
    const clampedTime = Math.max(0, Math.min(time, videoElement.duration || Infinity));
    videoElement.currentTime = clampedTime;

    Logger.debug('VideoPlayer', 'シーク', { time: clampedTime });
    
    // TimeUpdateイベントを手動でトリガーしてUIを即時更新
    onTimeUpdate?.(clampedTime);
  }, [onTimeUpdate]);

  // 現在の再生時間から相対的に移動
  const seekRelative = useCallback((seconds: number) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const newTime = videoElement.currentTime + seconds;
    Logger.debug('VideoPlayer', '相対シーク', { seconds, newTime });
    seekToTime(newTime);
  }, [seekToTime]);

  // 音量を変更（増減）
  const changeVolume = useCallback((delta: number) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const newVolume = Math.max(0, Math.min(1, videoElement.volume + delta));
    videoElement.volume = newVolume;
    Logger.debug('VideoPlayer', '音量変更', { newVolume: Math.round(newVolume * 100) });
  }, []);

  // ミュート切り替え
  const toggleMute = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    videoElement.muted = !videoElement.muted;
    Logger.debug('VideoPlayer', 'ミュート切替', { muted: videoElement.muted });
  }, []);

  // 現在の再生時間を取得
  const getCurrentTime = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return 0;
    
    return videoElement.currentTime;
  }, []);

  // コンポーネントの外部から制御できるようにメソッドを公開
  React.useImperativeHandle(ref, () => ({
    togglePlayback,
    stopPlayback,
    changePlaybackRate,
    seekToTime,
    seekRelative,
    changeVolume,
    toggleMute,
    getCurrentTime,
    isPlaying,
    playbackRate
  }), [
    togglePlayback,
    stopPlayback,
    changePlaybackRate,
    seekToTime,
    seekRelative,
    changeVolume,
    toggleMute,
    getCurrentTime,
    isPlaying,
    playbackRate
  ]);

  return (
    <Box 
      className="panel"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
      }}
    >
      <Box 
        className="panel-header"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
        }}
      >
        <Typography variant="h6" component="h2" sx={{ fontSize: '0.9rem', fontWeight: 'medium' }}>
          プレビュー
        </Typography>
        {media && (
          <Typography 
            variant="body2" 
            className="media-title"
            sx={{
              fontSize: '0.8rem',
              color: 'text.secondary',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              maxWidth: '70%'
            }}
          >
            {media.name}
          </Typography>
        )}
      </Box>
      
      <Box 
        className="panel-content"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          bgcolor: 'background.default',
        }}
      >
        <Box 
          className="video-player"
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            bgcolor: '#000',
          }}
        >
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
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain'
              }}
            />
          ) : (
            <Box 
              className="empty-player"
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                width: '100%',
                color: 'text.secondary',
                bgcolor: 'background.paper',
                borderRadius: 1,
                p: 2
              }}
            >
              <Typography variant="body1" sx={{ fontWeight: 'medium', mb: 1 }}>
                素材が選択されていません
              </Typography>
              <Typography variant="body2" color="text.secondary">
                タイムラインから素材を選択してください
              </Typography>
            </Box>
          )}
        </Box>
        
        <Box 
          className="player-controls"
          sx={{
            display: 'flex',
            alignItems: 'center',
            p: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            zIndex: 10
          }}
        >
          <IconButton 
            onClick={togglePlayback}
            size="small"
            color="primary"
            aria-label={isPlaying ? "一時停止" : "再生"}
            sx={{ mr: 1 }}
          >
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>
          
          <IconButton 
            onClick={stopPlayback}
            size="small"
            aria-label="停止"
            sx={{ mr: 1 }}
          >
            <Stop />
          </IconButton>
          
          {isPlaying && (
            <Typography 
              variant="caption" 
              className="playback-indicator"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 1,
                py: 0.5,
                bgcolor: 'action.selected',
                borderRadius: 1,
                fontSize: '0.75rem',
                fontWeight: 'medium'
              }}
            >
              {isReversePlayback ? `◀ ${Math.abs(playbackRate)}x` : `${playbackRate}x ▶`}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
});

export default VideoPlayer;