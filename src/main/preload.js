const { contextBridge, ipcRenderer } = require('electron');

// デバッグログ
console.log('Preload script executing...');

// CSP設定を変更するためのメタタグを追加
// データURLからの画像読み込みを許可する
document.addEventListener('DOMContentLoaded', () => {
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = "default-src 'self'; img-src 'self' data: blob: file:; script-src 'self'; style-src 'self' 'unsafe-inline';";
  document.head.appendChild(meta);
});

// APIを公開
try {
  // 許可するチャンネルリスト
  const validInvokeChannels = [
    'open-file-dialog',
    'open-directory-dialog',
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
    
    // 新しいタスク管理システムのAPI（追加）
    'create-task',         // 新規タスク作成
    'get-task-result',     // タスク結果取得
    'find-tasks-by-media', // メディアパスからタスク検索
    'get-task-types',      // タスク種類一覧取得
    'clean-tasks-history'  // 古いタスク履歴をクリア
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
          // サムネイル生成イベントの詳細なログ出力
          if (channel === 'thumbnail-generated') {
            console.log('サムネイル生成イベント受信(preload):', JSON.stringify(args, null, 2));
            
            // データの形式を確認
            const data = args[0];
            if (data && data.filePath && typeof data.filePath === 'string') {
              // シンプルにfile://プロトコルを追加
              console.log('サムネイルファイルパスを変換:', data.filePath);
              data.filePath = `file://${data.filePath}`;
            }
          }
          
          // コールバック関数を呼び出す
          callback(...args);
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
          return `file://${result}`;
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
                          resolve(`file://${taskResult.data.filePath}`);
                        } else {
                          console.error('タスク結果にfilePath属性がありません:', taskResult.data);
                          reject(new Error('タスク結果にファイルパスがありません'));
                        }
                      } 
                      // データが文字列の場合は直接使用（後方互換性）
                      else if (typeof taskResult.data === 'string') {
                        console.log('タスク結果が文字列です:', taskResult.data);
                        resolve(`file://${taskResult.data}`);
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
    measureLoudness: (filePath) => {
      console.log(`ラウドネス測定リクエスト: ${filePath}`);
      return ipcRenderer.invoke('measure-loudness', filePath);
    },
    
    // 新しいFFmpegタスク管理関数
    getFFmpegTaskStatus: (taskId) => ipcRenderer.invoke('ffmpeg-task-status', taskId),
    cancelFFmpegTask: (taskId) => ipcRenderer.invoke('ffmpeg-task-cancel', taskId),
    
    // ファイル操作関連
    openFileDialog: (paths) => ipcRenderer.invoke('open-file-dialog', paths),
    openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),
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
    
    // 波形データ関連メソッド
    getWaveformData: (taskId) => {
      console.log(`波形データ取得リクエスト: ${taskId}`);
      return ipcRenderer.invoke('get-waveform-data', taskId);
    },
    
    // 新しいタスク管理システムのAPI（追加）
    createTask: (taskType, options) => ipcRenderer.invoke('create-task', taskType, options),
    getTaskResult: (taskId) => ipcRenderer.invoke('get-task-result', taskId),
    findTasksByMedia: (mediaPath) => ipcRenderer.invoke('find-tasks-by-media', mediaPath),
    getTaskTypes: () => ipcRenderer.invoke('get-task-types'),
    cleanTasksHistory: () => ipcRenderer.invoke('clean-tasks-history')
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

// タスク管理APIをレンダラープロセスに公開
contextBridge.exposeInMainWorld('taskManager', {
  // タスク一覧を取得
  getTasks: () => ipcRenderer.invoke('get-task-list'),
  
  // タスクをキャンセル
  cancelTask: (taskId) => ipcRenderer.invoke('cancel-task', taskId),
  
  // タスクの詳細情報を取得
  getTaskById: (taskId) => ipcRenderer.invoke('get-task-status', taskId),
  
  // 新しいタスクを作成（新システムAPI）
  createTask: (type, options) => ipcRenderer.invoke('create-task', type, options),
  
  // タスク結果を取得（新システムAPI）
  getTaskResult: (taskId) => ipcRenderer.invoke('get-task-result', taskId),
  
  // メディアパスに関連するタスクを検索（新システムAPI）
  findTasksByMedia: (mediaPath, type) => ipcRenderer.invoke('find-tasks-by-media', mediaPath, type),
  
  // タスク履歴をクリア（新システムAPI）
  cleanTasksHistory: () => ipcRenderer.invoke('clean-tasks-history'),
  
  // タスク更新の購読
  onTasksUpdated: (callback) => {
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on('tasks-updated', subscription);
    return () => {
      ipcRenderer.removeListener('tasks-updated', subscription);
    };
  }
});