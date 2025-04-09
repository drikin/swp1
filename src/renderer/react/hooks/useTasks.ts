/**
 * タスク管理フック（コンテキストベース）
 */
import { useTasks as useTasksContext } from '../contexts/TaskContext';
import { TaskContextValue } from '../types/tasks';

/**
 * タスク管理のためのカスタムフック
 * コンテキストを使用した実装
 */
export const useTasks = (): TaskContextValue & Record<string, any> => {
  const tasksContext = useTasksContext();
  
  // コンテキストからすべての機能を提供
  return {
    ...tasksContext,
    
    // 互換性のためのエイリアス
    isTasksLoading: tasksContext.isLoading
  };
};
