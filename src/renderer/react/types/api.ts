/**
 * API インターフェースの型定義
 */

import { Task, TaskStatus, TaskResult, TaskStatusResponse } from './tasks';
import { ThumbnailGenerateParams, WaveformDataResponse } from './media';

// Electron APIインターフェース
export interface ElectronAPI {
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
  generateThumbnail: (pathOrOptions: string | ThumbnailGenerateParams | { filePath: string; fileId?: string }, fileId?: string) => Promise<{
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
  getTaskStatus: (taskId: string) => Promise<TaskStatusResponse>;
  getTaskResult: (taskId: string) => Promise<TaskResult | null>;
  getTaskList: () => Promise<{ tasks: Task[] }>;
  cancelTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
  getTaskIdByMediaPath: (mediaPath: string, taskType: string) => Promise<{
    success: boolean;
    taskId?: string;
    error?: string;
  }>;
  getWaveformData: (taskId: string) => Promise<WaveformDataResponse | null>;
  
  // イベントリスナー
  onTasksUpdated: (callback: (data: { tasks: Task[] }) => void) => void;
  removeTasksUpdatedListener: (callback: (data: { tasks: Task[] }) => void) => void;
  
  // エクスポート進捗イベント
  onExportProgress: (callback: (data: {
    current: number;
    total: number;
    percentage: number;
    stage: 'converting' | 'combining';
  }) => void) => void;
  removeExportProgressListener: (callback: (data: {
    current: number;
    total: number;
    percentage: number;
    stage: 'converting' | 'combining';
  }) => void) => void;
  
  // ファイル関連
  openFileDialog: (options?: any) => Promise<string[]>;
  openDirectoryDialog: () => Promise<string>;
  getDesktopPath: () => Promise<string>;
}

// Electronでのファイル型拡張
export interface ElectronFile extends File {
  path: string;
}
