interface TaskManagerAPI {
  getTasks: () => Promise<{
    tasks: any[];
    activeTaskCount: number;
    overallProgress: number;
  }>;
  cancelTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
  onTasksUpdated: (callback: (data: any) => void) => () => void;
}

interface Window {
  // 既存のAPI
  api: {
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    on: (channel: string, callback: (...args: any[]) => void) => () => void;
    off: (channel: string, callback: (...args: any[]) => void) => boolean;
    send: (channel: string, ...args: any[]) => void;
    
    // メディア解析関連
    checkFFmpeg: () => Promise<any>;
    getMediaInfo: (filePath: string) => Promise<any>;
    generateWaveform: (filePath: string) => Promise<{ taskId: string }>;
    generateThumbnail: (pathOrOptions: any, fileId?: string) => Promise<any>;
    exportCombinedVideo: (options: any) => Promise<any>;
    measureLoudness: (filePath: string) => Promise<any>;
    
    // タスク関連
    getFFmpegTaskStatus: (taskId: string) => Promise<any>;
    cancelFFmpegTask: (taskId: string) => Promise<any>;
    getTaskStatus: (taskId: string) => Promise<{
      id: string;
      status: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
      progress: number;
      type: string;
      // その他のプロパティ
    }>;
    getTaskIdByMediaPath: (mediaPath: string, taskType: string) => Promise<string | null>;
    getWaveformData: (taskId: string) => Promise<{
      data: number[];
      taskId: string;
      // その他のプロパティ
    } | null>;
    
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
  
  // タスク管理API
  taskManager: TaskManagerAPI;
}
