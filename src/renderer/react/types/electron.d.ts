/**
 * Electron IPCのための型定義
 * レンダラープロセスからメインプロセスへの通信インターフェースを定義
 */

import { Task, TaskStatus, TaskResult, TaskStatusResponse } from './tasks';
import { ThumbnailGenerateParams, WaveformDataResponse } from './media';

// API応答の基本形
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// タスク関連の型定義
interface TaskCreationResult {
  taskId: string;
  status: string;
}

// ファイル操作の型定義
interface FileDialogResult {
  canceled: boolean;
  filePaths: string[];
}

// ファイル/フォルダー選択の結果
interface FileOrDirectoryDialogResult {
  filePaths: string[];
  isDirectory: boolean;
}

// IPCレンダラーAPIの型定義
interface ElectronAPI {
  // 基本的なIPC通信
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (channel: string, callback: (...args: any[]) => void) => void;
  off: (channel: string, callback: (...args: any[]) => void) => void;
  once: (channel: string, callback: (...args: any[]) => void) => void;
  send: (channel: string, ...args: any[]) => void;
  
  // タスク関連API
  createTask: (type: string, params?: any) => Promise<TaskCreationResult>;
  getTaskStatus: (taskId: string) => Promise<TaskStatusResponse>;
  getTaskResult: (taskId: string) => Promise<TaskResult | null>;
  cancelTask: (taskId: string) => Promise<boolean>;
  getTaskList: () => Promise<{ tasks: Task[] }>;
  
  // イベントリスナー
  onTasksUpdated: (callback: (data: { tasks: Task[] }) => void) => void;
  removeTasksUpdatedListener: (callback: (data: { tasks: Task[] }) => void) => void;
  
  // ファイル操作API
  openFileDialog: (options?: any) => Promise<string[]>;
  openDirectoryDialog: () => Promise<string[]>;
  openFileOrDirectoryDialog: () => Promise<FileOrDirectoryDialogResult>;
  getDesktopPath: () => Promise<string>;
  
  // FFmpeg関連API
  checkFFmpeg: () => Promise<ApiResponse<{ version: string }>>;
  getFFmpegTaskStatus: (taskId: string) => Promise<any>;
  cancelFFmpegTask: (taskId: string) => Promise<any>;
  
  // メディア関連API
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
  getMediaInfo: (filePath: string) => Promise<any>;
  exportCombinedVideo: (options: any) => Promise<any>;
  getTaskIdByMediaPath: (mediaPath: string, taskType: string) => Promise<{
    success: boolean;
    taskId?: string;
    error?: string;
  }>;
  getWaveformData: (taskId: string) => Promise<WaveformDataResponse | null>;
  
  // ラウドネス測定API
  measureLoudness: (
    pathOrOptions: string | { 
      filePath: string; 
      fileId?: string 
    },
    fileId?: string
  ) => Promise<ApiResponse<{ lufs: number; lufsGain: number }>>;
  
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
}

// Electronでのファイル型拡張
interface ElectronFile extends File {
  path: string;
}

// window.apiの型を拡張
declare global {
  interface Window {
    api: ElectronAPI;
    versions: {
      node: () => string;
      chrome: () => string;
      electron: () => string;
    };
  }
}

export { ElectronAPI, ElectronFile };
