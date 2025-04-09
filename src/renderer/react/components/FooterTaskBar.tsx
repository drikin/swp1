import React from 'react';
import { 
  AppBar, Toolbar, Typography, LinearProgress, 
  Box, IconButton, Divider 
} from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';
import { useTasks } from '../hooks';
import { formatDuration } from '../../utils/formatters';

interface FooterTaskBarProps {
  ffmpegVersion?: string;
  onShowTaskDetails: () => void;
  status?: string;
  totalDuration?: number;
  isTaskDetailsOpen: boolean; // タスク詳細パネルの表示状態
}

/**
 * フッターバーコンポーネント - タスク進捗表示とFFmpegバージョン情報を表示
 */
const FooterTaskBar: React.FC<FooterTaskBarProps> = ({ 
  ffmpegVersion, 
  onShowTaskDetails,
  status = '準備完了',
  totalDuration = 0,
  isTaskDetailsOpen = false // デフォルトは閉じている状態
}) => {
  // タスク情報をコンテキストから取得
  const { tasks, activeTaskCount, overallProgress } = useTasks();
  
  // タスクが存在するかどうか
  const hasTasks = tasks.length > 0;
  
  // 操作生成時間のフォーマット
  const formattedDuration = formatDuration(totalDuration);
  
  return (
    <AppBar 
      position="fixed" 
      color="inherit" 
      sx={{ 
        top: 'auto', 
        bottom: 0, 
        borderTop: '1px solid rgba(0, 0, 0, 0.12)',
        boxShadow: '0 -2px 4px rgba(0, 0, 0, 0.05)',
        height: 36
      }}
    >
      <Toolbar variant="dense" sx={{ minHeight: 36, px: 2 }}>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          width: '100%',
          justifyContent: 'space-between'
        }}>
          {/* 左側：タスク管理エリア */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            mr: 2,
            flexBasis: '35%'
          }}>
            {hasTasks ? (
              <>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    fontSize: '0.75rem',
                    fontWeight: activeTaskCount > 0 ? 'medium' : 'normal',
                    color: activeTaskCount > 0 ? 'primary.main' : 'text.secondary',
                    whiteSpace: 'nowrap',
                    mr: 1.5
                  }}
                  onClick={onShowTaskDetails}
                  style={{ cursor: 'pointer' }}
                >
                  {activeTaskCount > 0 
                    ? `処理中: ${activeTaskCount}件` 
                    : `タスク: ${tasks.length}件`
                  }
                </Typography>
                
                <LinearProgress 
                  variant="determinate" 
                  value={overallProgress} 
                  sx={{ 
                    flexGrow: 1, 
                    height: 4, 
                    borderRadius: 2,
                    maxWidth: 150,
                    backgroundColor: 'rgba(0, 0, 0, 0.08)'
                  }}
                />
                
                <IconButton 
                  size="small" 
                  onClick={onShowTaskDetails}
                  sx={{ ml: 0.5, p: 0.5 }}
                  aria-label={isTaskDetailsOpen ? "タスク詳細を閉じる" : "タスク詳細を開く"}
                >
                  {isTaskDetailsOpen ? (
                    <ExpandMore fontSize="small" />
                  ) : (
                    <ExpandLess fontSize="small" />
                  )}
                </IconButton>
              </>
            ) : (
              <Typography 
                variant="body2" 
                color="text.secondary"
                sx={{ fontSize: '0.75rem' }}
              >
                処理待ちのタスクはありません
              </Typography>
            )}
          </Box>
          
          {/* 中央：ステータスとデュレーション */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center',
            justifyContent: 'center',
            flexGrow: 1
          }}>
            <Typography 
              variant="caption" 
              color="text.secondary"
              sx={{ fontSize: '0.7rem', mr: 2 }}
            >
              {status}
            </Typography>
            
            <Typography 
              variant="caption" 
              color="text.secondary"
              sx={{ 
                fontSize: '0.7rem', 
                fontWeight: 'medium',
                ml: 2 
              }}
            >
              総時間: {formattedDuration}
            </Typography>
          </Box>
          
          {/* 右側：バージョン情報 */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center',
            justifyContent: 'flex-end',
            flexBasis: '25%'
          }}>
            <Typography 
              variant="caption" 
              color="text.secondary"
              sx={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}
            >
              {ffmpegVersion || 'FFmpeg: 読み込み中...'}
            </Typography>
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default FooterTaskBar;
