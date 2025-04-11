/**
 * タスク管理に関連する型定義
 */

// タスクの状態
export type TaskStatus = 'pending' | 'processing' | 'running' | 'completed' | 'failed' | 'error' | 'cancelled';

// タスクの基本構造
export interface Task {
  id: string;
  type: string;
  status: TaskStatus;
  progress: number;
  error?: string | null;
  createdAt: string;
  completedAt?: string | null;
  data?: any;
}

// タスク結果
export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  progress: number;
  data?: any;
  error?: string;
}

// タスク管理API
export interface TaskManagerAPI {
  getTasks: () => Promise<{
    tasks: Task[];
    activeTaskCount: number;
    overallProgress: number;
  }>;
  cancelTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
  onTasksUpdated: (callback: (data: { tasks: Task[] }) => void) => () => void;
}

// タスクコンテキストの状態
export interface TaskContextState {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  taskStatus: Record<string, TaskStatus>;
  activeTaskCount: number; // 追加：アクティブなタスク数
  overallProgress: number; // 追加：全体の進捗状況
}

// タスクコンテキストのアクション
export interface TaskContextActions {
  fetchTasks: () => Promise<Task[]>;
  fetchTaskStatus: (taskId: string) => Promise<TaskStatus | null>;
  getTaskResult: (taskId: string) => Promise<TaskResult | null>;
  cancelTask: (taskId: string) => Promise<boolean>;
  monitorTaskStatus: (
    taskId: string, 
    onComplete?: (result: TaskResult | null) => void, 
    onError?: (error: string) => void
  ) => Promise<TaskResult | null> | void;
}

// タスクコンテキストのヘルパー関数
export interface TaskContextHelpers {
  // タスクが処理中かどうかを判断する関数
  isTaskActive: (task: Task) => boolean;
  // 処理中のタスク一覧を取得する関数
  getActiveTasks: () => Task[];
  // 特定のタスクの進捗を取得する関数
  getTaskProgress: (taskId: string) => number;
}

// タスクコンテキストの最終型
export interface TaskContextValue extends TaskContextState, TaskContextActions, TaskContextHelpers {}

// タスクAPIレスポンス型（electron.d.ts と互換性を持たせるための型）
export interface TaskStatusResponse {
  id: string;
  status: TaskStatus;
  progress: number;
  type: string;
  error?: string;
}
