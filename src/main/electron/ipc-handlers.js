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
const fs = require('fs').promises;
const path = require('path');

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
  
  // フォルダー内メディアファイルの再帰的検索ハンドラー
  registerHandler(ipcMain, 'scan-folder-for-media', async (_, folderPath) => {
    try {
      console.log(`フォルダー内のメディアファイルを検索: ${folderPath}`);
      const mediaExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v', '.3gp', '.flv', '.wmv'];
      const mediaFiles = [];
      
      // フォルダを再帰的に検索する関数
      async function scanFolder(directory) {
        try {
          // フォルダの内容を取得
          const items = await fs.readdir(directory);
          
          // 各項目を処理
          for (const item of items) {
            const itemPath = path.join(directory, item);
            const stats = await fs.stat(itemPath);
            
            if (stats.isDirectory()) {
              // ディレクトリの場合は再帰的に処理
              await scanFolder(itemPath);
            } else if (stats.isFile()) {
              // ファイルの場合は拡張子を確認
              const ext = path.extname(itemPath).toLowerCase();
              if (mediaExtensions.includes(ext)) {
                mediaFiles.push(itemPath);
              }
            }
          }
        } catch (error) {
          console.error(`フォルダ検索エラー ${directory}:`, error);
          // エラーが発生しても処理を継続
        }
      }
      
      // 指定されたフォルダの再帰的検索を開始
      await scanFolder(folderPath);
      console.log(`検出されたメディアファイル: ${mediaFiles.length}件`);
      return mediaFiles;
    } catch (error) {
      console.error('フォルダー検索エラー:', error);
      return [];
    }
  });
  
  // パスの情報を取得するハンドラー
  registerHandler(ipcMain, 'get-path-stats', async (_, pathToCheck) => {
    try {
      console.log(`パス情報取得: ${pathToCheck}`);
      const stats = await fs.stat(pathToCheck);
      return {
        exists: true,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        size: stats.size,
        mtime: stats.mtime
      };
    } catch (error) {
      console.error(`パス情報取得エラー ${pathToCheck}:`, error);
      return {
        exists: false,
        isDirectory: false,
        isFile: false,
        error: error.message
      };
    }
  });
  
  // ファイル読み込みハンドラー
  registerHandler(ipcMain, 'read-file', async (_, filePath) => {
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
      const updateProgress = (data) => {
        // ログ出力
        console.log(`進捗情報送信: ${JSON.stringify(data)}`);
        
        // 直接メインウィンドウに送信（IPC通信）
        if (win && win.webContents) {
          win.webContents.send('export-progress', data);
        } else {
          console.error('メインウィンドウが利用できないため進捗情報を送信できません');
        }
      };
      
      // タスク完了後も進捗情報が送信されるように100%の状態を明示的に送信
      const sendCompletionProgress = () => {
        updateProgress({
          percentage: 100,
          current: options.mediaFiles.length,
          total: options.mediaFiles.length,
          stage: 'completed',
          phase: 'completed',
          phaseName: '完了',
          message: 'エクスポートが完了しました',
          currentStep: 1,
          totalSteps: 1
        });
      };
      
      // 直接FFmpegの進捗をモニターする関数
      const monitorFFmpegProgress = () => {
        // 1秒ごとにタスクの進捗を確認して送信
        const progressInterval = setInterval(() => {
          // getTaskメソッドではなくgetTaskByIdメソッドを使用
          const task = taskManager.getTaskById(taskId);
          if (!task) {
            clearInterval(progressInterval);
            return;
          }
          
          const taskData = task.toJSON();
          
          // 詳細な進捗情報を取得して送信
          if (taskData.details) {
            updateProgress({
              ...taskData.details,
              percentage: taskData.progress || 0,
              current: taskData.details.currentFile || 0,
              total: options.mediaFiles.length,
              stage: taskData.details.phase || 'converting'
            });
          } else {
            // 基本的な進捗情報を送信
            updateProgress({
              current: taskData.processedFiles || 0,
              total: options.mediaFiles.length,
              percentage: taskData.progress || 0,
              stage: 'converting'
            });
          }
          
          // タスクが完了または失敗した場合、インターバルをクリア
          if (taskData.status === 'completed' || taskData.status === 'failed' || taskData.status === 'cancelled') {
            if (taskData.status === 'completed') {
              sendCompletionProgress();
            }
            clearInterval(progressInterval);
          }
        }, 500); // 500msごとに更新（より滑らかな進捗表示）
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
      
      // 進捗モニタリングを開始
      monitorFFmpegProgress();
      
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
      
      // 完了時に100%の進捗を送信
      sendCompletionProgress();
      
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
