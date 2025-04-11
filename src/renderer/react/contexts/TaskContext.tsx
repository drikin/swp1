import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Task, TaskStatus, TaskResult, TaskContextValue } from '../types/tasks';
import Logger from '../utils/logger';

/**
 * タスク管理コンテキストのデフォルト値
 */
const defaultTaskContextValue: TaskContextValue = {
  // 状態
  tasks: [],
  isLoading: false,
  error: null,
  taskStatus: {},
  activeTaskCount: 0, // 追加：アクティブなタスク数の初期値
  overallProgress: 0, // 追加：全体の進捗状況の初期値
  
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
  const [activeTaskCount, setActiveTaskCount] = useState(0); // 追加：アクティブなタスク数のステート
  const [overallProgress, setOverallProgress] = useState(0); // 追加：全体の進捗状況のステート

  /**
   * タスク一覧の取得
   */
  const fetchTasks = useCallback(async () => {
    if (!window.api || !window.api.getTaskList) {
      Logger.error('TaskContext', 'タスク一覧取得APIが利用できません');
      return [];
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await window.api.getTaskList();
      if (response && response.tasks) {
        // 型変換を明示的に行う
        const typedTasks = response.tasks.map((task: any): Task => {
          // 開始時間の処理 - createdAtがなければstartTimeを使用
          const createdAt = task.createdAt || (task.startTime ? new Date(task.startTime).toISOString() : null);
          
          // 完了時間の処理
          let completedAt = null;
          if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'error') {
            // 優先順位: completedAt > data.endTime > endTime
            if (task.completedAt) {
              completedAt = task.completedAt;
            } else if (task.data?.endTime) {
              completedAt = new Date(task.data.endTime).toISOString();
            } else if (task.endTime) {
              completedAt = new Date(task.endTime).toISOString();
            }
            
            // デバッグログ - 時間情報の確認
            console.log(`タスク時間データ[${task.id}]:`, {
              completedAt,
              originalCompletedAt: task.completedAt,
              dataEndTime: task.data?.endTime,
              endTime: task.endTime
            });
          }
          
          // completedAtが設定されていれば、対応するendTimeも設定（これにより一貫性を確保）
          let taskData = task.data || {};
          if (completedAt && !taskData.endTime) {
            taskData = {
              ...taskData,
              endTime: new Date(completedAt).getTime()
            };
          }
          
          return {
            id: task.id,
            type: task.type,
            status: task.status as TaskStatus,
            progress: task.progress,
            error: task.error,
            createdAt: createdAt,
            completedAt: completedAt,
            data: taskData
          };
        });
        
        // タスクステータスマップを更新
        const statusMap: Record<string, TaskStatus> = {};
        typedTasks.forEach(task => {
          statusMap[task.id] = task.status;
        });
        setTaskStatus(statusMap);
        
        // アクティブなタスク数と全体の進捗状況を更新
        const activeCount = typedTasks.filter(task => task.status === 'running' || task.status === 'pending').length;
        const overallProgressValue = typedTasks.reduce((acc, task) => acc + task.progress, 0) / typedTasks.length;
        setActiveTaskCount(activeCount);
        setOverallProgress(overallProgressValue);
        
        setTasks(typedTasks);
        setIsLoading(false);
        Logger.debug('TaskContext', 'タスク一覧を取得しました', {
          count: typedTasks.length
        });
        return typedTasks;
      } else {
        Logger.error('TaskContext', 'タスク一覧の取得に失敗しました');
        setError('タスク一覧の取得に失敗しました');
        setIsLoading(false);
        return [];
      }
    } catch (error) {
      Logger.error('TaskContext', 'タスク一覧取得エラー:', error);
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
      Logger.error('TaskContext', 'タスクステータス取得APIが利用できません');
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
      Logger.error('TaskContext', `タスクステータス取得エラー (ID: ${taskId}):`, error);
      return null;
    }
  }, []);

  /**
   * タスク結果の取得
   */
  const getTaskResult = useCallback(async (taskId: string): Promise<TaskResult | null> => {
    if (!window.api || !window.api.getTaskResult) {
      Logger.error('TaskContext', 'タスク結果取得APIが利用できません');
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
      Logger.error('TaskContext', `タスク結果取得エラー (ID: ${taskId}):`, error);
      setError('タスク結果の取得中にエラーが発生しました');
      return null;
    }
  }, []);

  /**
   * タスクのキャンセル
   */
  const cancelTask = useCallback(async (taskId: string): Promise<boolean> => {
    if (!window.api || !window.api.cancelTask) {
      Logger.error('TaskContext', 'タスクキャンセルAPIが利用できません');
      return false;
    }

    try {
      const result = await window.api.cancelTask(taskId);
      
      if (result && result.success) {
        Logger.info('TaskContext', 'タスクキャンセル成功', { taskId });
        // タスクステータスマップを更新
        setTaskStatus(prev => ({
          ...prev,
          [taskId]: 'cancelled' as TaskStatus
        }));
        
        // タスク一覧を更新
        fetchTasks();
        return true;
      } else {
        Logger.error('TaskContext', 'タスクキャンセル失敗', {
          taskId,
          error: result?.error || '不明なエラー'
        });
        setError('タスクのキャンセルに失敗しました');
        return false;
      }
    } catch (error) {
      Logger.error('TaskContext', `タスクキャンセルエラー (ID: ${taskId}):`, error);
      setError('タスクのキャンセル中にエラーが発生しました');
      return false;
    }
  }, [fetchTasks]);

  /**
   * タスク状態の監視
   * 指定されたタスクが完了するまで定期的にステータスをチェック
   * コールバック形式とPromise形式の両方をサポート
   */
  const monitorTaskStatus = useCallback(async (
    taskId: string,
    onComplete?: (result: TaskResult | null) => void,
    onError?: (error: string) => void
  ) => {
    if (!window.api || !window.api.getTaskStatus) {
      const errorMsg = 'タスクステータス取得APIが利用できません';
      if (onError) onError(errorMsg);
      return Promise.reject(new Error(errorMsg));
    }

    let completed = false;
    let attempts = 0;
    const maxAttempts = 100; // 最大試行回数
    const interval = 500; // ポーリング間隔（ミリ秒）
    
    // コールバック形式とPromise形式の両方をサポート
    if (!onComplete && !onError) {
      // Promise形式が使用された場合
      return new Promise<TaskResult | null>((resolve, reject) => {
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
                const result = await getTaskResult(taskId);
                resolve(result);
                return;
              } else if (status.status === 'failed' || status.status === 'error' || status.status === 'cancelled') {
                completed = true;
                reject(new Error(status.error || 'タスクが失敗またはキャンセルされました'));
                return;
              }
            }

            attempts++;
            if (attempts >= maxAttempts) {
              reject(new Error('タスクのモニタリングがタイムアウトしました'));
              return;
            }

            if (!completed) {
              setTimeout(checkStatus, interval);
            }
          } catch (error) {
            Logger.error('TaskContext', `タスクステータス監視エラー (ID: ${taskId}):`, error);
            reject(new Error('タスクステータスの監視中にエラーが発生しました'));
          }
        };

        checkStatus();
      });
    } else {
      // コールバック形式が使用された場合
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
          Logger.error('TaskContext', `タスクステータス監視エラー (ID: ${taskId}):`, error);
          if (onError) onError('タスクステータスの監視中にエラーが発生しました');
        }
      };

      checkStatus();
      return Promise.resolve(null);
    }
  }, [getTaskResult]);

  /**
   * タスク更新イベントのリスナー
   */
  useEffect(() => {
    if (!window.api) return;

    const handleTasksUpdated = (data: { tasks: any[] }) => {
      if (data && Array.isArray(data.tasks)) {
        // 型変換を明示的に行う
        const typedTasks = data.tasks.map((task: any): Task => {
          // 開始時間の処理 - createdAtがなければstartTimeを使用
          const createdAt = task.createdAt || (task.startTime ? new Date(task.startTime).toISOString() : null);
          
          // 完了時間の処理
          let completedAt = null;
          if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'error') {
            // 優先順位: completedAt > data.endTime > endTime
            if (task.completedAt) {
              completedAt = task.completedAt;
            } else if (task.data?.endTime) {
              completedAt = new Date(task.data.endTime).toISOString();
            } else if (task.endTime) {
              completedAt = new Date(task.endTime).toISOString();
            }
            
            // デバッグログ - 時間情報の確認
            console.log(`タスク時間データ[${task.id}]:`, {
              completedAt,
              originalCompletedAt: task.completedAt,
              dataEndTime: task.data?.endTime,
              endTime: task.endTime
            });
          }
          
          // completedAtが設定されていれば、対応するendTimeも設定（これにより一貫性を確保）
          let taskData = task.data || {};
          if (completedAt && !taskData.endTime) {
            taskData = {
              ...taskData,
              endTime: new Date(completedAt).getTime()
            };
          }
          
          return {
            id: task.id,
            type: task.type,
            status: task.status as TaskStatus,
            progress: task.progress,
            error: task.error,
            createdAt: createdAt,
            completedAt: completedAt,
            data: taskData
          };
        });
        
        // タスクステータスマップも更新
        const statusMap: Record<string, TaskStatus> = {};
        typedTasks.forEach(task => {
          statusMap[task.id] = task.status;
        });
        setTaskStatus(statusMap);
        
        // アクティブなタスク数と全体の進捗状況を更新
        const activeCount = typedTasks.filter(task => task.status === 'running' || task.status === 'pending').length;
        const overallProgressValue = typedTasks.reduce((acc, task) => acc + task.progress, 0) / typedTasks.length;
        setActiveTaskCount(activeCount);
        setOverallProgress(overallProgressValue);
        
        setTasks(typedTasks);
        Logger.debug('TaskContext', 'タスク一覧が更新されました', {
          count: typedTasks.length
        });
      }
    };

    // イベントリスナーの登録
    if (!window.api || !window.api.onTasksUpdated) {
      Logger.warn('TaskContext', 'タスク更新イベントリスナーを設定できません');
      return;
    }
    
    Logger.info('TaskContext', 'タスク更新イベントリスナーを設定します');
    window.api.onTasksUpdated(handleTasksUpdated);

    // 初回のタスク一覧取得
    fetchTasks();

    // クリーンアップ関数
    return () => {
      if (window.api && window.api.removeTasksUpdatedListener) {
        Logger.info('TaskContext', 'タスク更新イベントリスナーを解除します');
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
    activeTaskCount,
    overallProgress,
    
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
