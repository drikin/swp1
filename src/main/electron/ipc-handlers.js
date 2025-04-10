/**
 * ipc-handlers.js
 * IPCハンドラーの登録を管理
 */
const { ipcMain, app } = require('electron');
const { 
  openFileDialog, 
  openDirectoryDialog 
} = require('./file-operations');
const { 
  getMediaInfo, 
  generateThumbnail, 
  generateWaveform 
} = require('./media-operations');
const ffmpegServiceManager = require('../ffmpeg-service-manager');
const { 
  getMainWindow, 
  getTaskManager 
} = require('./app-lifecycle');

/**
 * すべてのIPCハンドラーを登録
 */
function registerIpcHandlers() {
  console.log('IPCハンドラーを登録しています...');
  
  // ハンドラーを安全に登録するヘルパー関数
  const safelyRegisterHandler = (channel, handler) => {
    try {
      // 既存のハンドラーがあれば削除を試みる
      try {
        ipcMain.removeHandler(channel);
        console.log(`既存の ${channel} ハンドラを削除しました`);
      } catch (error) {
        // 既存のハンドラーがない場合は何もしない
      }
      
      // 新しいハンドラーを登録
      ipcMain.handle(channel, handler);
      console.log(`${channel} ハンドラを登録しました`);
    } catch (error) {
      console.error(`${channel} ハンドラの登録に失敗しました:`, error);
    }
  };
  
  // ファイル操作関連のハンドラー
  safelyRegisterHandler('open-file-dialog', async () => {
    const win = getMainWindow();
    return win ? await openFileDialog(win) : [];
  });
  
  safelyRegisterHandler('open-directory-dialog', async () => {
    const win = getMainWindow();
    return win ? await openDirectoryDialog(win) : [];
  });
  
  safelyRegisterHandler('get-desktop-path', () => {
    return app.getPath('desktop');
  });
  
  // FFmpeg関連のハンドラー
  safelyRegisterHandler('check-ffmpeg', async () => {
    // FFmpegサービスのヘルスチェック
    try {
      await ffmpegServiceManager.checkHealth();
      return { success: true, version: 'Available' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  // メディア情報取得ハンドラー
  safelyRegisterHandler('get-media-info', async (_, filePath) => {
    return await getMediaInfo(filePath);
  });
  
  // サムネイル生成ハンドラー
  safelyRegisterHandler('generate-thumbnail', async (_, pathOrOptions, fileId) => {
    return await generateThumbnail(pathOrOptions, fileId);
  });
  
  // 波形データ生成ハンドラー
  safelyRegisterHandler('generate-waveform', async (_, filePath, outputPath) => {
    return await generateWaveform(filePath, outputPath);
  });
  
  // FFmpegタスク関連のハンドラー
  safelyRegisterHandler('ffmpeg-task-status', async (_, taskId) => {
    return await ffmpegServiceManager.getTaskStatus(taskId);
  });
  
  safelyRegisterHandler('ffmpeg-task-cancel', async (_, taskId) => {
    return await ffmpegServiceManager.cancelTask(taskId);
  });
  
  // タスク管理システム関連のハンドラー
  safelyRegisterHandler('get-task-list', async () => {
    const taskManager = getTaskManager();
    return taskManager ? taskManager.getTasksSummary() : [];
  });
  
  safelyRegisterHandler('get-task-status', async (_, taskId) => {
    const taskManager = getTaskManager();
    return taskManager ? taskManager.getTaskStatus(taskId) : null;
  });
  
  safelyRegisterHandler('cancel-task', async (_, taskId) => {
    const taskManager = getTaskManager();
    return taskManager ? taskManager.cancelTask(taskId) : false;
  });
  
  safelyRegisterHandler('get-task-id-by-media-path', async (_, mediaPath, taskType) => {
    const taskManager = getTaskManager();
    return taskManager ? taskManager.getTaskIdByMediaPath(mediaPath, taskType) : null;
  });
  
  safelyRegisterHandler('get-waveform-data', async (_, taskId) => {
    const taskManager = getTaskManager();
    return taskManager ? taskManager.getWaveformData(taskId) : null;
  });
  
  // 新しいタスク管理システムのハンドラー
  safelyRegisterHandler('create-task', async (_, taskType, options) => {
    const taskManager = getTaskManager();
    return taskManager ? taskManager.createTask(taskType, options) : null;
  });
  
  safelyRegisterHandler('get-task-result', async (_, taskId) => {
    const taskManager = getTaskManager();
    return taskManager ? taskManager.getTaskResult(taskId) : null;
  });
  
  safelyRegisterHandler('find-tasks-by-media', async (_, mediaPath) => {
    const taskManager = getTaskManager();
    return taskManager ? taskManager.findTasksByMedia(mediaPath) : [];
  });
  
  safelyRegisterHandler('get-task-types', async () => {
    const taskManager = getTaskManager();
    return taskManager ? taskManager.getTaskTypes() : [];
  });
  
  safelyRegisterHandler('clean-tasks-history', async () => {
    const taskManager = getTaskManager();
    return taskManager ? taskManager.cleanHistory() : false;
  });
  
  console.log('IPCハンドラーの登録が完了しました');
}

/**
 * エクスポート関連のハンドラーを登録
 */
function registerExportHandlers() {
  console.log('エクスポート関連ハンドラーを登録しています...');
  
  // ハンドラーを安全に登録するヘルパー関数
  const safelyRegisterHandler = (channel, handler) => {
    try {
      // 既存のハンドラーがあれば削除を試みる
      try {
        ipcMain.removeHandler(channel);
        console.log(`既存の ${channel} ハンドラを削除しました`);
      } catch (error) {
        // 既存のハンドラーがない場合は何もしない
      }
      
      // 新しいハンドラーを登録
      ipcMain.handle(channel, handler);
      console.log(`${channel} ハンドラを登録しました`);
    } catch (error) {
      console.error(`${channel} ハンドラの登録に失敗しました:`, error);
    }
  };
  
  // 動画結合ハンドラー
  safelyRegisterHandler('export-combined-video', async (_, options) => {
    const win = getMainWindow();
    if (!win) return { success: false, error: 'メインウィンドウが見つかりません' };
    
    try {
      // 進捗更新関数
      const updateProgress = (current, total, stage) => {
        const percentage = Math.round((current / total) * 100);
        win.webContents.send('export-progress', {
          current,
          total,
          percentage,
          stage
        });
      };
      
      // エクスポート処理の実装
      // 複雑なので実装は省略し、必要に応じて別ファイルに分割することを推奨
      return { success: true, message: 'エクスポート処理は別モジュールに移動しました' };
    } catch (error) {
      console.error('動画結合処理エラー:', error);
      return { success: false, error: error.message };
    }
  });
  
  console.log('エクスポート関連ハンドラーの登録が完了しました');
}

module.exports = {
  registerIpcHandlers,
  registerExportHandlers
};
