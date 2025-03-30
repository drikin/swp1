const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

// システムのFFmpegパスを動的に取得
let ffmpegPath;
try {
  // 'which ffmpeg'コマンドでパスを取得
  ffmpegPath = execSync('which ffmpeg').toString().trim();
  console.log('システムのFFmpegを使用します:', ffmpegPath);
} catch (error) {
  console.error('システムにFFmpegが見つかりません:', error);
  ffmpegPath = 'ffmpeg'; // 環境変数PATHから検索する
}

// FFmpegのパスを確認
console.log('FFmpeg path:', ffmpegPath);

// ウィンドウオブジェクトのグローバル参照を保持
let mainWindow;

function createWindow() {
  // ブラウザウィンドウを作成
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      nodeIntegration: false, // Node.js統合を無効化
      contextIsolation: true, // コンテキスト分離を有効化
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // index.htmlをロード
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // 開発ツールを開く（開発時のみ）
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // ウィンドウが閉じられたときの処理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Electronの初期化が完了したらウィンドウを作成
app.whenReady().then(createWindow);

// すべてのウィンドウが閉じられたときの処理 (macOS以外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// アプリがアクティブになったときの処理 (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ファイル選択ダイアログを開く
ipcMain.handle('open-file-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '動画ファイル', extensions: ['mp4', 'mov', 'avi'] },
      { name: '画像ファイル', extensions: ['jpg', 'jpeg', 'png'] },
      { name: 'すべてのファイル', extensions: ['*'] }
    ]
  });
  if (canceled) {
    return [];
  }
  return filePaths;
});

// フォルダ選択ダイアログを開く
ipcMain.handle('open-directory-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (canceled) {
    return null;
  }
  return filePaths[0];
});

// FFmpegコマンドを実行する関数
function runFFmpegCommand(args) {
  return new Promise((resolve, reject) => {
    const process = spawn(ffmpegPath, args);
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`FFmpeg process exited with code ${code}: ${stderr}`));
      }
    });
    
    process.on('error', (err) => {
      reject(err);
    });
  });
}

// FFmpegバージョン確認 (アプリ起動時に実行)
ipcMain.handle('check-ffmpeg', async () => {
  try {
    const result = await runFFmpegCommand(['-version']);
    return { success: true, version: result.stdout.split('\n')[0] };
  } catch (error) {
    console.error('FFmpeg error:', error);
    return { success: false, error: error.message };
  }
});

// 動画情報を取得
ipcMain.handle('get-media-info', async (event, filePath) => {
  try {
    const result = await runFFmpegCommand([
      '-i', filePath,
      '-hide_banner'
    ]);
    return { success: true, info: result.stderr }; // FFmpegは情報をstderrに出力する
  } catch (error) {
    // エラーの場合でもFFmpegは情報をstderrに出力するため、その情報を使用
    return { success: true, info: error.message };
  }
});

// 波形データを生成
ipcMain.handle('generate-waveform', async (event, filePath, outputPath) => {
  try {
    // PCM音声データを抽出
    const pcmOutputPath = outputPath || path.join(app.getPath('temp'), `${path.basename(filePath, path.extname(filePath))}.pcm`);
    
    await runFFmpegCommand([
      '-i', filePath,
      '-f', 's16le',  // 16ビット符号付き整数（リトルエンディアン）形式
      '-acodec', 'pcm_s16le',
      '-ac', '1',     // モノラルに変換
      '-ar', '44100', // サンプリングレート44.1kHz
      pcmOutputPath
    ]);
    
    // PCMファイルの内容を読み取る
    const pcmData = fs.readFileSync(pcmOutputPath);
    
    // Int16Array に変換
    const waveformData = new Int16Array(new Uint8Array(pcmData).buffer);
    
    // ファイルサイズが大きい場合はダウンサンプリング
    const maxSamples = 10000; // 適切なサイズに調整
    let downsampled;
    
    if (waveformData.length > maxSamples) {
      downsampled = new Int16Array(maxSamples);
      const step = Math.floor(waveformData.length / maxSamples);
      
      for (let i = 0; i < maxSamples; i++) {
        // 各ステップの最大絶対値を取得（波形の詳細を保持）
        let maxValue = 0;
        for (let j = 0; j < step; j++) {
          const idx = i * step + j;
          if (idx < waveformData.length) {
            const abs = Math.abs(waveformData[idx]);
            if (abs > maxValue) maxValue = abs;
          }
        }
        downsampled[i] = maxValue;
      }
    } else {
      downsampled = waveformData;
    }
    
    // 一時ファイルを削除
    fs.unlinkSync(pcmOutputPath);
    
    return {
      success: true,
      waveform: Array.from(downsampled), // ArrayBufferをJSONで送信可能な通常の配列に変換
      sampleRate: 44100
    };
  } catch (error) {
    console.error('Waveform generation error:', error);
    return { success: false, error: error.message };
  }
});

// その他のIPC処理をここに追加 