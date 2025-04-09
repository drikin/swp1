import React, { createContext, useContext, useState, useCallback } from 'react';
import { MediaFile, MediaFileWithTaskIds, ThumbnailContextState, ThumbnailContextActions, ThumbnailContextValue, ThumbnailGenerateParams } from '../types/media';

/**
 * サムネイルコンテキストのデフォルト値
 */
const defaultThumbnailContextValue: ThumbnailContextValue = {
  // 状態
  thumbnailUrl: null,
  isLoadingThumbnail: false,
  error: null,
  thumbnailTaskId: null,
  
  // アクション
  generateThumbnail: async () => null,
  fetchThumbnailData: async () => null,
  getThumbnailForMedia: async () => null
};

// コンテキスト作成
export const ThumbnailContext = createContext<ThumbnailContextValue>(defaultThumbnailContextValue);

/**
 * サムネイル管理プロバイダーコンポーネント
 * アプリケーション全体でサムネイル管理機能を提供します
 */
export const ThumbnailProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoadingThumbnail, setIsLoadingThumbnail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbnailTaskId, setThumbnailTaskId] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  /**
   * サムネイル生成タスクを開始する関数
   * @param params サムネイル生成パラメータ
   */
  const generateThumbnail = useCallback(async (params: ThumbnailGenerateParams) => {
    if (!window.api || !window.api.generateThumbnail) {
      console.error('[サムネイル生成] API が利用できません');
      setError('サムネイル生成APIが利用できません');
      return null;
    }

    if (!params.path) {
      console.error('[サムネイル生成] メディアパスがありません');
      setError('メディアファイルが指定されていません');
      return null;
    }

    setIsLoadingThumbnail(true);
    setError(null);

    try {
      console.log('[サムネイル生成] 開始:', {
        path: params.path,
        position: params.timePosition
      });

      // サムネイル生成タスクを開始
      const response = await window.api.generateThumbnail(params);
      console.log('[サムネイル生成] API応答:', response);

      if (response && response.success === true && response.taskId) {
        console.log('[サムネイル生成] タスク開始成功:', response.taskId);
        setThumbnailTaskId(response.taskId);
        return response.taskId;
      } else {
        console.error('[サムネイル生成] タスク開始失敗:', response);
        const errorMessage = (response && response.error) 
          ? response.error 
          : 'サムネイル生成タスクの開始に失敗しました';
        setError(errorMessage);
        setIsLoadingThumbnail(false);
      }
    } catch (error) {
      console.error('[サムネイル生成] エラー:', error);
      setError('サムネイル生成中にエラーが発生しました');
      setIsLoadingThumbnail(false);
    }

    return null;
  }, []);

  /**
   * サムネイルタスクの結果を取得する関数
   * @param taskId タスクID
   */
  const fetchThumbnailData = useCallback(async (taskId: string) => {
    if (!window.api || !window.api.getTaskResult) {
      setError('タスク結果取得APIが利用できません');
      return null;
    }

    try {
      const taskResult = await window.api.getTaskResult(taskId);
      console.log('[サムネイル取得] タスク結果:', taskResult);

      if (taskResult && taskResult.status === 'completed') {
        // タスク完了、サムネイルデータを返す
        setIsLoadingThumbnail(false);
        
        // サムネイルのURL情報を更新
        if (taskResult.data && taskResult.data.thumbnailUrl) {
          setThumbnailUrl(taskResult.data.thumbnailUrl);
        } else if (taskResult.data && taskResult.data.filePath) {
          // ファイルパスをURLに変換
          setThumbnailUrl(`file://${taskResult.data.filePath}`);
        }
        
        return taskResult.data;
      } else if (taskResult && taskResult.status === 'failed') {
        console.error('[サムネイル取得] タスク失敗:', taskResult.error);
        setError(`サムネイル生成に失敗しました: ${taskResult.error || '不明なエラー'}`);
        setIsLoadingThumbnail(false);
      }
    } catch (error) {
      console.error('[サムネイル取得] エラー:', error);
      setError('サムネイルデータの取得中にエラーが発生しました');
      setIsLoadingThumbnail(false);
    }
    return null;
  }, []);

  /**
   * メディアのサムネイルを生成または取得する関数
   * @param media メディアオブジェクト
   * @param timePosition 秒単位のタイムスタンプ（オプション）
   */
  const getThumbnailForMedia = useCallback(async (media: MediaFileWithTaskIds, timePosition?: number) => {
    if (!media || !media.path) {
      console.error('[サムネイル取得] メディアパスがありません');
      return null;
    }

    setIsLoadingThumbnail(true);
    setError(null);

    try {
      // 1. 既存のタスクIDを確認
      if (media.thumbnailTaskId) {
        console.log('[サムネイル取得] 既存のタスクIDを使用:', media.thumbnailTaskId);
        return await fetchThumbnailData(media.thumbnailTaskId);
      }

      // 2. メディアパスからタスクIDを検索
      if (window.api.getTaskIdByMediaPath) {
        const response = await window.api.getTaskIdByMediaPath(media.path, 'thumbnail');
        console.log('[サムネイル取得] パスからタスクID検索結果:', response);

        if (response && response.success && response.taskId) {
          console.log('[サムネイル取得] 既存のタスクが見つかりました:', response.taskId);
          return await fetchThumbnailData(response.taskId);
        }
      }

      // 3. 新しいサムネイル生成タスクを開始
      console.log('[サムネイル取得] 新しいタスクを開始します');
      const params: ThumbnailGenerateParams = {
        path: media.path,
        timePosition: timePosition !== undefined ? timePosition : (media.duration ? media.duration / 2 : 0),
        width: 320 // デフォルト幅
      };
      const taskId = await generateThumbnail(params);
      if (taskId) {
        return await fetchThumbnailData(taskId);
      }
    } catch (error) {
      console.error('[サムネイル取得] エラー:', error);
      setError('サムネイル処理中にエラーが発生しました');
      setIsLoadingThumbnail(false);
    }

    return null;
  }, [generateThumbnail, fetchThumbnailData]);

  // コンテキスト値の構築
  const contextValue: ThumbnailContextValue = {
    // 状態
    thumbnailUrl,
    isLoadingThumbnail,
    error,
    thumbnailTaskId,
    
    // アクション
    generateThumbnail,
    fetchThumbnailData,
    getThumbnailForMedia
  };

  return (
    <ThumbnailContext.Provider value={contextValue}>
      {children}
    </ThumbnailContext.Provider>
  );
};

/**
 * サムネイルコンテキストを使用するためのフック
 */
export const useThumbnail = () => useContext(ThumbnailContext);
