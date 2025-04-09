/**
 * サムネイル管理フック（コンテキストベース）
 */
import { useThumbnail as useThumbnailContext } from '../contexts/ThumbnailContext';
import { ThumbnailContextValue } from '../types/media';

/**
 * サムネイル管理のためのカスタムフック
 * コンテキストを使用した実装
 */
export const useThumbnail = (): ThumbnailContextValue => {
  const thumbnailContext = useThumbnailContext();
  
  // コンテキストからすべての機能を提供
  return {
    ...thumbnailContext
  };
};
