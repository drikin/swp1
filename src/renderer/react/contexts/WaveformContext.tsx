import React, { createContext, useContext, useState, useCallback } from 'react';
import { MediaFile, MediaFileWithTaskIds, WaveformContextState, WaveformContextActions, WaveformContextValue } from '../types/media';
import Logger from '../utils/logger';

/**
 * 波形コンテキストのデフォルト値
 */
const defaultWaveformContextValue: WaveformContextValue = {
  // 状態
  waveformData: null,
  isLoadingWaveform: false,
  error: null,
  waveformTaskId: null,
  
  // アクション
  generateWaveform: async () => null,
  fetchWaveformData: async () => null,
  getWaveformForMedia: async () => null,
  extractWaveformData: () => null
};

// コンテキスト作成
export const WaveformContext = createContext<WaveformContextValue>(defaultWaveformContextValue);

/**
 * 波形管理プロバイダーコンポーネント
 * アプリケーション全体で波形管理機能を提供します
 */
export const WaveformProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [waveformData, setWaveformData] = useState<number[] | null>(null);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waveformTaskId, setWaveformTaskId] = useState<string | null>(null);

  /**
   * 波形データの抽出ユーティリティ関数
   * API レスポンスからの波形データを抽出して標準化
   */
  const extractWaveformData = useCallback((response: any): number[] | null => {
    if (!response) {
      Logger.error('WaveformContext', '波形抽出: レスポンスが空です');
      return null;
    }

    try {
      Logger.debug('WaveformContext', '波形抽出: レスポンス', {
        type: typeof response,
        response
      });

      // 1. タスクID経由で取得した場合: {data: {waveform: number[]}}
      if (response.data && Array.isArray(response.data.waveform)) {
        Logger.debug('WaveformContext', '波形抽出: タスクデータから波形を抽出', {
          length: response.data.waveform.length
        });
        return response.data.waveform;
      }

      // 2. タスクID経由で取得した場合（フラット構造）: {waveform: number[]}
      if (response.waveform && Array.isArray(response.waveform)) {
        Logger.debug('WaveformContext', '波形抽出: 直接レスポンスから波形を抽出', {
          length: response.waveform.length
        });
        return response.waveform;
      }

      // 3. 直接波形データの場合: {data: number[]}
      if (response.data && Array.isArray(response.data)) {
        Logger.debug('WaveformContext', '波形抽出: データ配列を抽出', {
          length: response.data.length
        });
        return response.data;
      }

      // 4. フラットな波形データの場合: number[]
      if (Array.isArray(response)) {
        Logger.debug('WaveformContext', '波形抽出: 配列として波形を抽出', {
          length: response.length
        });
        return response;
      }

      // 5. ネストされたデータ構造: {data: {data: number[]}}
      if (response.data && response.data.data && Array.isArray(response.data.data)) {
        Logger.debug('WaveformContext', '波形抽出: ネストされたデータから波形を抽出', {
          length: response.data.data.length
        });
        return response.data.data;
      }

      Logger.error('WaveformContext', '波形抽出: 未知のデータ構造', response);
      return null;
    } catch (error) {
      Logger.error('WaveformContext', '波形データ抽出エラー', error);
      return null;
    }
  }, []);

  /**
   * 波形データ生成関数
   * @param filePath メディアファイルのパス
   * @returns 生成されたタスクのID、または null
   */
  const generateWaveform = useCallback(async (filePath: string): Promise<string | null> => {
    if (!window.api || !window.api.generateWaveform) {
      setError('波形生成APIが利用できません');
      Logger.error('WaveformContext', '波形生成APIが利用できません');
      return null;
    }

    setIsLoadingWaveform(true);
    setError(null);

    try {
      Logger.info('WaveformContext', '波形生成開始', { filePath });
      
      // 波形生成タスクを開始
      const response = await window.api.generateWaveform(filePath);
      Logger.debug('WaveformContext', 'API応答', response);

      if (response && response.success === true && response.taskId) {
        Logger.info('WaveformContext', 'タスク開始成功', { taskId: response.taskId });
        setWaveformTaskId(response.taskId);
        return response.taskId;
      } else {
        Logger.error('WaveformContext', 'タスク開始失敗', response);
        setError('波形生成タスクの開始に失敗しました');
        setIsLoadingWaveform(false);
        return null;
      }
    } catch (error) {
      Logger.error('WaveformContext', '波形生成エラー', error);
      setError('波形生成中にエラーが発生しました');
      setIsLoadingWaveform(false);
      return null;
    }
  }, []);

  /**
   * 波形データを取得
   * @param taskId 波形生成タスクのID
   * @returns 波形データ配列または null
   */
  const fetchWaveformData = useCallback(async (taskId: string): Promise<number[] | null> => {
    if (!window.api || !window.api.getTaskResult) {
      setError('タスク結果取得APIが利用できません');
      Logger.error('WaveformContext', 'タスク結果取得APIが利用できません');
      return null;
    }

    try {
      const taskResult = await window.api.getTaskResult(taskId);
      Logger.debug('WaveformContext', 'タスク結果', taskResult);

      if (taskResult && taskResult.status === 'completed') {
        const extractedData = extractWaveformData(taskResult.data);
        if (extractedData) {
          setWaveformData(extractedData);
          setIsLoadingWaveform(false);
          return extractedData;
        }
      } else if (taskResult && taskResult.status === 'failed') {
        Logger.error('WaveformContext', 'タスク失敗', taskResult.error);
        setError(`波形生成に失敗しました: ${taskResult.error || '不明なエラー'}`);
        setIsLoadingWaveform(false);
      }
    } catch (error) {
      Logger.error('WaveformContext', '波形データ取得エラー', error);
      setError('波形データの取得中にエラーが発生しました');
      setIsLoadingWaveform(false);
    }
    return null;
  }, [extractWaveformData]);

  /**
   * メディアの波形を生成または取得
   * @param media メディアオブジェクト
   * @returns タスクID（string）または null
   */
  const getWaveformForMedia = useCallback(async (media: MediaFileWithTaskIds): Promise<string | null> => {
    if (!media || !media.path) {
      Logger.error('WaveformContext', 'メディアパスがありません');
      return null;
    }

    setIsLoadingWaveform(true);
    setError(null);

    try {
      // 1. 既存のタスクIDを確認
      if (media.waveformTaskId) {
        Logger.debug('WaveformContext', '既存のタスクIDを使用', { taskId: media.waveformTaskId });
        // 波形データを取得するが、タスクIDを返す
        await fetchWaveformData(media.waveformTaskId);
        return media.waveformTaskId;
      }

      // 2. メディアパスからタスクIDを検索
      if (window.api.getTaskIdByMediaPath) {
        const response = await window.api.getTaskIdByMediaPath(media.path, 'waveform');
        Logger.debug('WaveformContext', 'パスからタスクID検索結果', response);

        if (response && response.success && response.taskId) {
          Logger.debug('WaveformContext', '既存のタスクが見つかりました', { taskId: response.taskId });
          // 波形データを取得するが、タスクIDを返す
          await fetchWaveformData(response.taskId);
          return response.taskId;
        }
      }

      // 3. 新しい波形生成タスクを開始
      Logger.info('WaveformContext', '新しいタスクを開始します', { filePath: media.path });
      const taskId = await generateWaveform(media.path);
      if (taskId) {
        // 波形データの取得を試みるが、タスクIDを返す
        await fetchWaveformData(taskId);
        return taskId;
      }
    } catch (error) {
      Logger.error('WaveformContext', '波形生成処理中にエラーが発生しました', error);
      setError('波形生成処理中にエラーが発生しました');
      setIsLoadingWaveform(false);
    }

    return null;
  }, [generateWaveform, fetchWaveformData]);

  // コンテキスト値の構築
  const contextValue: WaveformContextValue = {
    // 状態
    waveformData,
    isLoadingWaveform,
    error,
    waveformTaskId,
    
    // アクション
    generateWaveform,
    fetchWaveformData,
    getWaveformForMedia,
    extractWaveformData
  };

  return (
    <WaveformContext.Provider value={contextValue}>
      {children}
    </WaveformContext.Provider>
  );
};

/**
 * 波形コンテキストを使用するためのフック
 */
export const useWaveform = () => useContext(WaveformContext);
