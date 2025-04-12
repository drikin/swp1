import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, CircularProgress, Paper, Divider, useTheme } from '@mui/material';
import type { MediaFile, MediaFileWithTaskIds } from '../../types/media';
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
    isLoadingWaveform, 
    getWaveformForMedia, 
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
      console.log('選択メディア変更：', {
        id: selectedMedia.id,
        path: selectedMedia.path,
        duration: selectedMedia.duration,
        trimStart: selectedMedia.trimStart,
        trimEnd: selectedMedia.trimEnd
      });
      
      // 動画の長さを設定
      const mediaDuration = selectedMedia.duration || 0;
      console.log(`duration設定: ${mediaDuration}秒`);
      setDuration(mediaDuration);
      
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
      console.log('波形データ読み込み開始:', media.path);
      // 波形データを取得（getWaveformForMediaを使用）
      const mediaWithTaskIds = media as MediaFileWithTaskIds;
      const taskId = await getWaveformForMedia(mediaWithTaskIds);
      
      if (taskId) {
        console.log('波形データタスクID:', taskId);
      } else {
        console.error('波形データ生成失敗: タスクIDが取得できませんでした');
      }
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
      <Paper 
        elevation={0}
        sx={{ 
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100%',
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="body1" color="text.secondary">
          メディアが選択されていません
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          タイムラインから素材を選択してください
        </Typography>
      </Paper>
    );
  }
  
  // 波形データ読み込み中
  if (isLoadingWaveform) {
    return (
      <Paper 
        elevation={0}
        sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100%',
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <CircularProgress size={40} color="primary" />
        <Typography variant="body1" sx={{ mt: 2 }}>
          波形データを読み込み中...
        </Typography>
      </Paper>
    );
  }
  
  // 波形データ読み込みエラー
  if (waveformError) {
    return (
      <Paper 
        elevation={0}
        sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100%',
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="body1" color="error">
          波形データの読み込みに失敗しました
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {waveformError}
        </Typography>
      </Paper>
    );
  }
  
  return (
    <Paper 
      elevation={0}
      sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      <Box 
        sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100%',
          minHeight: 0,  
          overflow: 'hidden',
        }}
      >
        {/* 波形表示エリア */}
        <Box 
          sx={{ 
            flex: 1, 
            minHeight: 0, 
            overflow: 'hidden',
            bgcolor: 'background.default',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          {waveformData && waveformData.length > 0 ? (
            <>
              {/* デバッグ情報表示 */}
              <Box sx={{ 
                position: 'absolute', 
                top: 0, 
                right: 0, 
                zIndex: 100, 
                bgcolor: 'rgba(0,0,0,0.7)', 
                color: 'white', 
                p: 1, 
                fontSize: '10px',
                maxWidth: '200px',
                overflowX: 'hidden'
              }}>
                <div>データ長: {waveformData.length}</div>
                <div>再生時間: {duration.toFixed(1)}秒</div>
                <div>データタイプ: {typeof waveformData}</div>
                <div>サンプル: {waveformData.slice(0, 5).map(v => v.toFixed(2)).join(', ')}...</div>
              </Box>
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
            </>
          ) : (
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              height: '100%',
              p: 2,
            }}>
              <Typography variant="body2" color="text.secondary">
                波形データがありません
              </Typography>
            </Box>
          )}
        </Box>
        
        {/* トリムコントロールエリア */}
        <Box 
          sx={{ 
            bgcolor: 'background.paper',
            flexShrink: 0,
          }}
        >
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
    </Paper>
  );
};

export default TrimPane;
