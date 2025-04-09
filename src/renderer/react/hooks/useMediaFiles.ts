/**
 * メディアファイル管理フック（コンテキストベース）
 */
import { useMedia } from '../contexts/MediaContext';
import { MediaContextValue } from '../types/media';

/**
 * メディアファイル管理のためのカスタムフック
 * コンテキストを使用した実装
 */
export const useMediaFiles = (): MediaContextValue => {
  const mediaContext = useMedia();
  
  // コンテキストからすべての機能を提供
  return {
    ...mediaContext
  };
};
