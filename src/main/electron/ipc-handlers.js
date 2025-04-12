/**
 * ipc-handlers.js
 * IPCハンドラーの登録を管理
 */
const { ipcMain, app } = require('electron');
const { 
  openFileDialog, 
  openDirectoryDialog, 
  getDesktopPath 
} = require('../services/dialog-service');
const { getFFmpegService, utils } = require('../services/ffmpeg/index');
const ffmpegService = getFFmpegService();
const { 
  getMainWindow, 
  getTaskManager 
} = require('./app-lifecycle');
const { registerHandler } = require('../ipc-registry');
const { checkVideoToolboxSupport } = utils;

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
  
  // ファイル読み込みハンドラー
  registerHandler(ipcMain, 'read-file', async (_, filePath) => {
    const fs = require('fs').promises;
    try {
      if (!filePath) {
        return { success: false, error: 'ファイルパスが指定されていません' };
      }
      
      console.log(`ファイル読み込み: ${filePath}`);
      const data = await fs.readFile(filePath, 'utf8');
      return { success: true, data };
    } catch (error) {
      console.error(`ファイル読み込みエラー: ${filePath}`, error);
      return { success: false, error: error.message };
    }
  });
  
  // FFmpeg関連のハンドラー
  registerHandler(ipcMain, 'check-ffmpeg', async () => {
    // FFmpegサービスのヘルスチェック
    try {
      // 新しいFFmpegServiceCoreは直接利用可能
      const hwAccel = await checkVideoToolboxSupport();
      return { 
        success: true, 
        version: `FFmpeg: ${ffmpegService.utils ? ffmpegService.utils.getFFmpegVersion() || 'N/A' : 'N/A'} (HW: ${hwAccel ? '有効' : '無効'})` 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  // FFmpegタスク関連のハンドラー
  registerHandler(ipcMain, 'ffmpeg-task-status', async (_, taskId) => {
    return ffmpegService.getTaskStatus(taskId);
  });
  
  registerHandler(ipcMain, 'ffmpeg-task-cancel', async (_, taskId) => {
    return await ffmpegService.cancelTask(taskId);
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
    
    const taskManager = getTaskManager();
    if (!taskManager) {
      return { success: false, error: 'タスクマネージャーが利用できません' };
    }
    
    try {
      console.log('書き出しリクエスト受信:', JSON.stringify({
        mediaFilesCount: options.mediaFiles ? options.mediaFiles.length : 0,
        outputPath: options.outputPath,
        settings: options.settings
      }));
      
      // 進捗更新用の関数を定義
      const updateProgress = (current, total, stage) => {
        const percentage = Math.round((current / total) * 100);
        win.webContents.send('export-progress', {
          current,
          total,
          percentage,
          stage
        });
      };
      
      // ExportTaskを作成して実行
      const taskId = taskManager.createTask({
        type: 'export',
        mediaFiles: options.mediaFiles,
        outputPath: options.outputPath,
        settings: options.settings,
        priority: 'HIGH'
      });
      
      console.log(`書き出しタスクを作成しました: ${taskId}`);
      
      // タスク状態変化を購読して進捗を更新
      const progressListener = (task) => {
        if (task.id === taskId) {
          const taskData = task.toJSON();
          
          // 進捗状況を更新
          updateProgress(
            taskData.processedFiles || 0, 
            options.mediaFiles.length, 
            taskData.details?.phase || 'converting'
          );
          
          // タスクが完了していたら購読解除
          if (taskData.status === 'completed' || taskData.status === 'failed' || taskData.status === 'cancelled') {
            taskManager.eventEmitter.off('task-updated', progressListener);
          }
        }
      };
      
      // タスク更新イベントを購読
      taskManager.eventEmitter.on('task-updated', progressListener);
      
      // タスク完了を待機
      const waitForCompletion = () => new Promise((resolve) => {
        const completionListener = (task) => {
          if (task.id === taskId) {
            const result = task.data;
            taskManager.eventEmitter.off('taskCompleted', completionListener);
            taskManager.eventEmitter.off('taskFailed', failureListener);
            resolve(result);
          }
        };
        
        const failureListener = (task) => {
          if (task.id === taskId) {
            const error = task.error || '書き出しに失敗しました';
            taskManager.eventEmitter.off('taskCompleted', completionListener);
            taskManager.eventEmitter.off('taskFailed', failureListener);
            resolve({ success: false, error });
          }
        };
        
        taskManager.eventEmitter.on('taskCompleted', completionListener);
        taskManager.eventEmitter.on('taskFailed', failureListener);
      });
      
      // タスク完了を待機して結果を返す
      const taskResult = await waitForCompletion();
      console.log('書き出しタスク結果:', taskResult);
      
      return taskResult || { success: false, error: '不明なエラーが発生しました' };
    } catch (error) {
      console.error('動画結合処理エラー:', error);
      return { success: false, error: error.message || '書き出し中にエラーが発生しました' };
    }
  });
  
  console.log('エクスポート関連ハンドラーの登録が完了しました');
}

module.exports = {
  registerIpcHandlers,
  registerExportHandlers
};
