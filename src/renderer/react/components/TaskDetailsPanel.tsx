import React from 'react';
import { 
  Box, Paper, Typography, List, Divider, 
  Slide, IconButton, Tooltip
} from '@mui/material';
import { Close, ExpandLess } from '@mui/icons-material';
import { useTasks } from '../hooks';
import TaskItem from './TaskItem';

interface TaskDetailsPanelProps {
  open: boolean;
  onClose: () => void;
}

/**
 * タスク詳細パネルコンポーネント - タスクの詳細情報を表示
 */
const TaskDetailsPanel: React.FC<TaskDetailsPanelProps> = ({ open, onClose }) => {
  // タスク情報をコンテキストから取得
  const { tasks = [], getActiveTasks, isTaskActive } = useTasks();
  
  // 標準化されたAPIを使用してアクティブなタスクを取得
  const activeTasks = getActiveTasks();
  
  // アクティブなタスク数
  const activeTaskCount = activeTasks.length;
  
  // 完了したタスク数
  const completedCount = tasks.filter(task => task.status === 'completed').length;
  
  // エラーが発生したタスク数
  const errorCount = tasks.filter(task => task.status === 'error').length;
  
  return (
    <Slide direction="up" in={open} mountOnEnter unmountOnExit>
      <Paper 
        elevation={4} 
        sx={{ 
          position: 'fixed', 
          bottom: 36,  // フッターの高さ分だけ上に配置
          left: '10%',  // 左右のマージンを設定
          right: '10%',
          maxWidth: '1000px', 
          mx: 'auto',  // 中央揃え
          maxHeight: '60vh',
          overflowY: 'auto',
          borderRadius: '12px 12px 0 0',
          zIndex: 999
        }}
      >
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          p: 1.5, 
          pb: 1,
          borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
          position: 'sticky',
          top: 0,
          bgcolor: 'background.paper',
          zIndex: 2
        }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
              タスク管理
            </Typography>
            <Box 
              component="div" 
              sx={{
                display: 'flex',
                mt: 0.5,
                gap: 2
              }}
            >
              <Typography 
                variant="caption" 
                color={completedCount > 0 ? 'success.main' : 'text.secondary'}
              >
                完了: {completedCount}
              </Typography>
              <Typography 
                variant="caption" 
                color={activeTaskCount > 0 ? 'primary.main' : 'text.secondary'}
                sx={{ fontWeight: activeTaskCount > 0 ? 'medium' : 'normal' }}
              >
                処理中: {activeTaskCount}
              </Typography>
              <Typography 
                variant="caption" 
                color={errorCount > 0 ? 'error.main' : 'text.secondary'}
              >
                エラー: {errorCount}
              </Typography>
            </Box>
          </Box>
        </Box>
        
        <List sx={{ p: 0 }}>
          {tasks.length > 0 ? (
            tasks.map(task => (
              <React.Fragment key={task.id}>
                <TaskItem task={task} />
                <Divider variant="inset" component="li" sx={{ ml: 1 }} />
              </React.Fragment>
            ))
          ) : (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                実行中のタスクはありません
              </Typography>
            </Box>
          )}
        </List>
      </Paper>
    </Slide>
  );
};

export default TaskDetailsPanel;
