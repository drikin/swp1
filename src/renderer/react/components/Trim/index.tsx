import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import type { MediaFile } from '../../types';
import { useWaveform } from '../../hooks';
import WaveformDisplay from './WaveformDisplay';
import TrimControls from './TrimControls';

interface TrimPaneProps {
  selectedMedia: MediaFile | null;
  currentTime: number;
  onUpdateTrimPoints: (mediaId: string, trimStart: number | null, trimEnd: number | null) => void;
  onSeek: (time: number) => void;
}

/**
 * トリムペインコンポーネント - 波形表示とトリム範囲設定
 */
const TrimPane: React.FC<TrimPaneProps> = ({ 
  selectedMedia, 
  currentTime, 
  onUpdateTrimPoints,
  onSeek
}) => {
  // 波形データフック
  const { 
    waveformData, 
    isLoading: isLoadingWaveform, 
    generateWaveform, 
    error: waveformError 
  } = useWaveform();
  
  // ローカルステート
  const [trimStart, setTrimStart] = useState<number | null>(null);
  const [trimEnd, setTrimEnd] = useState<number | null>(null);
  const [seeking, setSeeking] = useState(false);
  const [duration, setDuration] = useState(0);
  
  // メディアが変更されたときの処理
  useEffect(() => {
    if (selectedMedia) {
      // 動画の長さを設定
      setDuration(selectedMedia.duration || 0);
      
      // すでに設定されているトリムポイントがあれば反映
      setTrimStart(selectedMedia.trimStart !== undefined ? selectedMedia.trimStart : null);
      setTrimEnd(selectedMedia.trimEnd !== undefined ? selectedMedia.trimEnd : null);
      
      // 波形データを読み込み
      loadWaveformData(selectedMedia);
    } else {
      // メディアがないときはリセット
      setTrimStart(null);
      setTrimEnd(null);
    }
  }, [selectedMedia]);
  
  // 波形データの読み込み
  const loadWaveformData = async (media: MediaFile) => {
    if (!media || !media.path) return;
    
    try {
      await generateWaveform(media.path, media.id);
    } catch (error) {
      console.error('波形データ生成エラー:', error);
    }
  };
  
  // トリム開始位置を設定
  const handleSetTrimStart = useCallback((time: number) => {
    setTrimStart(time);
    
    if (selectedMedia && time !== null) {
      // トリム情報をアップデート（ローカルとコンテキスト両方）
      if (trimEnd !== null) {
        onUpdateTrimPoints(selectedMedia.id, time, trimEnd);
      } else {
        // 終了点が未設定の場合は、メディアの最後を自動設定
        const end = selectedMedia.duration || 0;
        setTrimEnd(end);
        onUpdateTrimPoints(selectedMedia.id, time, end);
      }
    }
  }, [selectedMedia, trimEnd, onUpdateTrimPoints]);
  
  // トリム終了位置を設定
  const handleSetTrimEnd = useCallback((time: number) => {
    setTrimEnd(time);
    
    if (selectedMedia && time !== null) {
      // トリム情報をアップデート（ローカルとコンテキスト両方）
      if (trimStart !== null) {
        onUpdateTrimPoints(selectedMedia.id, trimStart, time);
      } else {
        // 開始点が未設定の場合は、メディアの最初を自動設定
        const start = 0;
        setTrimStart(start);
        onUpdateTrimPoints(selectedMedia.id, start, time);
      }
    }
  }, [selectedMedia, trimStart, onUpdateTrimPoints]);
  
  // トリム設定をリセット
  const handleResetTrim = useCallback(() => {
    setTrimStart(null);
    setTrimEnd(null);
    
    if (selectedMedia) {
      onUpdateTrimPoints(selectedMedia.id, null, null);
    }
  }, [selectedMedia, onUpdateTrimPoints]);
  
  // シーク操作の処理
  const handleSeek = useCallback((time: number) => {
    onSeek(time);
    setSeeking(true);
    
    // シーク操作が終了したときの処理
    const handleSeekEnd = () => {
      setSeeking(false);
      document.removeEventListener('mouseup', handleSeekEnd);
    };
    
    document.addEventListener('mouseup', handleSeekEnd);
  }, [onSeek]);
  
  // 選択されたメディアがない場合
  if (!selectedMedia) {
    return (
      <Box className="panel" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Typography variant="body1" color="text.secondary">
          メディアが選択されていません
        </Typography>
      </Box>
    );
  }
  
  // 波形データ読み込み中
  if (isLoadingWaveform) {
    return (
      <Box className="panel" sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress size={40} />
        <Typography variant="body1" sx={{ mt: 2 }}>
          波形データを読み込み中...
        </Typography>
      </Box>
    );
  }
  
  // 波形データ読み込みエラー
  if (waveformError) {
    return (
      <Box className="panel" sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Typography variant="body1" color="error">
          波形データの読み込みに失敗しました
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {waveformError}
        </Typography>
      </Box>
    );
  }
  
  return (
    <Box className="panel" sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box className="panel-header">
        <Typography variant="h6">波形編集</Typography>
      </Box>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 40px)' }}>
        {/* 波形表示エリア */}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {waveformData && waveformData.length > 0 ? (
            <WaveformDisplay
              waveformData={waveformData}
              duration={duration}
              trimStart={trimStart}
              trimEnd={trimEnd}
              currentTime={currentTime}
              seeking={seeking}
              onSetTrimStart={handleSetTrimStart}
              onSetTrimEnd={handleSetTrimEnd}
              onSeek={handleSeek}
            />
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Typography variant="body2" color="text.secondary">
                波形データがありません
              </Typography>
            </Box>
          )}
        </Box>
        
        {/* トリムコントロールエリア */}
        <Box sx={{ borderTop: '1px solid rgba(0, 0, 0, 0.12)' }}>
          <TrimControls
            trimStart={trimStart}
            trimEnd={trimEnd}
            duration={duration}
            currentTime={currentTime}
            onSetTrimStart={handleSetTrimStart}
            onSetTrimEnd={handleSetTrimEnd}
            onResetTrim={handleResetTrim}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default TrimPane;
