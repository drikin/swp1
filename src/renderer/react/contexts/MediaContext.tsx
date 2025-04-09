import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
// uuid パッケージの代わりにプリロードスクリプトの nodeCrypto を使用
// import { v4 as uuidv4 } from 'uuid';
import { MediaFile, MediaFileWithTaskIds, MediaContextState, MediaContextActions, MediaContextValue } from '../types/media';
import { useWaveform, useThumbnail } from '../hooks';

// グローバル window オブジェクトに nodeCrypto の型定義を追加
declare global {
  interface Window {
    nodeCrypto: {
      generateUUID: () => string;
    };
  }
}

/**
 * メディアコンテキストのデフォルト値
 */
const defaultMediaContextValue: MediaContextValue = {
  // 状態
  mediaFiles: [],
  selectedMedia: null,
  isLoading: false,
  error: null,
  
  // アクション
  addMediaFiles: async () => [],
  reorderMediaFiles: () => {},
  deleteMediaFiles: () => {},
  selectMedia: () => {},
  updateMedia: () => {},
  updateTrimPoints: () => {},
  calculateTotalDuration: () => 0,
  initializeMediaProcessing: async () => {}
};

// コンテキスト作成
const MediaContext = createContext<MediaContextValue>(defaultMediaContextValue);

/**
 * メディアファイル管理プロバイダーコンポーネント
 * アプリケーション全体でメディアファイル管理機能を提供します
 */
export const MediaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 波形生成フックとサムネイル生成フックを使用
  const waveformHook = useWaveform();
  const thumbnailHook = useThumbnail();
  
  const getWaveformForMedia = waveformHook.getWaveformForMedia;
  const getThumbnailForMedia = thumbnailHook.getThumbnailForMedia;

  /**
   * メディア情報の更新
   */
  const updateMedia = useCallback((mediaId: string, updates: Partial<MediaFile>) => {
    if (!mediaId) return;

    setMediaFiles(prevFiles => {
      return prevFiles.map(file => {
        if (file.id === mediaId) {
          return { ...file, ...updates };
        }
        return file;
      });
    });

    // 選択中のメディアが更新対象の場合は、そちらも更新
    if (selectedMedia && selectedMedia.id === mediaId) {
      setSelectedMedia(prev => prev ? { ...prev, ...updates } : null);
    }
  }, [selectedMedia]);

  /**
   * メディアの処理初期化（波形・サムネイル生成）
   */
  const initializeMediaProcessing = useCallback(async (media: MediaFileWithTaskIds) => {
    if (!media || !media.path) return;

    try {
      // 波形生成を開始
      const waveformTaskId = await getWaveformForMedia(media);
      if (waveformTaskId) {
        updateMedia(media.id, { waveformTaskId } as Partial<MediaFile>);
      }
      
      // サムネイル生成を開始
      const thumbnailTaskId = await getThumbnailForMedia(media);
      if (thumbnailTaskId) {
        updateMedia(media.id, { thumbnailTaskId } as Partial<MediaFile>);
      }
    } catch (error) {
      console.error('[メディア処理初期化] エラー:', media.id, error);
    }
  }, [getWaveformForMedia, getThumbnailForMedia, updateMedia]);

  /**
   * メディアファイルの追加処理
   */
  const addMediaFiles = useCallback(async (filePaths: string[]) => {
    if (!filePaths || filePaths.length === 0) {
      console.log('[メディア追加] ファイルパスが指定されていません');
      return [];
    }

    if (!window.api || !window.api.getMediaInfo) {
      setError('メディア情報取得APIが利用できません');
      return [];
    }

    setIsLoading(true);
    setError(null);

    const newMediaFiles: MediaFile[] = [];

    try {
      for (const filePath of filePaths) {
        console.log('[メディア追加] 処理中:', filePath);
        
        // メディア情報を取得
        const mediaInfo = await window.api.getMediaInfo(filePath);
        if (!mediaInfo || !mediaInfo.success) {
          console.error('[メディア追加] 情報取得失敗:', filePath, mediaInfo);
          continue;
        }

        const fileName = mediaInfo.name || filePath.split('/').pop() || 'unknown';

        const media: MediaFile = {
          id: window.nodeCrypto.generateUUID(),
          path: filePath,
          name: fileName,
          type: mediaInfo.type || 'unknown',
          size: mediaInfo.size || 0,
          duration: mediaInfo.duration || 0,
          trimStart: null,
          trimEnd: null
        };

        console.log('[メディア追加] メディア情報:', media);
        newMediaFiles.push(media);
        
        // 波形とサムネイルの生成を開始
        initializeMediaProcessing(media as MediaFileWithTaskIds);
      }

      // 既存のメディアファイルリストに新しいファイルを追加
      setMediaFiles(prev => [...prev, ...newMediaFiles]);
      
      // 追加した最初のメディアを選択（既に他のメディアが選択されていない場合）
      if (newMediaFiles.length > 0 && !selectedMedia) {
        setSelectedMedia(newMediaFiles[0]);
      }
      
      setIsLoading(false);
      return newMediaFiles;
    } catch (error) {
      console.error('[メディア追加] エラー:', error);
      setError('メディアファイルの追加中にエラーが発生しました');
      setIsLoading(false);
      return [];
    }
  }, [selectedMedia, initializeMediaProcessing]);

  /**
   * メディアファイルの並び替え
   */
  const reorderMediaFiles = useCallback((sourceIndex: number, destinationIndex: number) => {
    if (sourceIndex === destinationIndex) return;
    
    setMediaFiles(prevFiles => {
      const result = [...prevFiles];
      const [removed] = result.splice(sourceIndex, 1);
      result.splice(destinationIndex, 0, removed);
      return result;
    });
  }, []);

  /**
   * メディアファイルの削除
   */
  const deleteMediaFiles = useCallback((mediaIds: string[]) => {
    if (!mediaIds || mediaIds.length === 0) return;

    setMediaFiles(prevFiles => {
      const newFiles = prevFiles.filter(file => !mediaIds.includes(file.id));
      return newFiles;
    });

    // 選択中のメディアが削除された場合、選択を解除または変更
    if (selectedMedia && mediaIds.includes(selectedMedia.id)) {
      const remainingFiles = mediaFiles.filter(file => !mediaIds.includes(file.id));
      setSelectedMedia(remainingFiles.length > 0 ? remainingFiles[0] : null);
    }
  }, [mediaFiles, selectedMedia]);

  /**
   * メディアファイルの選択
   */
  const selectMedia = useCallback((media: MediaFile | null) => {
    setSelectedMedia(media);
  }, []);

  /**
   * トリムポイントの更新
   */
  const updateTrimPoints = useCallback((mediaId: string, trimStart: number | null, trimEnd: number | null) => {
    updateMedia(mediaId, { trimStart, trimEnd });
  }, [updateMedia]);

  /**
   * 合計時間の計算
   */
  const calculateTotalDuration = useCallback(() => {
    return mediaFiles.reduce((total, file) => {
      const startTime = file.trimStart ?? 0;
      const endTime = file.trimEnd ?? file.duration;
      const duration = (endTime !== undefined && startTime !== undefined) 
        ? endTime - startTime 
        : (file.duration ?? 0);
      return total + (duration > 0 ? duration : 0);
    }, 0);
  }, [mediaFiles]);

  // コンテキスト値の構築
  const contextValue: MediaContextValue = {
    // 状態
    mediaFiles,
    selectedMedia,
    isLoading,
    error,
    
    // アクション
    addMediaFiles,
    reorderMediaFiles,
    deleteMediaFiles,
    selectMedia,
    updateMedia,
    updateTrimPoints,
    calculateTotalDuration,
    initializeMediaProcessing
  };

  return (
    <MediaContext.Provider value={contextValue}>
      {children}
    </MediaContext.Provider>
  );
};

/**
 * メディアコンテキストを使用するためのフック
 */
export const useMedia = () => useContext(MediaContext);
