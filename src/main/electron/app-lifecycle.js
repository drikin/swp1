/**
 * app-lifecycle.js
 * アプリケーションのライフサイクル（起動・終了）管理
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { ensureWorkDirectories } = require('./file-operations');
const ffmpegServiceManager = require('../ffmpeg-service-manager');
const { checkVideoToolboxSupport } = require('./ffmpeg-helpers');
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
    width: 1280,
    height: 720,
    webPreferences: {
      nodeIntegration: false, // Node.js統合を無効化
      contextIsolation: true, // コンテキスト分離を有効化
      preload: path.join(__dirname, '../preload.js'),
      webSecurity: false // ローカルファイルアクセスを許可
    }
  });

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
    
    // 作業ディレクトリを確保
    workDirs = ensureWorkDirectories('Super Watarec', ['thumbnails']);
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
    
    // FFmpegサービスの起動
    console.log('FFmpegサービスを起動します...');
    ffmpegServiceManager.start().catch(error => {
      console.error('FFmpegサービス起動エラー:', error);
    });
    
    // FFmpegサービスの準備が完了したらハードウェアエンコード対応確認を実行
    ffmpegServiceManager.onReady(() => {
      console.log('FFmpegサービスの準備が完了しました。ハードウェアエンコード対応確認を実行します。');
      checkVideoToolboxSupport().then(hwaccelSupport => {
        global.hwaccelSupport = hwaccelSupport;
      });
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
    
    // FFmpegサービスの停止
    console.log('FFmpegサービスを停止します...');
    await ffmpegServiceManager.stop().catch(error => {
      console.error('FFmpegサービス停止エラー:', error);
    });
    
    // 残っているFFmpegプロセスの強制終了
    console.log('残存FFmpegプロセスの強制終了を確認します...');
    await ffmpegServiceManager.killAllFFmpegProcesses().catch(error => {
      console.error('FFmpegプロセス強制終了エラー:', error);
    });
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
