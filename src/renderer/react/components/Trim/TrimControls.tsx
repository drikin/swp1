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
      
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        height: '32px' // 高さを固定して動的な変化を防止
      }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <ButtonGroup variant="outlined" size="small">
            <Tooltip title="開始点をセット">
              <Button 
                onClick={handleSetTrimStart}
                disabled={currentTime >= (trimEnd ?? Infinity)}
                startIcon={<ArrowBack fontSize="small" />}
                sx={{ fontSize: '0.75rem' }}
              >
                IN{trimStart !== null ? `: ${formatTime(trimStart)}` : '点'}
              </Button>
            </Tooltip>
            
            <Tooltip title="終了点をセット">
              <Button 
                onClick={handleSetTrimEnd}
                disabled={currentTime <= (trimStart ?? -1)}
                endIcon={<ArrowForward fontSize="small" />}
                sx={{ fontSize: '0.75rem' }}
              >
                OUT{trimEnd !== null ? `: ${formatTime(trimEnd)}` : '点'}
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
        
        {/* トリム範囲を右側に表示 */}
        {trimStart !== null && trimEnd !== null && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Divider orientation="vertical" flexItem />
            <Typography 
              variant="caption" 
              color="primary.main"
              sx={{ 
                fontSize: '0.75rem',
                fontWeight: 'medium',
                whiteSpace: 'nowrap'
              }}
            >
              長さ: {formatTime(trimEnd - trimStart)}
            </Typography>
          </Box>
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
