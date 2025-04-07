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
    checkFFmpeg: () => Promise<any>;
    getMediaInfo: (filePath: string) => Promise<any>;
    generateWaveform: (filePath: string, outputPath: string) => Promise<any>;
    generateThumbnail: (pathOrOptions: any, fileId?: string) => Promise<any>;
    exportCombinedVideo: (options: any) => Promise<any>;
    measureLoudness: (filePath: string) => Promise<any>;
    getFFmpegTaskStatus: (taskId: string) => Promise<any>;
    cancelFFmpegTask: (taskId: string) => Promise<any>;
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
