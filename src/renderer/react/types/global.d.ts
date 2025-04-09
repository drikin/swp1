// タスクの状態型定義
type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'error' | 'cancelled';

// タスクの型定義
interface Task {
  id: string;
  type: string;
  status: TaskStatus;
  progress: number;
  error?: string | null;
  createdAt: string;
  completedAt?: string | null;
  data?: any;
}

// タスク結果の型定義
interface TaskResult {
  taskId: string;
  status: TaskStatus;
  progress: number;
  data?: any;
  error?: string;
}

// 波形データレスポンスの型定義
interface WaveformDataResponse {
  success?: boolean;
  data?: {
    waveform?: number[];
  } | number[];
  waveform?: number[];
  taskId?: string;
}

// サムネイル生成パラメータの型定義
interface ThumbnailGenerateParams {
  path: string;
  timePosition?: number;
  width?: number;
  height?: number;
}

// NodeCrypto API型定義
interface NodeCryptoAPI {
  // UUID生成関数
  generateUUID: () => string;
}

interface Window {
  // 既存のAPI
  api: {
    // 基本API
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    on: (channel: string, callback: (...args: any[]) => void) => void;
    off: (channel: string, callback: (...args: any[]) => void) => void;
    send: (channel: string, ...args: any[]) => void;
    
    // メディア解析関連
    checkFFmpeg: () => Promise<any>;
    getMediaInfo: (filePath: string) => Promise<any>;
    generateWaveform: (filePath: string, outputPath?: string) => Promise<{
      success: boolean;
      taskId?: string;
      error?: string;
    }>;
    generateThumbnail: (options: ThumbnailGenerateParams) => Promise<{
      success: boolean;
      taskId?: string;
      error?: string;
    }>;
    exportCombinedVideo: (options: any) => Promise<any>;
    measureLoudness: (
      pathOrOptions: string | { 
        filePath: string; 
        fileId?: string 
      },
      fileId?: string
    ) => Promise<any>;
    
    // タスク関連
    getFFmpegTaskStatus: (taskId: string) => Promise<any>;
    cancelFFmpegTask: (taskId: string) => Promise<any>;
    getTaskStatus: (taskId: string) => Promise<{
      id: string;
      status: TaskStatus;
      progress: number;
      type: string;
      error?: string;
    }>;
    getTaskResult: (taskId: string) => Promise<TaskResult | null>;
    getTaskList: () => Promise<{ tasks: Task[] }>;
    cancelTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
    getTaskIdByMediaPath: (mediaPath: string, taskType: string) => Promise<{
      success: boolean;
      taskId?: string;
      error?: string;
    }>;
    getWaveformData: (taskId: string) => Promise<WaveformDataResponse | null>;
    
    // イベント関連
    onTasksUpdated: (callback: (data: { tasks: Task[] }) => void) => void;
    removeTasksUpdatedListener: (callback: (data: { tasks: Task[] }) => void) => void;
    
    // ファイル関連
    openFileDialog: (options?: any) => Promise<string[]>;
    openDirectoryDialog: () => Promise<string>;
    getDesktopPath: () => Promise<string>;
  };
  
  // バージョン情報
  versions: {
    node: () => string;
    chrome: () => string;
    electron: () => string;
  };
  
  // NodeCrypto API
  nodeCrypto: NodeCryptoAPI;
}
