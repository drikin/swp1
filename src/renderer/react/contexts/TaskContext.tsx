import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Task, TaskStatus, TaskResult, TaskContextValue } from '../types/tasks';

/**
 * タスク管理コンテキストのデフォルト値
 */
const defaultTaskContextValue: TaskContextValue = {
  // 状態
  tasks: [],
  isLoading: false,
  error: null,
  taskStatus: {},
  
  // アクション
  fetchTasks: async () => [],
  fetchTaskStatus: async () => null,
  getTaskResult: async () => null,
  cancelTask: async () => false,
  monitorTaskStatus: () => {}
};

// コンテキスト作成
export const TaskContext = createContext<TaskContextValue>(defaultTaskContextValue);

/**
 * タスク管理プロバイダーコンポーネント
 * アプリケーション全体でタスク管理機能を提供します
 */
export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<Record<string, TaskStatus>>({});

  /**
   * タスク一覧の取得
   */
  const fetchTasks = useCallback(async () => {
    if (!window.api || !window.api.getTaskList) {
      setError('タスク一覧取得APIが利用できません');
      return [];
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await window.api.getTaskList();
      if (response && response.tasks) {
        // 型変換を明示的に行う
        const typedTasks = response.tasks.map((task: any): Task => ({
          id: task.id,
          type: task.type,
          status: task.status as TaskStatus,
          progress: task.progress,
          error: task.error,
          createdAt: task.createdAt,
          completedAt: task.completedAt,
          data: task.data
        }));
        
        // タスクステータスマップを更新
        const statusMap: Record<string, TaskStatus> = {};
        typedTasks.forEach(task => {
          statusMap[task.id] = task.status;
        });
        setTaskStatus(statusMap);
        
        setTasks(typedTasks);
        setIsLoading(false);
        return typedTasks;
      } else {
        console.error('タスク一覧の取得に失敗:', response);
        setError('タスク一覧の取得に失敗しました');
        setIsLoading(false);
        return [];
      }
    } catch (error) {
      console.error('タスク一覧取得エラー:', error);
      setError('タスク一覧の取得中にエラーが発生しました');
      setIsLoading(false);
      return [];
    }
  }, []);

  /**
   * 特定のタスクのステータスを取得
   */
  const fetchTaskStatus = useCallback(async (taskId: string) => {
    if (!window.api || !window.api.getTaskStatus) {
      setError('タスクステータス取得APIが利用できません');
      return null;
    }

    try {
      const status = await window.api.getTaskStatus(taskId);
      if (status) {
        // タスクステータスマップを更新
        setTaskStatus(prev => ({
          ...prev,
          [taskId]: status.status as TaskStatus
        }));
        return status.status as TaskStatus;
      }
      return null;
    } catch (error) {
      console.error(`タスクステータス取得エラー (ID: ${taskId}):`, error);
      return null;
    }
  }, []);

  /**
   * タスク結果の取得
   */
  const getTaskResult = useCallback(async (taskId: string): Promise<TaskResult | null> => {
    if (!window.api || !window.api.getTaskResult) {
      setError('タスク結果取得APIが利用できません');
      return null;
    }

    try {
      const result = await window.api.getTaskResult(taskId);
      // タスクの完了状態を確認してステータスマップを更新
      if (result && result.status) {
        setTaskStatus(prev => ({
          ...prev,
          [taskId]: result.status as TaskStatus
        }));
      }
      return result;
    } catch (error) {
      console.error(`タスク結果取得エラー (ID: ${taskId}):`, error);
      setError('タスク結果の取得中にエラーが発生しました');
      return null;
    }
  }, []);

  /**
   * タスクのキャンセル
   */
  const cancelTask = useCallback(async (taskId: string): Promise<boolean> => {
    if (!window.api || !window.api.cancelTask) {
      setError('タスクキャンセルAPIが利用できません');
      return false;
    }

    try {
      const result = await window.api.cancelTask(taskId);
      
      if (result && result.success) {
        console.log(`タスクキャンセル成功 (ID: ${taskId})`);
        // タスクステータスマップを更新
        setTaskStatus(prev => ({
          ...prev,
          [taskId]: 'cancelled' as TaskStatus
        }));
        
        // タスク一覧を更新
        fetchTasks();
        return true;
      } else {
        console.error('タスクのキャンセルに失敗:', result);
        setError('タスクのキャンセルに失敗しました');
        return false;
      }
    } catch (error) {
      console.error(`タスクキャンセルエラー (ID: ${taskId}):`, error);
      setError('タスクのキャンセル中にエラーが発生しました');
      return false;
    }
  }, [fetchTasks]);

  /**
   * タスクのステータス監視
   */
  const monitorTaskStatus = useCallback((
    taskId: string, 
    onComplete?: (result: any) => void, 
    onError?: (error: string) => void
  ) => {
    if (!window.api || !window.api.getTaskStatus) {
      if (onError) onError('タスクステータス取得APIが利用できません');
      return;
    }

    let completed = false;
    let attempts = 0;
    const maxAttempts = 100; // 最大試行回数
    const interval = 500; // ポーリング間隔（ミリ秒）

    const checkStatus = async () => {
      try {
        const status = await window.api.getTaskStatus(taskId);
        
        if (status) {
          // タスクステータスマップを更新
          setTaskStatus(prev => ({
            ...prev,
            [taskId]: status.status as TaskStatus
          }));
          
          if (status.status === 'completed') {
            completed = true;
            if (onComplete) {
              const result = await getTaskResult(taskId);
              onComplete(result);
            }
            return;
          } else if (status.status === 'failed' || status.status === 'error' || status.status === 'cancelled') {
            completed = true;
            if (onError) onError(status.error || 'タスクが失敗またはキャンセルされました');
            return;
          }
        }

        attempts++;
        if (attempts >= maxAttempts) {
          if (onError) onError('タスクのモニタリングがタイムアウトしました');
          return;
        }

        if (!completed) {
          setTimeout(checkStatus, interval);
        }
      } catch (error) {
        console.error(`タスクステータス監視エラー (ID: ${taskId}):`, error);
        if (onError) onError('タスクステータスの監視中にエラーが発生しました');
      }
    };

    checkStatus();
  }, [getTaskResult]);

  /**
   * タスク更新イベントのリスナー
   */
  useEffect(() => {
    if (!window.api) return;

    const handleTasksUpdated = (data: { tasks: any[] }) => {
      if (data && Array.isArray(data.tasks)) {
        // 型変換を明示的に行う
        const typedTasks = data.tasks.map((task: any): Task => ({
          id: task.id,
          type: task.type,
          status: task.status as TaskStatus,
          progress: task.progress,
          error: task.error,
          createdAt: task.createdAt,
          completedAt: task.completedAt,
          data: task.data
        }));
        
        // タスクステータスマップも更新
        const statusMap: Record<string, TaskStatus> = {};
        typedTasks.forEach(task => {
          statusMap[task.id] = task.status;
        });
        setTaskStatus(statusMap);
        
        setTasks(typedTasks);
      }
    };

    // イベントリスナーの登録
    window.api.onTasksUpdated(handleTasksUpdated);

    // 初回のタスク一覧取得
    fetchTasks();

    // クリーンアップ関数
    return () => {
      if (window.api && window.api.removeTasksUpdatedListener) {
        window.api.removeTasksUpdatedListener(handleTasksUpdated);
      }
    };
  }, [fetchTasks]);

  // コンテキスト値の構築
  const contextValue: TaskContextValue = {
    // 状態
    tasks,
    isLoading,
    error,
    taskStatus,
    
    // アクション
    fetchTasks,
    fetchTaskStatus,
    getTaskResult,
    cancelTask,
    monitorTaskStatus
  };

  return (
    <TaskContext.Provider value={contextValue}>
      {children}
    </TaskContext.Provider>
  );
};

/**
 * タスクコンテキストを使用するためのフック
 */
export const useTasks = () => useContext(TaskContext);
