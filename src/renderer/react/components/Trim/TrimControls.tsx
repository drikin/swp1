import React from 'react';
import { 
  Button, 
  Box, 
  Typography, 
  ButtonGroup, 
  IconButton, 
  Divider, 
  Tooltip,
  Paper,
  useTheme
} from '@mui/material';
import {
  ContentCut,
  PlayArrow,
  SkipNext,
  RestartAlt,
  ArrowForward,
  ArrowBack
} from '@mui/icons-material';

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
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'medium', fontSize: '0.85rem' }}>
          トリム設定
        </Typography>
        
        <Typography variant="caption" color="text.secondary">
          現在位置: {formatTime(currentTime)} / {formatTime(duration)}
        </Typography>
      </Box>
      
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <ButtonGroup variant="outlined" size="small">
          <Tooltip title="開始点をセット">
            <Button 
              onClick={handleSetTrimStart}
              disabled={currentTime >= (trimEnd ?? Infinity)}
              startIcon={<ArrowBack fontSize="small" />}
              sx={{ fontSize: '0.75rem' }}
            >
              IN点
            </Button>
          </Tooltip>
          
          <Tooltip title="終了点をセット">
            <Button 
              onClick={handleSetTrimEnd}
              disabled={currentTime <= (trimStart ?? -1)}
              endIcon={<ArrowForward fontSize="small" />}
              sx={{ fontSize: '0.75rem' }}
            >
              OUT点
            </Button>
          </Tooltip>
        </ButtonGroup>
        
        <Tooltip title="リセット">
          <span>
            <IconButton 
              size="small"
              color="secondary" 
              onClick={handleResetTrim}
              disabled={trimStart === null && trimEnd === null}
            >
              <RestartAlt fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      
      <Box
        sx={{
          mt: 1,
          p: 1,
          borderRadius: 1,
          bgcolor: 'action.hover',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5
        }}
      >
        <Typography 
          variant="body2" 
          color={trimStart !== null && trimEnd !== null ? 'primary' : 'text.secondary'}
          sx={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            fontWeight: trimStart !== null && trimEnd !== null ? 'medium' : 'regular'
          }}
        >
          <span>トリム範囲:</span>
          <span>{trimRange}</span>
        </Typography>
        
        {trimStart !== null && trimEnd !== null && (
          <Typography 
            variant="body2" 
            color="text.secondary"
            sx={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              fontSize: '0.75rem' 
            }}
          >
            <span>開始:</span>
            <span>{formatTime(trimStart)}</span>
          </Typography>
        )}
        
        {trimStart !== null && trimEnd !== null && (
          <Typography 
            variant="body2" 
            color="text.secondary"
            sx={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              fontSize: '0.75rem' 
            }}
          >
            <span>終了:</span>
            <span>{formatTime(trimEnd)}</span>
          </Typography>
        )}
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
