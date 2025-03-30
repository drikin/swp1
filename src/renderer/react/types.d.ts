interface Window {
  api: {
    // FFmpeg関連
    checkFFmpeg: () => Promise<{ available: boolean, version?: string, path?: string }>;
    getMediaInfo: (filePath: string) => Promise<any>;
    generateWaveform: (filePath: string, outputPath?: string | null) => Promise<any>;
    exportCombinedVideo: (options: {
      mediaFiles: any[];
      outputPath: string;
      settings: {
        resolution: string;
        fps: string;
        codec: string;
        format: string;
      }
    }) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
    
    // ファイル操作関連
    openFileDialog: (fileTypes: string[]) => Promise<any[]>;
    openDirectoryDialog: () => Promise<string>;
    
    // 通信関連
    on: (channel: string, callback: (...args: any[]) => void) => void;
    off: (channel: string, callback: (...args: any[]) => void) => void;
  };
}

interface MediaFile {
  id: string;
  name: string;
  path: string;
  type: string;
  size: number;
  duration?: number;
  thumbnail?: string;
}

interface TimelineItem {
  id: string;
  mediaId: string;
  startTime: number;
  endTime: number;
  trackId: number;
} 