import React from 'react';
import { 
  ListItem, ListItemText, Typography, Box,
  LinearProgress, Chip, IconButton, Tooltip,
  ListItemIcon, Paper
} from '@mui/material';
import { 
  Cancel, Refresh, AudioFile, Movie,
  ImageAspectRatio, Save, BarChart 
} from '@mui/icons-material';
import { useTasks } from '../hooks';
import { Task as TaskInfo } from '../types/tasks';

// タスク種類の日本語表示
const taskTypeLabels: Record<string, string> = {
  waveform: '波形生成',
  loudness: 'ラウドネス解析',
  thumbnail: 'サムネイル生成',
  encode: 'エンコード',
  export: '書き出し'
};

// タスクタイプのアイコン
const taskTypeIcons: Record<string, React.ReactElement> = {
  waveform: <AudioFile fontSize="small" color="info" />,
  loudness: <BarChart fontSize="small" color="info" />,
  thumbnail: <ImageAspectRatio fontSize="small" color="success" />,
  encode: <Movie fontSize="small" color="primary" />,
  export: <Save fontSize="small" color="secondary" />
};

// ステータスの日本語表示と色
const statusConfig: Record<string, { label: string, color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' }> = {
  pending: { label: '準備中', color: 'default' },
  processing: { label: '処理中', color: 'primary' },
  completed: { label: '完了', color: 'success' },
  error: { label: 'エラー', color: 'error' },
  cancelled: { label: 'キャンセル', color: 'warning' }
};

interface TaskItemProps {
  task: TaskInfo;
}

/**
 * タスク項目コンポーネント - 個別タスクの情報と操作ボタンを表示
 */
const TaskItem: React.FC<TaskItemProps> = ({ task }) => {
  // タスクキャンセル関数をコンテキストから取得
  const { cancelTask } = useTasks();
  
  // デバッグ用：タスクデータをコンソールに出力
  console.log(`タスクデータ確認 [ID: ${task.id}]`, {
    status: task.status,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    endTime: task.data?.endTime,
    endTimeFromData: task.data?.endTime ? new Date(task.data.endTime).toISOString() : '未設定',
    dataKeys: task.data ? Object.keys(task.data) : 'データなし'
  });
  
  // 経過時間の表示（タスク状態に関わらず一貫した表示にする）
  const getDuration = () => {
    // タスクが存在しない場合のエラーハンドリング
    if (!task) {
      return '00:00';
    }
    
    // 完了したタスクの場合の処理
    if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'error') {
      // completedAtとcreatedAtの両方がある場合：実際の経過時間を計算
      if (task.completedAt && task.createdAt) {
        const start = new Date(task.createdAt).getTime();
        const end = new Date(task.completedAt).getTime();
        
        if (!isNaN(start) && !isNaN(end) && end >= start) {
          const durationMs = end - start;
          return formatDuration(durationMs);
        }
      }
      
      // 時間データが不完全な場合は未計測と表示
      return '未計測';
    }
    
    // 進行中のタスクの場合の処理
    if (task.createdAt) {
      const start = new Date(task.createdAt).getTime();
      if (!isNaN(start)) {
        const end = Date.now();
        const durationMs = end - start;
        return formatDuration(durationMs);
      }
    }
    
    // それ以外のケース：未計測と表示
    return '未計測';
  };
  
  // 経過時間のフォーマット用ヘルパー関数
  const formatDuration = (durationMs: number) => {
    // 秒数または分:秒形式で表示
    if (durationMs < 60000) {
      // 秒数表示の場合、小数点第一位まで表示
      const seconds = durationMs / 1000;
      return `${seconds.toFixed(1)}秒`;
    } else {
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  };
  
  // タスクキャンセル処理
  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation(); // 親要素へのイベント伝播を防止
    try {
      const result = await cancelTask(task.id);
      if (!result) {
        console.error('タスクのキャンセルに失敗しました');
      }
    } catch (error) {
      console.error('タスクキャンセルエラー:', error);
    }
  };
  
  // 再試行処理
  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation(); // 親要素へのイベント伝播を防止
    console.log('タスク再試行:', task.id);
    // 再試行処理の実装（現在は未実装）
  };
  
  const status = statusConfig[task.status] || statusConfig.pending;
  const isActive = task.status === 'pending' || task.status === 'processing';
  const showProgress = isActive && task.progress > 0;
  
  // タスクアイコンを取得
  const getTaskIcon = () => {
    if (task.type in taskTypeIcons) {
      return taskTypeIcons[task.type];
    }
    return <Movie fontSize="small" />; // デフォルトアイコン
  };
  
  return (
    <ListItem
      alignItems="flex-start"
      sx={{ 
        p: 1.5,
        '&:hover': {
          backgroundColor: 'rgba(0, 0, 0, 0.03)',
        }
      }}
    >
      <ListItemIcon sx={{ minWidth: 40 }}>
        {getTaskIcon()}
      </ListItemIcon>
      
      <ListItemText
        primary={
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
            <Typography 
              component="span" 
              variant="body2" 
              sx={{ 
                fontWeight: isActive ? 'medium' : 'normal',
                color: isActive ? 'text.primary' : 'text.secondary'
              }}
            >
              {taskTypeLabels[task.type] || task.type}
              {task.data && task.data.fileName && (
                <Typography 
                  component="span" 
                  variant="caption" 
                  sx={{ ml: 1, color: 'text.secondary', fontStyle: 'italic' }}
                >
                  {task.data.fileName}
                </Typography>
              )}
            </Typography>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip 
                label={status.label} 
                color={status.color} 
                size="small"
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
              
              <Typography 
                component="span" 
                variant="caption" 
                sx={{ 
                  whiteSpace: 'nowrap',
                  minWidth: 45,
                  textAlign: 'right'
                }}
              >
                {getDuration()}
              </Typography>
              
              {isActive && (
                <Tooltip title="キャンセル">
                  <IconButton 
                    onClick={handleCancel} 
                    size="small" 
                    sx={{ p: 0.5 }}
                    color="default"
                  >
                    <Cancel fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              
              {task.status === 'error' && (
                <Tooltip title="再試行">
                  <IconButton 
                    onClick={handleRetry} 
                    size="small" 
                    sx={{ p: 0.5 }}
                    color="primary"
                  >
                    <Refresh fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Box>
        }
        secondary={
          <Box component="div">
            {showProgress && (
              <Box sx={{ mt: 1, mb: 1 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={task.progress} 
                  sx={{ 
                    height: 4, 
                    borderRadius: 2,
                    mb: 0.5
                  }}
                />
                <Typography component="div" variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right' }}>
                  {task.progress.toFixed(0)}%
                </Typography>
              </Box>
            )}
            
            {task.error && (
              <Paper 
                variant="outlined" 
                sx={{ 
                  p: 1, 
                  mt: 1, 
                  borderColor: 'error.light',
                  bgcolor: 'rgba(244, 67, 54, 0.05)', 
                  borderRadius: 1
                }}
              >
                <Typography component="div" variant="caption" color="error.main" sx={{ display: 'block' }}>
                  エラー: {task.error}
                </Typography>
              </Paper>
            )}
            
            {task.data && task.data.details && !task.error && (
              <Typography 
                component="div"
                variant="caption" 
                color="text.secondary" 
                sx={{ 
                  display: 'block', 
                  mt: 0.5,
                  fontSize: '0.7rem',
                  wordBreak: 'break-word'
                }}
              >
                {task.data.details}
              </Typography>
            )}
          </Box>
        }
      />
    </ListItem>
  );
};

export default TaskItem;
