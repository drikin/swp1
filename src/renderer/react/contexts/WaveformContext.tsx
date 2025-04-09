import React, { createContext, useContext, useState, useCallback } from 'react';
import { MediaFile, MediaFileWithTaskIds, WaveformContextState, WaveformContextActions, WaveformContextValue } from '../types/media';

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
      console.error('[波形抽出] レスポンスが空です');
      return null;
    }

    try {
      console.log('[波形抽出] レスポンス:', typeof response, response);

      // 1. タスクID経由で取得した場合: {data: {waveform: number[]}}
      if (response.data && Array.isArray(response.data.waveform)) {
        console.log('[波形抽出] タスクデータから波形を抽出:', response.data.waveform.length);
        return response.data.waveform;
      }

      // 2. タスクID経由で取得した場合（フラット構造）: {waveform: number[]}
      if (response.waveform && Array.isArray(response.waveform)) {
        console.log('[波形抽出] 直接レスポンスから波形を抽出:', response.waveform.length);
        return response.waveform;
      }

      // 3. 直接波形データの場合: {data: number[]}
      if (response.data && Array.isArray(response.data)) {
        console.log('[波形抽出] データ配列を抽出:', response.data.length);
        return response.data;
      }

      // 4. フラットな波形データの場合: number[]
      if (Array.isArray(response)) {
        console.log('[波形抽出] 配列として波形を抽出:', response.length);
        return response;
      }

      // 5. ネストされたデータ構造: {data: {data: number[]}}
      if (response.data && response.data.data && Array.isArray(response.data.data)) {
        console.log('[波形抽出] ネストされたデータから波形を抽出:', response.data.data.length);
        return response.data.data;
      }

      console.error('[波形抽出] 未知のデータ構造:', response);
      return null;
    } catch (error) {
      console.error('[波形抽出] 波形データ抽出エラー:', error);
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
      return null;
    }

    setIsLoadingWaveform(true);
    setError(null);

    try {
      console.log('[波形生成] 開始:', filePath);
      
      // 波形生成タスクを開始
      const response = await window.api.generateWaveform(filePath);
      console.log('[波形生成] API応答:', response);

      if (response && response.success === true && response.taskId) {
        console.log('[波形生成] タスク開始成功:', response.taskId);
        setWaveformTaskId(response.taskId);
        return response.taskId;
      } else {
        console.error('[波形生成] タスク開始失敗:', response);
        setError('波形生成タスクの開始に失敗しました');
        setIsLoadingWaveform(false);
        return null;
      }
    } catch (error) {
      console.error('[波形生成] エラー:', error);
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
      return null;
    }

    try {
      const taskResult = await window.api.getTaskResult(taskId);
      console.log('[波形取得] タスク結果:', taskResult);

      if (taskResult && taskResult.status === 'completed') {
        const extractedData = extractWaveformData(taskResult.data);
        if (extractedData) {
          setWaveformData(extractedData);
          setIsLoadingWaveform(false);
          return extractedData;
        }
      } else if (taskResult && taskResult.status === 'failed') {
        console.error('[波形取得] タスク失敗:', taskResult.error);
        setError(`波形生成に失敗しました: ${taskResult.error || '不明なエラー'}`);
        setIsLoadingWaveform(false);
      }
    } catch (error) {
      console.error('[波形取得] エラー:', error);
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
      console.error('[波形取得] メディアパスがありません');
      return null;
    }

    setIsLoadingWaveform(true);
    setError(null);

    try {
      // 1. 既存のタスクIDを確認
      if (media.waveformTaskId) {
        console.log('[波形取得] 既存のタスクIDを使用:', media.waveformTaskId);
        // 波形データを取得するが、タスクIDを返す
        await fetchWaveformData(media.waveformTaskId);
        return media.waveformTaskId;
      }

      // 2. メディアパスからタスクIDを検索
      if (window.api.getTaskIdByMediaPath) {
        const response = await window.api.getTaskIdByMediaPath(media.path, 'waveform');
        console.log('[波形取得] パスからタスクID検索結果:', response);

        if (response && response.success && response.taskId) {
          console.log('[波形取得] 既存のタスクが見つかりました:', response.taskId);
          // 波形データを取得するが、タスクIDを返す
          await fetchWaveformData(response.taskId);
          return response.taskId;
        }
      }

      // 3. 新しい波形生成タスクを開始
      console.log('[波形取得] 新しいタスクを開始します');
      const taskId = await generateWaveform(media.path);
      if (taskId) {
        // 波形データの取得を試みるが、タスクIDを返す
        await fetchWaveformData(taskId);
        return taskId;
      }
    } catch (error) {
      console.error('[波形取得] エラー:', error);
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
