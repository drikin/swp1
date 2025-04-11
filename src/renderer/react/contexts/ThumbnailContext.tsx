import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { MediaFileWithTaskIds } from '../types/media';
import { ThumbnailGenerateParams, ThumbnailGenerateResponse } from '../types/media';
import { Logger } from '../utils/logger';

// 処理済みメディアのグローバルキャッシュ (コンポーネントのマウント/アンマウントに影響されない)
const PROCESSED_MEDIA_CACHE = new Map<string, string>();
const MEDIA_PROCESSING = new Set<string>();

interface ThumbnailContextState {
  thumbnailUrl: string | null;
  thumbnailTaskId: string | null;
  isLoadingThumbnail: boolean;
  error: string | null;
}

interface ThumbnailContextActions {
  generateThumbnail: (params: ThumbnailGenerateParams) => Promise<string | null>;
  getThumbnailForMedia: (media: MediaFileWithTaskIds, timePosition?: number) => Promise<string | null>;
  fetchThumbnailData: (taskId: string) => Promise<any | null>;
  resetError: () => void;
}

type ThumbnailContextValue = ThumbnailContextState & ThumbnailContextActions;

const defaultThumbnailContextValue: ThumbnailContextValue = {
  thumbnailUrl: null,
  thumbnailTaskId: null,
  isLoadingThumbnail: false,
  error: null,
  
  generateThumbnail: async () => null,
  getThumbnailForMedia: async () => null,
  fetchThumbnailData: async () => null,
  resetError: () => {}
};

// コンテキスト作成
const ThumbnailContext = createContext<ThumbnailContextValue>(defaultThumbnailContextValue);

/**
 * サムネイル管理プロバイダーコンポーネント
 */
export const ThumbnailProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  console.log('新しいThumbnailProviderが初期化されました - v3.0 [グローバルキャッシュ採用]');
  
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailTaskId, setThumbnailTaskId] = useState<string | null>(null);
  const [isLoadingThumbnail, setIsLoadingThumbnail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 前回の処理が完了していることを確認するためのRef
  const lastProcessedMedia = useRef<string | null>(null);

  // pathToSecureFileUrlヘルパー関数を追加
  const pathToSecureFileUrl = (filePath: string): string => {
    if (!filePath) return '';
    
    console.log('[ThumbnailContext] 元のパス:', filePath);
    
    // fileプロトコルから始まる場合は変換
    if (filePath.startsWith('file://')) {
      filePath = filePath.slice(7);
    }
    
    // Windows対応（バックスラッシュをスラッシュに変換）
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    try {
      // URLエンコードを適切に適用
      const encodedPath = encodeURIComponent(normalizedPath)
        .replace(/%2F/g, '/') // スラッシュはそのまま
        .replace(/%20/g, ' '); // 可読性のためにスペースを戻す（任意）
      
      const secureUrl = `secure-file://${encodedPath}`;
      console.log('[ThumbnailContext] 変換後URL:', secureUrl);
      return secureUrl;
    } catch (error) {
      console.error('[ThumbnailContext] URL変換エラー:', error);
      return `secure-file://${normalizedPath}`;
    }
  };

  /**
   * エラー状態をリセットする関数
   */
  const resetError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * サムネイル生成タスクを開始する関数
   * @param params サムネイル生成パラメータ
   */
  const generateThumbnail = useCallback(async (params: ThumbnailGenerateParams) => {
    if (!window.api || !window.api.invoke) {
      Logger.error('ThumbnailContext', 'API が利用できません');
      setError('サムネイル生成APIが利用できません');
      return null;
    }

    if (!params.path) {
      Logger.error('ThumbnailContext', 'メディアパスがありません');
      setError('メディアファイルが指定されていません');
      return null;
    }

    console.log(`[ThumbnailContext.generateThumbnail] 開始: パス=${params.path}`, params);
    
    try {
      // サムネイル生成タスクを開始
      console.log(`[ThumbnailContext.generateThumbnail] API呼び出し前: generate-thumbnail`, params);
      
      const response: ThumbnailGenerateResponse = await window.api.invoke('generate-thumbnail', params);
      console.log(`[ThumbnailContext.generateThumbnail] API呼び出し結果:`, response);
      
      if (response && response.taskId) {
        return response.taskId;
      } else if (response && response.filePath) {
        // ファイルパスをURLに変換（スペースを含むパス対応）
        const fileUrl = pathToSecureFileUrl(response.filePath);
        console.log('[ThumbnailContext] 生成されたサムネイルURL:', fileUrl);
        return fileUrl;
      } else {
        Logger.error('ThumbnailContext', 'サムネイル生成失敗', response);
        setError('サムネイル生成に失敗しました');
        return null;
      }
    } catch (error) {
      Logger.error('ThumbnailContext', 'サムネイル生成エラー', error);
      setError('サムネイル生成中にエラーが発生しました');
      return null;
    }
  }, []);

  /**
   * サムネイルタスクの状態とデータを取得する関数
   * @param taskId タスクID
   */
  const fetchThumbnailData = useCallback(async (taskId: string) => {
    if (!window.api || !window.api.invoke) {
      console.error('[ThumbnailContext] APIが利用できません');
      return null;
    }
    
    if (!taskId) {
      console.error('[ThumbnailContext] タスクIDが指定されていません');
      return null;
    }
    
    try {
      console.log(`[ThumbnailContext] タスク結果取得開始: ${taskId}`);
      const response = await window.api.invoke('get-task-result', taskId);
      console.log(`[ThumbnailContext] タスク結果: `, response);
      
      if (response && response.success && response.data) {
        console.log(`[ThumbnailContext] タスクデータ: `, response.data);
        return response.data;
      }
      
      console.warn(`[ThumbnailContext] タスク結果が無効: ${taskId}`);
      return null;
    } catch (error) {
      console.error(`[ThumbnailContext] タスク結果取得エラー: ${taskId}`, error);
      return null;
    }
  }, []);

  /**
   * メディアのサムネイルを生成または取得する関数
   * @param media メディアオブジェクト
   * @param timePosition 秒単位のタイムスタンプ（オプション）
   */
  const getThumbnailForMedia = useCallback(async (media: MediaFileWithTaskIds, timePosition?: number) => {
    if (!media || !media.path) {
      console.error('[ThumbnailContext] メディアまたはパスが無効です');
      return null;
    }

    // 既に処理中なら早期リターン
    if (MEDIA_PROCESSING.has(media.id)) {
      console.log(`[ThumbnailContext] メディア ${media.id} は既に処理中のためスキップ`);
      return null;
    }

    // キャッシュ確認
    if (PROCESSED_MEDIA_CACHE.has(media.id)) {
      const cachedUrl = PROCESSED_MEDIA_CACHE.get(media.id) || null;
      console.log(`[ThumbnailContext] メディア ${media.id} はキャッシュに存在:`, cachedUrl);
      return cachedUrl;
    }

    try {
      // 処理中マーク
      MEDIA_PROCESSING.add(media.id);
      
      // 1. タスクIDがある場合、そのタスクの結果を取得
      if (media.thumbnailTaskId) {
        console.log(`[ThumbnailContext] 既存タスクからサムネイル取得: ${media.thumbnailTaskId}`);
        const taskData = await fetchThumbnailData(media.thumbnailTaskId);
        
        if (taskData && taskData.filePath) {
          console.log(`[ThumbnailContext] 既存タスク成功 - ファイルパス:`, taskData.filePath);
          const url = pathToSecureFileUrl(taskData.filePath);
          console.log(`[ThumbnailContext] 変換後URL:`, url);
          PROCESSED_MEDIA_CACHE.set(media.id, url);
          MEDIA_PROCESSING.delete(media.id);
          return url;
        } else {
          console.warn(`[ThumbnailContext] 既存タスクにファイルパスがありません: ${media.thumbnailTaskId}`);
        }
      }
      
      // 2. 既存タスクの検索
      try {
        console.log(`[ThumbnailContext] メディアパスのタスク検索: ${media.path}`);
        const existingTasks = await window.api.invoke('find-tasks-by-media', media.path, 'thumbnail');
        console.log(`[ThumbnailContext] 既存タスク検索結果:`, existingTasks);
        
        if (existingTasks && existingTasks.success && existingTasks.tasks?.length > 0) {
          const completedTask = existingTasks.tasks.find(t => t.status === 'completed');
          
          if (completedTask) {
            console.log(`[ThumbnailContext] 完了済みタスク発見: ${completedTask.id}`);
            const taskData = await fetchThumbnailData(completedTask.id);
            
            if (taskData && taskData.filePath) {
              console.log(`[ThumbnailContext] タスクデータのファイルパス:`, taskData.filePath);
              const url = pathToSecureFileUrl(taskData.filePath);
              console.log(`[ThumbnailContext] 変換後URL:`, url);
              PROCESSED_MEDIA_CACHE.set(media.id, url);
              MEDIA_PROCESSING.delete(media.id);
              return url;
            } else {
              console.warn(`[ThumbnailContext] 完了済みタスクにファイルパスがありません: ${completedTask.id}`);
            }
          } else {
            console.log(`[ThumbnailContext] 完了済みタスクがありません`);
          }
        } else {
          console.log(`[ThumbnailContext] 既存タスクがありません:`, existingTasks);
        }
      } catch (err) {
        console.error(`[ThumbnailContext] タスク検索エラー:`, err);
        // タスク検索でエラーが発生しても続行（新規生成へ）
      }
      
      // 3. 新規タスク生成
      const params: ThumbnailGenerateParams = {
        path: media.path,
        timePosition: timePosition ?? (media.duration ? media.duration / 2 : 0),
        width: 320
      };
      
      console.log('[ThumbnailContext] サムネイル生成開始:', params);
      const result = await generateThumbnail(params);
      console.log('[ThumbnailContext] サムネイル生成結果:', result);
      
      if (result) {
        // 結果がURLでない場合はタスクIDの可能性があるため、タスク情報を取得
        if (!result.startsWith('file://') && !result.startsWith('secure-file://')) {
          console.log('[ThumbnailContext] タスクIDからファイル情報を取得:', result);
          
          // タスクIDを保存しておく（mediaオブジェクトが外部で更新される場合）
          // if (onUpdateMedia && media.id) {
          //   onUpdateMedia(media.id, { thumbnailTaskId: result });
          // }
          
          // 結果が返ってくるまで少し待機（非同期処理の完了を待つ）
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          try {
            const taskData = await fetchThumbnailData(result);
            if (taskData && taskData.filePath) {
              // ファイルパスをURLに変換
              const fileUrl = pathToSecureFileUrl(taskData.filePath);
              console.log('[ThumbnailContext] 取得したサムネイルURL:', fileUrl);
              // キャッシュに保存
              PROCESSED_MEDIA_CACHE.set(media.id, fileUrl);
              MEDIA_PROCESSING.delete(media.id);
              return fileUrl;
            } else {
              console.warn('[ThumbnailContext] タスクデータにファイルパスがありません');
            }
          } catch (err) {
            console.error('[ThumbnailContext] タスクデータ取得エラー:', err);
          }
          
          // タスクIDを返す（後でポーリングできるように）
          MEDIA_PROCESSING.delete(media.id);
          return result;
        }
        
        // 既にURLの場合は、そのまま返す
        console.log('[ThumbnailContext] 有効なURL:', result);
        PROCESSED_MEDIA_CACHE.set(media.id, result);
        MEDIA_PROCESSING.delete(media.id);
        return result;
      } else {
        console.warn('[ThumbnailContext] サムネイル生成結果がnullです');
      }
    } catch (error) {
      console.error('[ThumbnailContext] サムネイル取得エラー:', error);
    } finally {
      // 確実に処理中マークを解除
      MEDIA_PROCESSING.delete(media.id);
    }
    
    console.warn('[ThumbnailContext] サムネイル取得失敗 - null返却');
    return null;
  }, [generateThumbnail, fetchThumbnailData]);

  // コンテキスト値を作成して返す
  const contextValue = {
    thumbnailUrl,
    thumbnailTaskId,
    isLoadingThumbnail,
    error,
    generateThumbnail,
    getThumbnailForMedia,
    fetchThumbnailData,
    resetError
  };

  return (
    <ThumbnailContext.Provider value={contextValue}>
      {children}
    </ThumbnailContext.Provider>
  );
};

/**
 * サムネイルコンテキストを使用するためのカスタムフック
 */
export const useThumbnail = () => useContext(ThumbnailContext);

export default ThumbnailContext;
