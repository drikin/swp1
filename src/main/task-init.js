/**
 * タスク管理システムの初期化
 * メインプロセスで必要なタスク管理モジュールを初期化します
 */
console.log('===== task-init.js が読み込まれました =====');
const path = require('path');
const fs = require('fs');
const { registerTaskAPI } = require(path.join(__dirname, 'api/task-api'));
const { registerMediaAPI } = require(path.join(__dirname, 'api/media-api'));
const { registerHandler } = require('./ipc-registry');
const TaskRegistry = require(path.join(__dirname, 'core/task-registry'));
const TaskManager = require(path.join(__dirname, 'core/task-manager'));
const WaveformTask = require(path.join(__dirname, 'tasks/waveform-task'));
const LoudnessTask = require(path.join(__dirname, 'tasks/loudness-task'));
const ThumbnailTask = require(path.join(__dirname, 'tasks/thumbnail-task'));
const ffmpegService = require(path.join(__dirname, 'services/ffmpeg/index'));
const storageService = require(path.join(__dirname, 'services/storage-service'));
const { app, BrowserWindow, ipcMain } = require('electron');

/**
 * タスク管理システムの初期化
 * @param {Electron.IpcMain} ipcMain - Electron IPC Mainオブジェクト
 * @returns {TaskManager} 初期化されたタスクマネージャー
 */
function initializeTaskSystem(ipcMain) {
  console.log('タスク管理システムの初期化を開始...');
  
  try {
    // タスクレジストリの作成
    console.log('タスクレジストリを作成中...');
    const taskRegistry = new TaskRegistry();
    
    // タスクマネージャーの作成
    console.log('タスクマネージャーを作成中...');
    const taskManager = new TaskManager(taskRegistry);
    
    // タスクタイプの登録
    console.log('タスクタイプを登録中...');
    registerTaskTypes(taskRegistry);
    
    // APIの登録
    console.log('APIを登録中...');
    
    // セーフハンドラ登録関数をタスクマネージャーに設定
    taskManager.safeRegisterHandler = (channel, handler) => {
      return registerHandler(ipcMain, channel, handler);
    };
    
    // APIの登録
    registerTaskAPI(ipcMain, taskManager);
    registerMediaAPI(ipcMain);
    
    // タスク状態変化の通知設定
    console.log('タスクイベントを設定中...');
    setupTaskEvents(taskManager);
    
    console.log('タスク管理システムの初期化が完了しました');
    
    return taskManager;
  } catch (error) {
    console.error('タスク管理システムの初期化エラー:', error);
    return null;
  }
}

/**
 * タスクタイプを登録
 * @param {TaskRegistry} registry - タスクレジストリ
 */
function registerTaskTypes(registry) {
  // 波形生成タスク
  registry.registerTaskType(
    'waveform',
    {
      name: '波形生成',
      description: 'オーディオファイルから波形データを生成します',
      icon: 'waveform-icon',
      allowedMediaTypes: ['audio', 'video']
    },
    params => new WaveformTask(params),
    task => task.data
  );

  // ラウドネス測定タスク
  registry.registerTaskType(
    'loudness',
    {
      name: 'ラウドネス測定',
      description: 'オーディオのラウドネスを測定します',
      icon: 'loudness-icon',
      allowedMediaTypes: ['audio', 'video']
    },
    params => new LoudnessTask(params),
    task => task.data
  );

  // サムネイル生成タスク
  registry.registerTaskType(
    'thumbnail',
    {
      name: 'サムネイル生成',
      description: '動画からサムネイル画像を生成します',
      icon: 'thumbnail-icon',
      allowedMediaTypes: ['video']
    },
    params => new ThumbnailTask(params),
    task => task.data
  );
}

/**
 * タスク状態変化のイベントをセットアップする
 * @param {TaskManager} taskManager タスクマネージャーインスタンス
 */
function setupTaskEvents(taskManager) {
  // eventEmitterプロパティを使用してイベントをリッスンする
  if (!taskManager || !taskManager.eventEmitter) {
    console.error('タスクマネージャーが正しく初期化されていないか、eventEmitterプロパティが見つかりません');
    return;
  }

  // 進捗通知イベント
  taskManager.eventEmitter.on('taskProgress', (task) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      window.webContents.send('task-progress', {
        taskId: task.id,
        type: task.type,
        progress: task.progress,
        status: task.status
      });
    }
  });
  
  // タスク完了イベント
  taskManager.eventEmitter.on('taskCompleted', (task) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      window.webContents.send('task-completed', {
        taskId: task.id,
        type: task.type,
        status: 'completed',
        result: task.data
      });
      
      // 従来のイベント通知との互換性維持
      if (task.type === 'waveform') {
        window.webContents.send('task-status', {
          taskId: task.id,
          status: 'completed',
          type: 'waveform'
        });
      } else if (task.type === 'loudness') {
        window.webContents.send('loudness-measured', {
          taskId: task.id,
          fileName: task.mediaPath,
          loudness: task.data
        });
      } else if (task.type === 'thumbnail') {
        console.log('サムネイル生成完了:', task.id);
        console.log('タスク内容:', {
          id: task.id,
          type: task.type,
          status: task.status,
          mediaPath: typeof task.mediaPath === 'object' ? JSON.stringify(task.mediaPath) : task.mediaPath
        });
        
        // サムネイルデータの詳細確認
        const thumbnailDataSummary = task.data ? {
          hasBase64: !!task.data.base64,
          base64Length: task.data.base64 ? task.data.base64.length : 0,
          base64Snippet: task.data.base64 ? `${task.data.base64.substring(0, 30)}...` : 'なし',
          filePath: task.data.filePath || 'なし',
          timePosition: task.data.timePosition,
          size: task.data.size
        } : 'データなし';
        
        console.log('サムネイルデータ概要:', thumbnailDataSummary);
        
        // 送信データの準備
        const eventData = {
          id: task.id,
          fileName: task.mediaPath,
          thumbnail: task.data && task.data.base64 ? task.data.base64 : null
        };
        
        console.log('送信データ:', {
          id: eventData.id,
          fileName: typeof eventData.fileName === 'object' ? JSON.stringify(eventData.fileName) : eventData.fileName,
          hasThumbnail: !!eventData.thumbnail
        });
        
        try {
          window.webContents.send('thumbnail-generated', eventData);
          console.log('thumbnail-generatedイベント送信完了');
        } catch (error) {
          console.error('thumbnail-generatedイベント送信エラー:', error);
        }
      }
    }
  });
  
  // タスク失敗イベント
  taskManager.eventEmitter.on('taskFailed', (task) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      window.webContents.send('task-failed', {
        taskId: task.id,
        type: task.type,
        status: 'failed',
        error: task.error
      });
      
      // 従来のイベント通知との互換性維持
      if (task.type === 'loudness') {
        window.webContents.send('loudness-error', {
          taskId: task.id,
          fileName: task.mediaPath,
          error: task.error
        });
      }
    }
  });
  
  // タスクキャンセルイベント
  taskManager.eventEmitter.on('taskCancelled', (task) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      window.webContents.send('task-cancelled', {
        taskId: task.id,
        type: task.type,
        status: 'cancelled'
      });
    }
  });
  
  // 全てのタスク一覧更新イベント（一定間隔で送信）
  let taskUpdateInterval = null;
  
  // アプリ起動時にインターバルを開始
  app.on('ready', () => {
    taskUpdateInterval = setInterval(() => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window) {
        const tasks = taskManager.getAllTasks().map(task => ({
          id: task.id,
          type: task.type,
          status: task.status,
          progress: task.progress,
          error: task.error || null,
          createdAt: task.createdAt,
          completedAt: task.completedAt || null
        }));
        
        window.webContents.send('tasks-updated', { tasks });
      }
    }, 1000); // 1秒ごとに更新
  });
  
  // アプリ終了時にインターバルを停止
  app.on('before-quit', () => {
    if (taskUpdateInterval) {
      clearInterval(taskUpdateInterval);
      taskUpdateInterval = null;
    }
  });
}

module.exports = { initializeTaskSystem };
