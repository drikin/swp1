import React, { createContext, useContext, useState, useEffect } from 'react';

// タスクタイプの定義
export type TaskType = 'waveform' | 'loudness' | 'thumbnail' | 'encode' | 'export';

// タスク状態の定義
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';

// タスク情報の構造
export interface TaskInfo {
  id: string;               // タスクの一意のID
  type: TaskType;           // タスクの種類
  status: TaskStatus;       // 現在の状態
  progress: number;         // 進捗率（0-100）
  fileId?: string;          // 関連するファイルID（該当する場合）
  fileName?: string;        // ファイル名（表示用）
  startTime: number;        // 開始時間（タイムスタンプ）
  endTime?: number;         // 終了時間（タイムスタンプ）
  error?: string;           // エラーメッセージ（エラー時）
  cancellable: boolean;     // キャンセル可能かどうか
  details?: string;         // 追加情報（オプション）
}

// タスク管理コンテキストの型定義
interface TaskContextType {
  tasks: TaskInfo[];
  activeTaskCount: number;
  overallProgress: number;
  cancelTask: (taskId: string) => Promise<{success: boolean, error?: string}>;
}

// デフォルト値でコンテキスト作成
const TaskContext = createContext<TaskContextType>({
  tasks: [],
  activeTaskCount: 0,
  overallProgress: 0,
  cancelTask: async () => ({ success: false, error: '未初期化' })
});

// タスク管理プロバイダーコンポーネント
export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // タスク状態を管理するステート
  const [tasksState, setTasksState] = useState<{
    tasks: TaskInfo[];
    activeTaskCount: number;
    overallProgress: number;
  }>({
    tasks: [],
    activeTaskCount: 0,
    overallProgress: 0
  });
  
  // タスク更新イベントの購読
  useEffect(() => {
    // window.taskManager API がなければエラーログを出力して終了
    if (!window.taskManager) {
      console.error('taskManager APIが見つかりません');
      return;
    }
    
    console.log('タスク管理システム: イベント購読を開始します');
    
    // タスク更新の購読
    const unsubscribe = window.taskManager.onTasksUpdated((data: any) => {
      console.log('タスク更新イベント受信:', data);
      setTasksState(data);
    });
    
    // コンポーネントのアンマウント時にイベント購読を解除
    return () => {
      if (unsubscribe) {
        console.log('タスク管理システム: イベント購読を解除します');
        unsubscribe();
      }
    };
  }, []);
  
  // タスクキャンセル処理
  const cancelTask = async (taskId: string) => {
    if (!window.taskManager) {
      console.error('taskManager APIが見つかりません');
      return { success: false, error: 'API未初期化' };
    }
    
    try {
      return await window.taskManager.cancelTask(taskId);
    } catch (error) {
      console.error('タスクキャンセルエラー:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '不明なエラー' 
      };
    }
  };
  
  // コンテキストプロバイダーを返す
  return (
    <TaskContext.Provider value={{...tasksState, cancelTask}}>
      {children}
    </TaskContext.Provider>
  );
};

// タスクコンテキストを使用するためのフック
export const useTasks = () => useContext(TaskContext);
