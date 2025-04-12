import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
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
  getWaveformForMedia: async () => null,
  fetchWaveformData: async () => null,
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
   * @param {any} data - 解析対象のデータ
   * @returns {number[] | null} - 抽出された波形データまたはnull
   */
  const extractWaveformData = useCallback((data: any): number[] | null => {
    if (!data) {
      Logger.error('WaveformContext', '波形データ抽出: データがnullまたはundefined');
      return null;
    }

    try {
      // デバッグ情報
      const dataType = typeof data;
      console.log('波形データ抽出 - データ形式:', {
        type: dataType,
        isArray: Array.isArray(data),
        hasWaveform: data && 'waveform' in data,
        waveformType: data && data.waveform ? typeof data.waveform : 'なし'
      });

      // 直接waveformプロパティが存在する場合（最も一般的なケース）
      if (data.waveform && Array.isArray(data.waveform)) {
        Logger.debug('WaveformContext', '直接waveformプロパティから波形データを抽出', { 
          length: data.waveform.length,
          sample: data.waveform.slice(0, 5)
        });
        // 明示的に配列内の各値を数値に変換
        return data.waveform.map((val: any) => Number(val));
      }
      
      // データ自体が配列の場合
      if (Array.isArray(data)) {
        Logger.debug('WaveformContext', 'データ配列から波形データを抽出', { 
          length: data.length,
          sample: data.slice(0, 5)
        });
        // 明示的に配列内の各値を数値に変換
        return data.map((val: any) => Number(val));
      }

      // 他の可能性のあるデータ構造を確認
      if (data.data && Array.isArray(data.data)) {
        Logger.debug('WaveformContext', 'data.dataプロパティから波形データを抽出', { 
          length: data.data.length,
          sample: data.data.slice(0, 5)
        });
        // 明示的に配列内の各値を数値に変換
        return data.data.map((val: any) => Number(val));
      }

      if (data.result && data.result.waveform && Array.isArray(data.result.waveform)) {
        Logger.debug('WaveformContext', 'data.result.waveformから波形データを抽出', { 
          length: data.result.waveform.length,
          sample: data.result.waveform.slice(0, 5)
        });
        // 明示的に配列内の各値を数値に変換
        return data.result.waveform.map((val: any) => Number(val));
      }

      // データがオブジェクトで最初の配列プロパティを試す
      if (typeof data === 'object') {
        for (const key in data) {
          if (Array.isArray(data[key]) && data[key].length > 0) {
            Logger.debug('WaveformContext', `data.${key}から波形データを抽出`, { 
              length: data[key].length,
              sample: data[key].slice(0, 5)
            });
            // 明示的に数値配列に変換して返す
            return data[key].map((val: any) => Number(val));
          }
        }
      }

      // 抽出失敗
      Logger.error('WaveformContext', '波形データの抽出に失敗', { 
        dataStructure: Object.keys(data).join(', ')
      });
      return null;
    } catch (error) {
      Logger.error('WaveformContext', '波形データ抽出エラー', error);
      return null;
    }
  }, []);

  /**
   * 波形データをタスク結果から取得
   * @param {string} taskId - 波形タスクID
   * @returns {Promise<number[] | null>} - 波形データまたはnull
   */
  const fetchWaveformData = useCallback(async (taskId) => {
    if (!taskId) {
      Logger.error('WaveformContext', 'タスクIDが指定されていません');
      return null;
    }

    try {
      Logger.info('WaveformContext', '波形データ取得開始', { taskId });
      
      setIsLoadingWaveform(true);
      setError(null);
      
      // タスク結果を取得
      const response = await window.api.invoke('get-task-result', taskId);
      
      // タスク結果のデバッグ出力
      console.log('タスク結果取得 (詳細):', JSON.stringify(response, null, 2));
      
      // タスク結果が正しく取得できなかった場合
      if (!response || !response.success) {
        const errorMsg = response?.error || '不明なエラー';
        Logger.error('WaveformContext', '波形タスク結果の取得に失敗', { 
          taskId, 
          error: errorMsg 
        });
        setError(`波形データの取得に失敗しました: ${errorMsg}`);
        setIsLoadingWaveform(false);
        return null;
      }
      
      // データがない場合
      if (!response.data) {
        Logger.error('WaveformContext', 'タスク結果にデータがありません', { taskId });
        setError('タスク結果にデータがありません');
        setIsLoadingWaveform(false);
        return null;
      }
      
      // ファイルパスの取得を試みる
      let filePath = null;
      
      // データの型と構造をデバッグ出力
      console.log('タスク結果データ構造:', {
        dataType: typeof response.data,
        isString: typeof response.data === 'string',
        hasFilePath: typeof response.data === 'object' && !!response.data.filePath,
        keys: typeof response.data === 'object' ? Object.keys(response.data) : []
      });
      
      if (typeof response.data === 'string') {
        // 文字列の場合はJSONとしてパースを試みる
        try {
          const parsedData = JSON.parse(response.data);
          if (parsedData && parsedData.filePath) {
            filePath = parsedData.filePath;
            console.log('文字列からパースしたファイルパス:', filePath);
          }
        } catch (e) {
          console.error('JSONパースエラー:', e);
        }
      } else if (typeof response.data === 'object') {
        // オブジェクトの場合
        if (response.data.filePath) {
          filePath = response.data.filePath;
          console.log('レスポンスデータから直接取得したファイルパス:', filePath);
        } else if (response.data.result && response.data.result.filePath) {
          filePath = response.data.result.filePath;
          console.log('ネストされた結果オブジェクトから取得したファイルパス:', filePath);
        }
      }
      
      // ファイルパスが取得できなかった場合
      if (!filePath) {
        Logger.error('WaveformContext', '波形データファイルのパスが取得できません', { taskId });
        setError('波形データファイルのパスが取得できません');
        setIsLoadingWaveform(false);
        return null;
      }
      
      // 波形データファイルを読み込む
      try {
        Logger.info('WaveformContext', '波形ファイルから直接データを読み込み', { filePath });
        
        const fileResponse = await window.api.invoke('read-file', filePath);
        
        if (!fileResponse || !fileResponse.success || !fileResponse.data) {
          Logger.error('WaveformContext', '波形ファイル読み込み失敗', {
            filePath: filePath,
            error: fileResponse?.error || '不明なエラー'
          });
          setError(`波形ファイルの読み込みに失敗しました: ${fileResponse?.error || '不明なエラー'}`);
          setIsLoadingWaveform(false);
          return null;
        }
        
        // JSONデータを解析
        try {
          const parsedData = JSON.parse(fileResponse.data);
          Logger.debug('WaveformContext', '波形ファイル読み込み成功', {
            dataType: typeof parsedData,
            hasWaveform: parsedData && !!parsedData.waveform,
            hasDuration: parsedData && !!parsedData.duration
          });
          
          // 波形データを抽出
          const waveform = extractWaveformData(parsedData);
          
          // データ検証
          if (!waveform || waveform.length === 0) {
            Logger.error('WaveformContext', '無効な波形データ', { 
              taskId,
              filePath: filePath
            });
            setError('波形データの形式が無効です');
            setIsLoadingWaveform(false);
            return null;
          }
          
          // 有効な波形データを設定
          setWaveformData(waveform);
          setIsLoadingWaveform(false);
          Logger.info('WaveformContext', '波形データ読み込み完了', { 
            taskId,
            dataPoints: waveform.length
          });
          
          return waveform;
        } catch (parseError) {
          Logger.error('WaveformContext', '波形ファイルのJSONパースエラー', { 
            error: parseError, 
            filePath 
          });
          setError('波形データの解析に失敗しました');
          setIsLoadingWaveform(false);
          return null;
        }
      } catch (fileError) {
        Logger.error('WaveformContext', '波形ファイルの読み込みエラー', { 
          error: fileError, 
          filePath 
        });
        setError('波形ファイルの読み込み中にエラーが発生しました');
        setIsLoadingWaveform(false);
        return null;
      }
    } catch (error) {
      Logger.error('WaveformContext', '波形データ取得中にエラーが発生しました', { error });
      setError('波形データ取得中にエラーが発生しました');
      setIsLoadingWaveform(false);
      return null;
    }
  }, [extractWaveformData]);

  /**
   * メディアファイル用の波形データを生成
   * @param {string} mediaPath - メディアファイルのパス
   * @returns {Promise<string | null>} - 生成されたタスクのIDまたはnull
   */
  const generateWaveform = useCallback(async (mediaPath) => {
    if (!mediaPath) {
      Logger.error('WaveformContext', '波形生成: メディアパスが指定されていません');
      return null;
    }

    try {
      Logger.info('WaveformContext', '波形生成開始', { mediaPath });
      
      setIsLoadingWaveform(true);
      setError(null);
      
      // タスク作成パラメータ
      const taskType = 'waveform';
      const params = { mediaPath };
      
      Logger.debug('WaveformContext', 'タスク作成リクエスト', { taskType, params });
      
      const response = await window.api.invoke('create-task', taskType, params);
      
      // エラーハンドリング
      if (!response || !response.success) {
        Logger.error('WaveformContext', '波形タスク作成失敗', { response });
        setError(`波形生成に失敗しました: ${response?.error || '不明なエラー'}`);
        setIsLoadingWaveform(false);
        return null;
      }
      
      // 成功レスポンスの処理
      const taskId = response.taskId;
      Logger.info('WaveformContext', '波形タスク作成成功', { taskId });
      
      // taskIdの検証
      if (!taskId) {
        Logger.error('WaveformContext', 'タスクID取得失敗', { response });
        setError('タスクIDが取得できませんでした');
        setIsLoadingWaveform(false);
        return null;
      }
      
      // タスクIDを保存
      setWaveformTaskId(taskId);
      
      return taskId;
    } catch (error) {
      Logger.error('WaveformContext', '波形生成リクエスト中にエラーが発生しました', error);
      setError('波形生成リクエスト中にエラーが発生しました');
      setIsLoadingWaveform(false);
      return null;
    }
  }, []);

  /**
   * メディアファイル用の波形データを取得または生成
   * @param {MediaFile} media - メディアファイル
   * @returns {Promise<string | null>} - 波形タスクIDまたはnull
   */
  const getWaveformForMedia = useCallback(async (media: MediaFile | MediaFileWithTaskIds) => {
    if (!media || !media.path) {
      Logger.error('WaveformContext', '波形取得: メディアが指定されていません');
      return null;
    }

    try {
      Logger.info('WaveformContext', 'メディア用の波形データ取得開始', { 
        mediaId: media.id,
        mediaPath: media.path 
      });
      
      // 既に波形タスクIDがある場合はそれを使用
      let taskId = null;
      
      if ('waveformTaskId' in media && media.waveformTaskId) {
        taskId = media.waveformTaskId;
        Logger.debug('WaveformContext', '既存の波形タスクIDを使用', { taskId });
      } else {
        // 波形タスクIDがない場合は新しく生成
        taskId = await generateWaveform(media.path);
        Logger.debug('WaveformContext', '新しい波形タスクを生成', { taskId });
      }
      
      if (!taskId) {
        Logger.error('WaveformContext', '波形タスクIDが取得できませんでした');
        return null;
      }
      
      // タスクIDを保存
      setWaveformTaskId(taskId);
      
      // 波形データを取得（非同期）
      await fetchWaveformData(taskId);
      return taskId;
    } catch (error) {
      Logger.error('WaveformContext', '波形生成処理中にエラーが発生しました', error);
      setError('波形生成処理中にエラーが発生しました');
      setIsLoadingWaveform(false);
    }

    return null;
  }, [generateWaveform, fetchWaveformData]);

  // タスク更新イベントのリスナー設定
  useEffect(() => {
    if (!window.api || !window.api.onTasksUpdated) {
      Logger.error('WaveformContext', 'タスク更新APIが利用できません');
      return;
    }

    // タスク更新イベントのリスナー関数
    const handleTasksUpdated = (data: { tasks: any[] }) => {
      try {
        const tasks = data.tasks;
        // 波形タスクの更新を探す
        const waveformTasks = tasks.filter(task => task && task.type === 'waveform');
        
        if (waveformTasks.length === 0) {
          return; // 波形タスクの更新なし
        }
        
        Logger.debug('WaveformContext', '波形タスク更新通知', {
          tasksCount: waveformTasks.length,
          currentTaskId: waveformTaskId
        });
        
        // 現在追跡中のタスクが更新されたか確認
        if (waveformTaskId) {
          const currentTask = waveformTasks.find(task => task.id === waveformTaskId);
          
          if (currentTask) {
            Logger.debug('WaveformContext', '追跡中のタスク更新', {
              taskId: currentTask.id,
              status: currentTask.status
            });
            
            if (currentTask.status === 'completed') {
              Logger.info('WaveformContext', '波形タスク完了を検出', { taskId: currentTask.id });
              
              // 完了したタスクから波形データを取得
              // 非同期関数なので即時実行関数でラップ
              (async () => {
                await fetchWaveformData(currentTask.id);
              })().catch(err => {
                Logger.error('WaveformContext', '波形データ取得エラー', err);
              });
            } else if (currentTask.status === 'failed') {
              Logger.error('WaveformContext', '波形タスク失敗', {
                taskId: currentTask.id,
                error: currentTask.error || '不明なエラー'
              });
              
              setError(`波形生成に失敗しました: ${currentTask.error || '不明なエラー'}`);
              setIsLoadingWaveform(false);
            }
          }
        }
      } catch (error) {
        Logger.error('WaveformContext', 'タスク更新ハンドラーエラー', error);
      }
    };

    // リスナー登録
    window.api.onTasksUpdated(handleTasksUpdated);
    Logger.debug('WaveformContext', 'タスク更新リスナーを登録しました');

    // クリーンアップ関数
    return () => {
      try {
        // APIによって提供されるunsubscribe/offメソッドがある場合はそれを使用
        // 具体的な実装はAPI仕様に依存
        if (window.api.off && typeof window.api.off === 'function') {
          window.api.off('tasks-updated', handleTasksUpdated);
          Logger.debug('WaveformContext', 'タスク更新リスナーを削除しました');
        }
      } catch (error) {
        Logger.error('WaveformContext', 'リスナー削除エラー', error);
      }
    };
  }, [waveformTaskId, fetchWaveformData]);

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
