/**
 * メディアファイル管理に関連する型定義
 */

// メディアファイルの基本構造
export interface MediaFile {
  id: string;
  path: string;
  name: string;
  type: string;
  size: number;
  duration?: number;
  trimStart?: number | null;
  trimEnd?: number | null;
  waveformTaskId?: string;
  thumbnailTaskId?: string;
  thumbnail?: string;
  [key: string]: any;
}

// 拡張されたMediaFile型（コンパイラ問題の回避用）
export interface MediaFileWithTaskIds extends MediaFile {
  waveformTaskId?: string;
  thumbnailTaskId?: string;
}

// サムネイル生成パラメータ
export interface ThumbnailGenerateParams {
  path: string;
  timePosition?: number;
  width?: number;
  height?: number;
}

// 波形データレスポンス
export interface WaveformDataResponse {
  success?: boolean;
  data?: {
    waveform?: number[];
  } | number[];
  waveform?: number[];
  taskId?: string;
}

// メディアコンテキストの状態
export interface MediaContextState {
  mediaFiles: MediaFile[];
  selectedMedia: MediaFile | null;
  isLoading: boolean;
  error: string | null;
}

// メディアコンテキストのアクション
export interface MediaContextActions {
  addMediaFiles: (filePaths: string[]) => Promise<MediaFile[]>;
  reorderMediaFiles: (sourceIndex: number, destinationIndex: number) => void;
  deleteMediaFiles: (mediaIds: string[]) => void;
  selectMedia: (media: MediaFile | null) => void;
  updateMedia: (mediaId: string, updates: Partial<MediaFile>) => void;
  updateTrimPoints: (mediaId: string, trimStart: number | null, trimEnd: number | null) => void;
  calculateTotalDuration: () => number;
  initializeMediaProcessing: (media: MediaFile) => Promise<void>;
}

// メディアコンテキストの最終型
export interface MediaContextValue extends MediaContextState, MediaContextActions {}

// 波形コンテキストの状態
export interface WaveformContextState {
  waveformData: number[] | null;
  isLoadingWaveform: boolean;
  error: string | null;
  waveformTaskId: string | null;
}

// 波形コンテキストのアクション
export interface WaveformContextActions {
  generateWaveform: (filePath: string) => Promise<string | null>;
  fetchWaveformData: (taskId: string) => Promise<number[] | null>;
  getWaveformForMedia: (media: MediaFile) => Promise<string | null>;
  extractWaveformData: (response: any) => number[] | null;
}

// 波形コンテキストの最終型
export interface WaveformContextValue extends WaveformContextState, WaveformContextActions {}

// サムネイルコンテキストの状態
export interface ThumbnailContextState {
  thumbnailUrl: string | null;
  isLoadingThumbnail: boolean;
  error: string | null;
  thumbnailTaskId: string | null;
}

// サムネイルコンテキストのアクション
export interface ThumbnailContextActions {
  generateThumbnail: (params: ThumbnailGenerateParams) => Promise<string | null>;
  fetchThumbnailData: (taskId: string) => Promise<string | null>;
  getThumbnailForMedia: (media: MediaFile) => Promise<string | null>;
}

// サムネイルコンテキストの最終型
export interface ThumbnailContextValue extends ThumbnailContextState, ThumbnailContextActions {}
