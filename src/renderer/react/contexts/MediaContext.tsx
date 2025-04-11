import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

    // このメディアIDの処理が既に進行中か確認
    const processingKey = `init_processing_${media.id}`;
    if (window.sessionStorage.getItem(processingKey) === 'true') {
      console.log(`[初期処理スキップ] メディア: ${media.id} - 既に処理中です`);
      return;
    }

    // 処理中フラグを設定
    window.sessionStorage.setItem(processingKey, 'true');

    // 初期化前にコンソールに詳細なログを出力
    console.log(`[初期処理開始] メディア: ${media.id}, パス: ${media.path}, コンテキスト状態:`, {
      getThumbnailForMedia: !!getThumbnailForMedia,
      getWaveformForMedia: !!getWaveformForMedia,
      windowAPIStatus: {
        hasAPI: !!window.api,
        hasInvoke: !!(window.api && 'invoke' in window.api),
        hasFindTasksByMedia: !!(window.api && 'findTasksByMedia' in window.api),
        hasGenerateThumbnail: !!(window.api && 'generateThumbnail' in window.api)
      }
    });

    try {
      console.log(`[初期処理開始] メディア: ${media.id}, パス: ${media.path}`);
      
      // 波形生成を開始
      console.log(`[波形生成開始] メディア: ${media.id}`);
      const waveformTaskId = await getWaveformForMedia(media);
      console.log(`[波形生成結果] メディア: ${media.id}, タスクID: ${waveformTaskId}`);
      if (waveformTaskId) {
        updateMedia(media.id, { waveformTaskId } as Partial<MediaFile>);
      }
      
      // サムネイル生成を開始（直接URL取得の試み）
      console.log(`[サムネイル生成開始] メディア: ${media.id}`);
      
      if (!getThumbnailForMedia) {
        console.error(`[サムネイル生成エラー] getThumbnailForMedia関数が未定義です`);
        window.sessionStorage.removeItem(processingKey); // 処理中フラグを解除
        return;
      }
      
      try {
        const thumbnailResult = await getThumbnailForMedia(media);
        console.log(`[サムネイル生成結果] メディア: ${media.id}, 結果: `, thumbnailResult);
        
        // タスクIDまたはURL文字列のどちらの可能性もある
        if (typeof thumbnailResult === 'string') {
          if (thumbnailResult.startsWith('file://')) {
            // URLの場合はthumbnailプロパティに設定
            console.log(`[サムネイルURL設定] メディア: ${media.id}, URL: ${thumbnailResult}`);
            updateMedia(media.id, { thumbnail: thumbnailResult } as Partial<MediaFile>);
          } else {
            // それ以外はタスクIDとして扱う
            console.log(`[サムネイルタスクID設定] メディア: ${media.id}, ID: ${thumbnailResult}`);
            updateMedia(media.id, { thumbnailTaskId: thumbnailResult } as Partial<MediaFile>);
          }
        } else {
          console.warn(`[サムネイル生成警告] メディア: ${media.id}, 返値がnullまたは無効な形式です`);
        }
      } catch (error) {
        console.error(`[サムネイル生成例外] メディア: ${media.id}`, error);
      }
    } catch (error) {
      console.error('[メディア処理初期化] エラー:', media.id, error);
    } finally {
      // 処理中フラグを解除
      window.sessionStorage.removeItem(processingKey);
    }
  }, [getWaveformForMedia, getThumbnailForMedia, updateMedia]);

  /**
   * メディアファイルを追加する関数
   * @param filePaths ファイルパスの配列
   */
  const addMediaFiles = useCallback(async (filePaths: string[]): Promise<MediaFile[]> => {
    if (!filePaths || filePaths.length === 0) return [];
    
    setIsLoading(true);
    setError(null);
    const newMediaFiles: MediaFile[] = [];
    
    try {
      console.log(`メディアファイル追加処理を開始します: ${filePaths.length}件`);
      
      for (const filePath of filePaths) {
        console.log(`メディア情報を取得中: ${filePath}`);
        
        // 既に同じパスのメディアが存在するかチェック
        const existingMedia = mediaFiles.find(m => m.path === filePath);
        if (existingMedia) {
          console.log(`既に追加済みのメディアです: ${filePath}`);
          continue;
        }
        
        if (!window.api?.getMediaInfo) {
          console.error('メディア情報取得APIが利用できません');
          setError('メディア情報取得APIが利用できません');
          return [];
        }
        
        // APIを使ってメディア情報を取得
        const mediaInfo = await window.api.getMediaInfo(filePath);
        console.log('取得したメディア情報:', mediaInfo);
        
        if (!mediaInfo) {
          console.error(`メディア情報を取得できませんでした: ${filePath}`);
          continue;
        }
        
        // メディアIDを生成（ファイルパスのハッシュまたはUUID）
        const mediaId = window.nodeCrypto.generateUUID();
        
        const mediaFile: MediaFile = {
          id: mediaId,
          path: filePath,
          name: mediaInfo.name || filePath.split('/').pop() || 'unknown',
          type: mediaInfo.format || 'unknown',
          size: mediaInfo.size || 0,
          duration: mediaInfo.duration || 0,
          trimStart: null,
          trimEnd: null
        };
        
        console.log(`メディアオブジェクト作成: `, mediaFile);
        newMediaFiles.push(mediaFile);
      }
      
      // 状態を更新
      setMediaFiles(prevMediaFiles => [...prevMediaFiles, ...newMediaFiles]);
      console.log(`${newMediaFiles.length}件のメディアを追加しました。総数: ${mediaFiles.length + newMediaFiles.length}`);
      
      // サムネイルと波形データの初期取得も行う（初期処理の場合）
      for (const media of newMediaFiles) {
        await initializeMediaProcessing(media as MediaFileWithTaskIds);
      }
    } catch (error) {
      console.error('メディアファイル追加中にエラーが発生しました:', error);
      setError('メディアファイル追加中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
    
    return newMediaFiles;
  }, [mediaFiles.length, initializeMediaProcessing]);

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
