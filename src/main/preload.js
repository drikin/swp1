// プリロードスクリプト
const { contextBridge, ipcRenderer } = require('electron');

// デバッグログ
console.log('Preload script executing...');

// ファイルパスをsecure-fileプロトコルURLに変換する関数
function pathToSecureFileUrl(filePath) {
  if (!filePath) return '';
  // 正規化されたパスを作成
  const normalizedPath = filePath.replace(/\\/g, '/');
  // secure-fileプロトコルURLを返す
  return `secure-file://${normalizedPath}`;
}

// CSP設定を変更するためのメタタグを追加
// データURLからの画像読み込みを許可する
document.addEventListener('DOMContentLoaded', () => {
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = "default-src 'self'; img-src 'self' data: blob: file: secure-file:; script-src 'self'; style-src 'self' 'unsafe-inline';";
  document.head.appendChild(meta);
});

// APIを公開
try {
  // 許可するチャンネルリスト
  const validInvokeChannels = [
    'open-file-dialog',
    'open-directory-dialog',
    'open-file-or-directory-dialog', // 新しいファイル/フォルダー選択ダイアログ
    'get-desktop-path',
    'check-ffmpeg',
    'get-media-info',
    'generate-waveform',
    'generate-thumbnail',
    'export-combined-video',
    'measure-loudness',
    'ffmpeg-task-status',  // 新しいFFmpegタスクステータス確認用チャンネル
    'ffmpeg-task-cancel',  // 新しいFFmpegタスクキャンセル用チャンネル
    'get-task-list',       // タスクリスト取得用チャンネル
    'cancel-task',         // タスクキャンセル用チャンネル
    'get-task-status',     // タスク状態取得用チャンネル
    'get-task-id-by-media-path', // メディアパスからタスクID取得用チャンネル
    'get-waveform-data',   // 波形データ取得用チャンネル
    'read-file',           // ファイル読み込み用チャンネル
    
    // 新しいタスク管理システムのAPI（追加）
    'create-task',         // 新規タスク作成
    'get-task-result',     // タスク結果取得
    'find-tasks-by-media', // メディアパスからタスク検索
    'get-task-types',      // タスク種類一覧取得
    'clean-tasks-history', // 古いタスク履歴をクリア
    
    // フォルダ再帰検索用API（追加）
    'get-path-stats',      // パス情報取得（ファイルかフォルダかの判定）
    'scan-folder-for-media' // フォルダ内のメディアファイルを再帰的に検索
  ];
  
  const validEventChannels = [
    'task-status',
    'progress-update',
    'export-progress', 
    'thumbnail-generated',
    'loudness-measured',
    'loudness-error',
    'ffmpeg-task-progress', // 新しいFFmpegタスク進捗通知用チャンネル
    'tasks-updated',        // タスク一覧更新通知用チャンネル
    
    // 新しいタスク管理システムのイベント（追加）
    'task-progress',        // 個別タスクの進捗通知
    'task-completed',       // タスク完了通知
    'task-failed',          // タスク失敗通知
    'task-cancelled'        // タスクキャンセル通知
  ];
  
  // 統合されたAPIオブジェクトを作成
  contextBridge.exposeInMainWorld('api', {
    // 非同期通信用のメソッド
    invoke: (channel, ...args) => {
      // 許可されたチャンネルのみ通信を許可
      if (validInvokeChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      
      // 許可されていないチャンネルの場合はエラー
      throw new Error(`通信チャンネル "${channel}" は許可されていません`);
    },
    
    // イベントリスナー登録
    on: (channel, callback) => {
      console.log(`イベントリスナー登録: ${channel}`);
      // 許可されたチャンネルのみリスナー登録を許可
      if (validEventChannels.includes(channel)) {
        // ラッパー関数を作成して、元のイベントデータを処理
        const subscription = (event, ...args) => {
          // 詳細なイベントログを追加（全イベント共通）
          console.log(`イベント受信 (${channel}): ${JSON.stringify(args[0])}`);

          // サムネイル生成イベントの詳細なログ出力
          if (channel === 'thumbnail-generated') {
            console.log('サムネイル生成イベント受信(preload):', JSON.stringify(args, null, 2));
            
            // データの形式を確認
            const data = args[0];
            if (data && data.filePath && typeof data.filePath === 'string') {
              // secure-fileプロトコルを追加
              console.log('サムネイルファイルパスを変換:', data.filePath);
              data.filePath = pathToSecureFileUrl(data.filePath);
            }
          }
          
          // ラウドネス測定イベントの詳細なログ出力
          if (channel === 'loudness-measured') {
            console.log('🔊 ラウドネス測定イベント受信(preload):', JSON.stringify(args, null, 2));
            
            // 形式を確認し必要なら加工
            const data = args[0];
            if (data && data.loudness) {
              console.log('ラウドネスデータが存在します:', JSON.stringify(data.loudness, null, 2));
            } else {
              console.warn('❌ ラウドネスデータが不足しています');
            }
          }
          
          // コールバック関数を呼び出す
          console.log(`コールバック関数を呼び出します: ${channel}`);
          try {
            callback(...args);
            console.log(`コールバック関数呼び出し成功: ${channel}`);
          } catch (error) {
            console.error(`コールバック関数呼び出しエラー: ${channel}`, error);
          }
        };
        
        ipcRenderer.on(channel, subscription);
        
        // 登録解除用の関数を返す
        return () => {
          console.log(`イベントリスナー解除: ${channel}`);
          ipcRenderer.removeListener(channel, subscription);
        };
      }
      
      // 許可されていないチャンネルの場合はエラー
      throw new Error(`イベントチャンネル "${channel}" は許可されていません`);
    },
    
    // イベントリスナー削除
    off: (channel, callback) => {
      console.log(`イベントリスナー削除: ${channel}`);
      // 許可されたチャンネルのみリスナー削除を許可
      if (validEventChannels.includes(channel)) {
        ipcRenderer.removeListener(channel, callback);
        return true;
      }
      
      // 許可されていないチャンネルの場合はエラー
      throw new Error(`イベントチャンネル "${channel}" は許可されていません`);
    },
    
    // FFmpeg関連関数
    checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
    getMediaInfo: (filePath) => ipcRenderer.invoke('get-media-info', filePath),
    generateWaveform: (filePath, outputPath) => ipcRenderer.invoke('generate-waveform', filePath, outputPath),
    generateThumbnail: (pathOrOptions, fileId) => {
      // 適切なパラメータフォーマットに変換
      let params;
      if (typeof pathOrOptions === 'string') {
        // 個別のパラメータとして呼び出された場合
        params = { 
          filePath: pathOrOptions, 
          fileId: fileId 
        };
      } else {
        // オブジェクトとして呼び出された場合
        params = pathOrOptions;
      }
      
      console.log('サムネイル生成リクエスト(preload):', params);
      
      return ipcRenderer.invoke('generate-thumbnail', params).then(result => {
        console.log('サムネイル生成結果(preload):', result);
        
        // 単純な文字列（ファイルパス）の場合
        if (typeof result === 'string') {
          console.log('ファイルパスを返します:', result);
          return pathToSecureFileUrl(result);
        }
        
        // ペンディング状態のタスクの場合
        if (result && result.taskId && result.pending) {
          console.log('タスク待機が必要:', result.taskId);
          
          // タスク完了を待機する関数
          const waitForTaskCompletion = (taskId) => {
            return new Promise((resolve, reject) => {
              console.log('タスク完了を待機中:', taskId);
              
              // タスク結果を取得
              const getTaskResult = () => {
                console.log('タスク状態をチェック:', taskId);
                return ipcRenderer.invoke('get-task-result', taskId)
                  .then(taskResult => {
                    console.log('タスク結果:', taskResult);
                    
                    if (taskResult.success) {
                      // タスク完了、結果を返す
                      console.log('タスク完了:', taskId, 'データ:', taskResult.data);
                      
                      // データがオブジェクトの場合はfilePathプロパティを取得
                      if (taskResult.data && typeof taskResult.data === 'object') {
                        if (taskResult.data.filePath) {
                          console.log('タスク結果からファイルパスを取得:', taskResult.data.filePath);
                          resolve(pathToSecureFileUrl(taskResult.data.filePath));
                        } else {
                          console.error('タスク結果にfilePath属性がありません:', taskResult.data);
                          reject(new Error('タスク結果にファイルパスがありません'));
                        }
                      } 
                      // データが文字列の場合は直接使用（後方互換性）
                      else if (typeof taskResult.data === 'string') {
                        console.log('タスク結果が文字列です:', taskResult.data);
                        resolve(pathToSecureFileUrl(taskResult.data));
                      }
                      else {
                        console.error('無効なタスク結果データ形式:', taskResult.data);
                        reject(new Error('タスク結果にファイルパスがありません'));
                      }
                    } else if (taskResult.status === 'error') {
                      // タスクエラー
                      reject(new Error(`タスクエラー: ${taskResult.error || '不明なエラー'}`));
                    } else {
                      // まだ完了していない
                      console.log('タスクはまだ完了していません。再試行します...');
                      // 1秒後に再試行
                      setTimeout(getTaskResult, 1000);
                    }
                  })
                  .catch(error => {
                    console.error('タスク結果取得エラー:', error);
                    reject(error);
                  });
              };
              
              // 初回チェック
              getTaskResult();
            });
          };
          
          // タスク完了を待機して結果を返す
          return waitForTaskCompletion(result.taskId);
        }
        
        // その他のケース（エラーなど）
        console.warn('不明な結果形式:', result);
        return result;
      });
    },
    exportCombinedVideo: (options) => ipcRenderer.invoke('export-combined-video', options),
    measureLoudness: (filePath, fileId) => {
      // 適切なパラメータフォーマットに変換
      let params;
      if (typeof filePath === 'string') {
        // 個別のパラメータとして呼び出された場合
        params = filePath;
        // fileIdがある場合は新しい形式に統一
        if (fileId) {
          params = { 
            filePath: filePath, 
            fileId: fileId 
          };
        }
      } else {
        // オブジェクトとして呼び出された場合
        params = filePath;
      }
      
      console.log('ラウドネス測定リクエスト(preload):', params);
      
      return ipcRenderer.invoke('measure-loudness', params).then(result => {
        console.log('ラウドネス測定結果(preload):', result);
        
        // 単純なオブジェクト（測定結果）の場合
        if (result && (result.integrated_loudness !== undefined || 
            (result.success && result.data && result.data.integrated_loudness !== undefined))) {
          console.log('ラウドネス測定結果を直接返します');
          return result.data || result;
        }
        
        // ペンディング状態のタスクの場合
        if (result && result.taskId) {
          console.log('タスク待機が必要:', result.taskId);
          
          // タスク完了を待機する関数
          const waitForTaskCompletion = (taskId) => {
            return new Promise((resolve, reject) => {
              console.log('タスク完了を待機中:', taskId);
              
              // タスク結果を取得
              const getTaskResult = () => {
                console.log('タスク状態をチェック:', taskId);
                return ipcRenderer.invoke('get-task-result', taskId)
                  .then(taskResult => {
                    console.log('タスク結果:', taskResult);
                    
                    if (taskResult.success && taskResult.data) {
                      // タスク完了、結果を返す
                      console.log('タスク完了:', taskId, 'データ:', taskResult.data);
                      resolve(taskResult.data);
                    } else if (taskResult.status === 'error') {
                      // タスクエラー
                      reject(new Error(`タスクエラー: ${taskResult.error || '不明なエラー'}`));
                    } else {
                      // まだ完了していない
                      console.log('タスクはまだ完了していません。再試行します...');
                      // 1秒後に再試行
                      setTimeout(getTaskResult, 1000);
                    }
                  })
                  .catch(error => {
                    console.error('タスク結果取得エラー:', error);
                    reject(error);
                  });
              };
              
              // 初回チェック
              getTaskResult();
            });
          };
          
          // タスク完了を待機して結果を返す
          return waitForTaskCompletion(result.taskId);
        }
        
        // その他のケース（エラーなど）
        console.warn('不明な結果形式:', result);
        return result;
      });
    },
    
    // 新しいFFmpegタスク管理関数
    getFFmpegTaskStatus: (taskId) => ipcRenderer.invoke('ffmpeg-task-status', taskId),
    cancelFFmpegTask: (taskId) => ipcRenderer.invoke('ffmpeg-task-cancel', taskId),
    
    // ファイル操作関連
    openFileDialog: (paths) => ipcRenderer.invoke('open-file-dialog', paths),
    openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),
    openFileOrDirectoryDialog: () => ipcRenderer.invoke('open-file-or-directory-dialog'), // 新しいファイル/フォルダー選択ダイアログ
    getDesktopPath: () => ipcRenderer.invoke('get-desktop-path'),
    
    // タスク関連メソッド
    getTaskStatus: (taskId) => {
      console.log(`タスク状態の取得: ${taskId}`);
      return ipcRenderer.invoke('get-task-status', taskId);
    },
    getTaskIdByMediaPath: (mediaPath, taskType) => {
      console.log(`メディアパスからタスクID取得: ${mediaPath}, タイプ: ${taskType}`);
      return ipcRenderer.invoke('get-task-id-by-media-path', mediaPath, taskType);
    },
    getTaskList: () => {
      console.log('タスク一覧取得リクエスト');
      return ipcRenderer.invoke('get-task-list');
    },
    
    // 波形データ関連メソッド
    getWaveformData: (taskId) => {
      console.log(`波形データ取得リクエスト: ${taskId}`);
      return ipcRenderer.invoke('get-waveform-data', taskId);
    },
    
    // 新しいタスク管理システムのAPI（追加）
    createTask: (taskType, options) => ipcRenderer.invoke('create-task', taskType, options),
    getTaskResult: (taskId) => ipcRenderer.invoke('get-task-result', taskId),
    findTasksByMedia: (mediaPath, taskType) => ipcRenderer.invoke('find-tasks-by-media', mediaPath, taskType),
    getTaskTypes: () => ipcRenderer.invoke('get-task-types'),
    cleanTasksHistory: () => ipcRenderer.invoke('clean-tasks-history'),
    
    // タスク更新イベントリスナー関連メソッド
    onTasksUpdated: (callback) => {
      console.log('イベントリスナー登録: tasks-updated');
      ipcRenderer.on('tasks-updated', (event, data) => {
        callback(data);
      });
    },
    removeTasksUpdatedListener: (callback) => {
      console.log('イベントリスナー解除: tasks-updated');
      ipcRenderer.removeListener('tasks-updated', callback);
    }
  });
  
  console.log('API successfully exposed to renderer via contextBridge');
} catch (error) {
  console.error('Failed to expose API to renderer:', error);
}

// バージョン情報
contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron
}); 

// 暗号化機能をレンダラープロセスに安全に公開
contextBridge.exposeInMainWorld('nodeCrypto', {
  // UUIDの生成（crypto依存なし）
  generateUUID: () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
});