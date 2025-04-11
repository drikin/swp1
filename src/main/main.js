/**
 * main.js
 * Electronアプリケーションのエントリーポイント
 */
const { app, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { getFFmpegService } = require('./services/ffmpeg/index');
const ffmpegService = getFFmpegService();
const { 
  initializeApp, 
  cleanupApp, 
  setQuitting,
  isQuittingApp 
} = require('./electron/app-lifecycle');
const { 
  registerIpcHandlers, 
  registerExportHandlers 
} = require('./electron/ipc-handlers');

// システムのFFmpegパスを動的に取得
let ffmpegPath = '/opt/homebrew/bin/ffmpeg'; // デフォルトパスを設定
try {
  // 'which ffmpeg'コマンドでパスを取得（同期実行）
  ffmpegPath = execSync('which ffmpeg').toString().trim();
  console.log('システムのFFmpegを使用します:', ffmpegPath);
} catch (error) {
  console.error('システムにFFmpegが見つかりません:', error);
  // macOSの一般的なパスも試す
  if (fs.existsSync('/opt/homebrew/bin/ffmpeg')) {
    ffmpegPath = '/opt/homebrew/bin/ffmpeg';
    console.log('Homebrewのインストールパスを使用します:', ffmpegPath);
  } else {
    console.warn('デフォルトパスを使用します（PATHから検索）:', ffmpegPath);
  }
}

// FFmpegのパスをグローバルに設定
global.ffmpegPath = ffmpegPath;
console.log('FFmpeg path:', ffmpegPath);

// fluent-ffmpegにパスを設定
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

// Electronの初期化が完了したら実行
app.whenReady().then(async () => {
  await initializeApp();
  
  // ローカルファイルアクセスのためのプロトコルハンドラを登録
  protocol.registerFileProtocol('file', (request, callback) => {
    try {
      // URLのパス部分を取得してデコード
      const filePath = decodeURI(request.url.slice('file://'.length));
      console.log('ファイルプロトコルアクセス:', filePath);
      callback({ path: filePath });
    } catch (error) {
      console.error('ファイルプロトコルエラー:', error);
      callback({ error: -2 }); // ファイルが見つからない場合のエラーコード
    }
  });
  
  // すべてのIPCハンドラーを登録
  registerIpcHandlers();
  registerExportHandlers();
});

// すべてのウィンドウが閉じられたときの処理 (macOS以外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // アプリを終了
    app.quit();
  }
});

// アプリが終了する前にクリーンアップ
app.on('before-quit', async (event) => {
  // 初回の終了イベントでは終了をキャンセルし、クリーンアップを実行
  if (!isQuittingApp()) {
    // 終了プロセスを一度だけ実行
    event.preventDefault();
    setQuitting(true);
    
    await cleanupApp();
    
    // 終了処理が完了したため、アプリケーションを終了
    setTimeout(() => app.quit(), 500);
  }
});

// アプリがアクティブになったときの処理 (macOS)
app.on('activate', () => {
  // アプリケーションの初期化が完了したら、IPCハンドラーを登録
  if (app.isReady()) {
    // すべてのIPCハンドラーを登録
    // registerIpcHandlers();
    // registerExportHandlers();
  }
});
