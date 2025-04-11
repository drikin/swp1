import React, { useEffect, useState } from 'react';
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
  const { 
    tasks, 
    activeTaskCount, 
    overallProgress, 
    isTaskActive, 
    getActiveTasks 
  } = useTasks();
  
  // 内部状態としてタスク処理中フラグと進捗を保持
  const [isProcessingTasks, setIsProcessingTasks] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  
  // タスクが存在するかどうか
  const hasTasks = tasks.length > 0;
  
  // 開発環境でのみタスクの詳細情報をログ出力
  if (process.env.NODE_ENV === 'development') {
    console.warn('FooterTaskBar - タスク詳細情報:', {
      tasksCount: tasks.length,
      tasksList: tasks.map(task => ({
        id: task.id.slice(0, 8),
        type: task.type,
        status: task.status,
        progress: task.progress || 0,
        completedAt: task.completedAt,
        isActive: isTaskActive(task)
      }))
    });
  }
  
  // TaskContextから処理中タスクを取得
  const activeTasks = getActiveTasks();
  
  // 処理中タスクの存在
  const activeTasksExist = activeTasks.length > 0;
  
  // アクティブなタスクの判定（どちらかが true ならアクティブタスクあり）
  const hasActiveTasks = activeTasksExist || activeTaskCount > 0;
  
  // 進捗率の計算 - タスクに進捗情報があれば利用、なければ50%とする
  const calculatedProgress = activeTasks.length > 0
    ? activeTasks.reduce((sum, task) => sum + (task.progress !== undefined ? task.progress : 50), 0) / activeTasks.length
    : 0;
  
  // 最終的に表示する進捗率（コンテキストから取得した値かバックアップ計算値）
  const displayProgress = overallProgress > 0 ? overallProgress : calculatedProgress;
  
  // 処理中フラグを設定
  const forceShowProgress = hasActiveTasks || activeTasksExist;
  
  // タスク状態が変更されたときに内部状態を更新
  useEffect(() => {
    // 開発環境でのみタスク状態変更時にログ出力
    if (process.env.NODE_ENV === 'development') {
      console.warn('FooterTaskBar - タスク状態更新:', {
        tasksCount: tasks.length,
        hasTasks,
        activeTasksCount: activeTasks.length,
        activeTaskCount,
        activeTasksExist,
        hasActiveTasks,
        forceShowProgress,
        overallProgress,
        calculatedProgress,
        displayProgress
      });
    }
    
    // 内部状態を更新
    setIsProcessingTasks(forceShowProgress);
    setProgressValue(displayProgress || 0);
    
  }, [tasks, activeTaskCount, overallProgress, hasActiveTasks, displayProgress, forceShowProgress, activeTasks.length]);
  
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
                    fontWeight: isProcessingTasks ? 'medium' : 'normal',
                    color: isProcessingTasks ? 'primary.main' : 'text.secondary',
                    whiteSpace: 'nowrap',
                    mr: 1.5
                  }}
                  onClick={onShowTaskDetails}
                  style={{ cursor: 'pointer' }}
                >
                  {isProcessingTasks
                    ? `処理中: ${activeTasks.length}件` 
                    : `タスク: ${tasks.length}件`
                  }
                </Typography>
                
                {/* 処理中のタスクがある場合のみプログレスバーを表示 */}
                {isProcessingTasks && (
                  <LinearProgress 
                    variant="determinate" 
                    value={progressValue} 
                    sx={{ 
                      flexGrow: 1, 
                      height: 4, 
                      borderRadius: 2,
                      maxWidth: 150,
                      backgroundColor: 'rgba(0, 0, 0, 0.08)'
                    }}
                  />
                )}
                
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
          
          {/* 中央：デュレーション */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center',
            justifyContent: 'center',
            flexGrow: 1
          }}>
            <Typography 
              variant="caption" 
              color="text.secondary"
              sx={{ 
                fontSize: '0.7rem', 
                fontWeight: 'medium'
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
