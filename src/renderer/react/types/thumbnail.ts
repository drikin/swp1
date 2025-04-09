/**
 * サムネイル管理に関連する型定義
 */

import { MediaFile } from './media';

// サムネイルコンテキストの状態
export interface ThumbnailContextState {
  thumbnailUrl: string | null;
  isLoadingThumbnail: boolean;
  error: string | null;
  thumbnailTaskId: string | null;
}

// サムネイルコンテキストのアクション
export interface ThumbnailContextActions {
  generateThumbnail: (
    media: MediaFile, 
    timePosition?: number, 
    width?: number, 
    height?: number
  ) => Promise<string | null>;
  fetchThumbnail: (taskId: string) => Promise<string | null>;
  getThumbnailForMedia: (media: MediaFile, timePosition?: number) => Promise<string | null>;
}

// サムネイルコンテキストの最終型
export interface ThumbnailContextValue extends ThumbnailContextState, ThumbnailContextActions {}
