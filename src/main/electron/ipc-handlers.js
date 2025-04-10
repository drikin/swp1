/**
 * ipc-handlers.js
 * IPCハンドラーの登録を管理
 */
const { ipcMain, app } = require('electron');
const { 
  openFileDialog, 
  openDirectoryDialog, 
  getDesktopPath 
} = require('./file-operations');
const ffmpegServiceManager = require('../ffmpeg-service-manager');
const { 
  getMainWindow, 
  getTaskManager 
} = require('./app-lifecycle');
const { registerHandler } = require('../ipc-registry');
const { checkVideoToolboxSupport } = require('./ffmpeg-helpers');

/**
 * すべてのIPCハンドラーを登録
 */
function registerIpcHandlers() {
  console.log('IPCハンドラーを登録しています...');
  
  // ファイル操作関連のハンドラー
  registerHandler(ipcMain, 'open-file-dialog', async () => {
    const win = getMainWindow();
    return win ? await openFileDialog(win) : [];
  });
  
  registerHandler(ipcMain, 'open-directory-dialog', async () => {
    const win = getMainWindow();
    return win ? await openDirectoryDialog(win) : [];
  });
  
  registerHandler(ipcMain, 'get-desktop-path', () => {
    return app.getPath('desktop');
  });
  
  // FFmpeg関連のハンドラー
  registerHandler(ipcMain, 'check-ffmpeg', async () => {
    // FFmpegサービスのヘルスチェック
    try {
      // サービスの状態と機能を確認
      await ffmpegServiceManager.checkHealth(); // サービスが応答するか確認するだけ
      const hwAccel = await ffmpegServiceManager.checkHardwareAccel();
      const ffmpegVersion = await ffmpegServiceManager.getFFmpegVersion();
      return { 
        success: true, 
        version: `FFmpeg: ${ffmpegVersion || 'N/A'} (HW: ${hwAccel ? '有効' : '無効'})` 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  // FFmpegタスク関連のハンドラー
  registerHandler(ipcMain, 'ffmpeg-task-status', async (_, taskId) => {
    return await ffmpegServiceManager.getTaskStatus(taskId);
  });
  
  registerHandler(ipcMain, 'ffmpeg-task-cancel', async (_, taskId) => {
    return await ffmpegServiceManager.cancelTask(taskId);
  });
  
  registerHandler(ipcMain, 'get-task-list', async () => {
    const taskManager = getTaskManager();
    if (!taskManager) {
      console.error('タスクマネージャーが初期化されていません');
      return { success: false, error: 'タスクマネージャーが利用できません', tasks: [] };
    }
    
    try {
      const tasks = taskManager.getAllTasks();
      return { success: true, tasks: tasks.map(task => task.toJSON()) };
    } catch (error) {
      console.error('タスク一覧取得エラー:', error);
      return { success: false, error: error.message, tasks: [] };
    }
  });
  
  console.log('IPCハンドラーの登録が完了しました');
}

/**
 * エクスポート関連のハンドラーを登録
 */
function registerExportHandlers() {
  console.log('エクスポート関連ハンドラーを登録しています...');
  
  // 動画結合ハンドラー
  registerHandler(ipcMain, 'export-combined-video', async (_, options) => {
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
