/**
 * app-lifecycle.js
 * アプリケーションのライフサイクル（起動・終了）管理
 */
const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const storageService = require('../services/storage-service');
const { getFFmpegService, utils } = require('../services/ffmpeg/index');
const ffmpegService = getFFmpegService();
const { checkVideoToolboxSupport } = utils;
const { initializeTaskSystem } = require('../task-init');

// グローバル参照
let mainWindow = null;
let globalTaskManager = null;
let isQuitting = false;
let workDirs = null;

/**
 * メインウィンドウを作成
 */
function createWindow() {
  // ブラウザウィンドウを作成
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      nodeIntegration: false, // Node.js統合を無効化
      contextIsolation: true, // コンテキスト分離を有効化
      preload: path.resolve(__dirname, '../preload.js'), // 絶対パスを確実に解決
      webSecurity: false // ローカルファイルアクセスを許可（開発環境用）
    }
  });

  // プリロードスクリプトのパスを確認ログ出力
  console.log('プリロードスクリプトパス:', path.resolve(__dirname, '../preload.js'));
  console.log('プリロードスクリプトの存在確認:', fs.existsSync(path.resolve(__dirname, '../preload.js')));

  // index.htmlをロード
  mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));

  // 開発ツールを開く（開発時のみ）
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // ウィンドウが閉じられたときの処理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  return mainWindow;
}

/**
 * アプリケーションの初期化処理
 */
async function initializeApp() {
  try {
    console.log('====== アプリケーション起動シーケンス開始 ======');
    
    // セキュアなファイルアクセスのためのプロトコル登録
    protocol.registerFileProtocol('secure-file', (request, callback) => {
      const url = new URL(request.url);
      const filePath = decodeURIComponent(url.pathname);
      try {
        callback({ path: path.normalize(filePath) });
      } catch (error) {
        console.error('プロトコルハンドラエラー:', error);
        callback({ error: -2 /* net::FAILED */ });
      }
    });
    console.log('セキュアファイルプロトコルを登録しました');
    
    // 作業ディレクトリを確保
    workDirs = storageService.ensureWorkDirectories('Super Watarec', ['thumbnails']);
    console.log('作業ディレクトリの確認完了');
    
    // メインウィンドウを作成
    console.log('メインウィンドウを作成します...');
    const window = createWindow();
    console.log('メインウィンドウ作成完了');
    
    // タスク管理システムの初期化
    console.log('タスク管理システムの初期化を開始します...');
    const taskManager = initializeTaskSystem(require('electron').ipcMain);
    console.log('initializeTaskSystem結果:', taskManager ? 'インスタンス生成成功' : 'インスタンス生成失敗');
    
    if (taskManager) {
      // グローバル変数に設定
      globalTaskManager = taskManager;
      console.log('globalTaskManagerを設定しました');
      
      // タスクイベントリスナーの設定
      setupTaskEventListeners();
    }
    
    // FFmpegサービスを初期化
    console.log('FFmpegサービスを初期化します...');
    
    // FFmpegハードウェアエンコード対応確認を実行
    console.log('ハードウェアエンコード対応確認を実行します。');
    checkVideoToolboxSupport().then(hwaccelSupport => {
      global.hwaccelSupport = hwaccelSupport;
    });
    
    // ダウンロードを防止（セキュリティ対策）
    app.on('browser-window-created', (_, window) => {
      window.webContents.on('did-finish-load', () => {
        window.webContents.session.on('will-download', (e) => {
          e.preventDefault();
        });
      });
    });
    
    return { window, taskManager };
  } catch (error) {
    console.error('初期化エラー:', error);
    throw error;
  }
}

/**
 * アプリケーションの終了処理
 */
async function cleanupApp() {
  console.log('アプリケーション終了処理を開始します...');
  
  try {
    // タスク管理システムのクリーンアップ
    if (globalTaskManager) {
      console.log('タスク管理システムのクリーンアップを実行します...');
      await globalTaskManager.cleanupAll().catch(error => {
        console.error('タスク管理システムクリーンアップエラー:', error);
      });
    }
    
    // FFmpegサービスは自動的にクリーンアップされます...
    console.log('FFmpegサービスは自動的にクリーンアップされます...');
  } catch (error) {
    console.error('アプリケーション終了処理エラー:', error);
  } finally {
    console.log('アプリケーション終了処理が完了しました');
  }
}

/**
 * タスク管理システムのイベントリスナーを設定
 */
function setupTaskEventListeners() {
  // eventEmitterプロパティが存在するか確認
  if (!globalTaskManager || !globalTaskManager.eventEmitter) {
    console.error('タスクマネージャーが正しく初期化されていないか、eventEmitterプロパティが見つかりません');
    return;
  }

  // タスク更新イベントをレンダラープロセスに送信
  globalTaskManager.eventEmitter.on('tasks-updated', (taskSummary) => {
    // シリアライズできるか確認
    try {
      // データをJSONとして一度シリアライズしてみて問題ないか確認
      JSON.stringify(taskSummary);
      
      // 全ウィンドウにイベントを送信
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          try {
            window.webContents.send('tasks-updated', taskSummary);
          } catch (error) {
            console.error('ウィンドウへのタスク更新送信エラー:', error);
          }
        }
      });
    } catch (serializeError) {
      console.error('タスクデータのシリアライズに失敗しました:', serializeError);
    }
  });
}

// メインウィンドウへのアクセサ
function getMainWindow() {
  return mainWindow;
}

// グローバルタスクマネージャーへのアクセサ
function getTaskManager() {
  return globalTaskManager;
}

// アプリ終了フラグの設定
function setQuitting(value) {
  isQuitting = value;
}

// アプリ終了フラグの取得
function isQuittingApp() {
  return isQuitting;
}

module.exports = {
  createWindow,
  initializeApp,
  cleanupApp,
  getMainWindow,
  getTaskManager,
  setQuitting,
  isQuittingApp
};
