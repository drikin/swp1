import React from 'react';
import { Button, Box, Typography } from '@mui/material';

interface TrimControlsProps {
  trimStart: number | null;
  trimEnd: number | null;
  duration: number;
  currentTime: number;
  onSetTrimStart: (time: number) => void;
  onSetTrimEnd: (time: number) => void;
  onResetTrim: () => void;
}

/**
 * トリムコントロールコンポーネント
 */
const TrimControls: React.FC<TrimControlsProps> = ({
  trimStart,
  trimEnd,
  duration,
  currentTime,
  onSetTrimStart,
  onSetTrimEnd,
  onResetTrim
}) => {
  // 現在位置をトリム開始点にセット
  const handleSetTrimStart = () => {
    onSetTrimStart(currentTime);
  };
  
  // 現在位置をトリム終了点にセット
  const handleSetTrimEnd = () => {
    onSetTrimEnd(currentTime);
  };
  
  // トリム範囲全体をリセット
  const handleResetTrim = () => {
    onResetTrim();
  };
  
  // トリム範囲の表示
  const trimRange = trimStart !== null && trimEnd !== null
    ? `${formatTime(trimStart)} - ${formatTime(trimEnd)} (${formatTime(trimEnd - trimStart)})`
    : '設定されていません';
  
  return (
    <Box sx={{ padding: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6">トリム設定</Typography>
      
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button 
          variant="outlined" 
          color="primary" 
          onClick={handleSetTrimStart}
          disabled={currentTime >= (trimEnd ?? Infinity)}
        >
          開始点をセット
        </Button>
        
        <Button 
          variant="outlined" 
          color="primary" 
          onClick={handleSetTrimEnd}
          disabled={currentTime <= (trimStart ?? -1)}
        >
          終了点をセット
        </Button>
        
        <Button 
          variant="outlined" 
          color="secondary" 
          onClick={handleResetTrim}
          disabled={trimStart === null && trimEnd === null}
        >
          リセット
        </Button>
      </Box>
      
      <Box sx={{ mt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          現在位置: {formatTime(currentTime)} / {formatTime(duration)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          トリム範囲: {trimRange}
        </Typography>
      </Box>
    </Box>
  );
};

/**
 * 秒を時:分:秒の形式にフォーマット
 */
const formatTime = (seconds: number): string => {
  const pad = (num: number): string => num.toString().padStart(2, '0');
  
  const totalSeconds = Math.round(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  
  return `${pad(mins)}:${pad(secs)}`;
};

export default TrimControls;
