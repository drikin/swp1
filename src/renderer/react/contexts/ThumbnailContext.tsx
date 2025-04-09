import React, { createContext, useContext, useState, useCallback } from 'react';
import { MediaFile, MediaFileWithTaskIds, ThumbnailContextState, ThumbnailContextActions, ThumbnailContextValue, ThumbnailGenerateParams } from '../types/media';
import Logger from '../utils/logger';

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
      Logger.error('ThumbnailContext', 'API が利用できません');
      setError('サムネイル生成APIが利用できません');
      return null;
    }

    if (!params.path) {
      Logger.error('ThumbnailContext', 'メディアパスがありません');
      setError('メディアファイルが指定されていません');
      return null;
    }

    setIsLoadingThumbnail(true);
    setError(null);

    try {
      Logger.info('ThumbnailContext', 'サムネイル生成開始', {
        path: params.path,
        position: params.timePosition
      });

      // サムネイル生成タスクを開始
      const response = await window.api.generateThumbnail(params);
      Logger.debug('ThumbnailContext', 'API応答', response);

      if (response && response.success === true && response.taskId) {
        Logger.info('ThumbnailContext', 'タスク開始成功', response.taskId);
        setThumbnailTaskId(response.taskId);
        return response.taskId;
      } else {
        Logger.error('ThumbnailContext', 'タスク開始失敗', response);
        const errorMessage = (response && response.error) 
          ? response.error 
          : 'サムネイル生成タスクの開始に失敗しました';
        setError(errorMessage);
        setIsLoadingThumbnail(false);
      }
    } catch (error) {
      Logger.error('ThumbnailContext', 'サムネイル生成中にエラーが発生しました', error);
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
      Logger.error('ThumbnailContext', 'タスク結果取得APIが利用できません');
      setError('タスク結果取得APIが利用できません');
      return null;
    }

    try {
      const taskResult = await window.api.getTaskResult(taskId);
      Logger.debug('ThumbnailContext', 'タスク結果', taskResult);

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
        Logger.error('ThumbnailContext', 'タスク失敗', taskResult.error);
        setError(`サムネイル生成に失敗しました: ${taskResult.error || '不明なエラー'}`);
        setIsLoadingThumbnail(false);
      }
    } catch (error) {
      Logger.error('ThumbnailContext', 'サムネイルデータの取得中にエラーが発生しました', error);
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
      Logger.error('ThumbnailContext', 'メディアパスがありません');
      return null;
    }

    setIsLoadingThumbnail(true);
    setError(null);

    try {
      // 1. 既存のタスクIDを確認
      if (media.thumbnailTaskId) {
        Logger.debug('ThumbnailContext', '既存のタスクIDを使用', media.thumbnailTaskId);
        return await fetchThumbnailData(media.thumbnailTaskId);
      }

      // 2. メディアパスからタスクIDを検索
      if (window.api.getTaskIdByMediaPath) {
        const response = await window.api.getTaskIdByMediaPath(media.path, 'thumbnail');
        Logger.debug('ThumbnailContext', 'パスからタスクID検索結果', response);

        if (response && response.success && response.taskId) {
          Logger.debug('ThumbnailContext', '既存のタスクが見つかりました', response.taskId);
          return await fetchThumbnailData(response.taskId);
        }
      }

      // 3. 新しいサムネイル生成タスクを開始
      Logger.info('ThumbnailContext', '新しいタスクを開始します');
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
      Logger.error('ThumbnailContext', 'サムネイル処理中にエラーが発生しました', error);
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
