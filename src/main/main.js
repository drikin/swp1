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
app.whenReady().then(() => {
  createWindow();
  
  // ファイルのドラッグ&ドロップを許可
  app.on('browser-window-created', (_, window) => {
    window.webContents.on('did-finish-load', () => {
      window.webContents.session.on('will-download', (e, item) => {
        e.preventDefault();
      });
    });
  });
});

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

// サポートされているファイル拡張子
const SUPPORTED_EXTENSIONS = {
  video: ['mp4', 'mov', 'avi', 'webm', 'mkv'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp']
};

// ファイル選択ダイアログを開く
ipcMain.handle('open-file-dialog', async (event, paths) => {
  let filePaths = [];
  
  // パスが既に指定されている場合（ドラッグ&ドロップの場合）
  if (paths && Array.isArray(paths) && paths.length > 0) {
    console.log('Using provided paths:', paths);
    filePaths = paths;
  } else {
    // ダイアログを表示してファイルを選択
    console.log('Opening file dialog');
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections', 'openDirectory'],
      filters: [
        { name: '動画ファイル', extensions: SUPPORTED_EXTENSIONS.video },
        { name: '画像ファイル', extensions: SUPPORTED_EXTENSIONS.image },
        { name: 'すべてのファイル', extensions: ['*'] }
      ]
    });
    
    if (result.canceled) {
      console.log('Dialog canceled');
      return [];
    }
    filePaths = result.filePaths;
  }
  
  // ファイルを処理
  const allFiles = [];
  
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          // フォルダーの場合は再帰的に探索
          console.log('Processing directory:', filePath);
          const filesInDir = getFilesRecursively(filePath);
          allFiles.push(...filesInDir);
        } else {
          // 単一ファイルの場合は拡張子をチェック
          const ext = path.extname(filePath).toLowerCase().replace('.', '');
          const allSupportedExtensions = [...SUPPORTED_EXTENSIONS.video, ...SUPPORTED_EXTENSIONS.image];
          
          if (allSupportedExtensions.includes(ext)) {
            console.log('Adding file:', filePath);
            // ファイル情報をオブジェクトとして追加
            const fileObj = {
              id: `file-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
              path: filePath,
              name: path.basename(filePath),
              type: ext.match(/(mp4|mov|avi|webm|mkv)/) ? 'video' : 'image',
              size: stats.size,
              lastModified: stats.mtime
            };
            allFiles.push(fileObj);
          }
        }
      }
    } catch (error) {
      console.error('Error processing path:', error);
    }
  }
  
  console.log(`Found ${allFiles.length} valid files`);
  return allFiles;
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

// フォルダーを再帰的に探索してファイルを取得する関数
function getFilesRecursively(dir) {
  const files = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      try {
        if (entry.isDirectory()) {
          // ディレクトリの場合は再帰的に探索
          const subDirFiles = getFilesRecursively(fullPath);
          files.push(...subDirFiles);
        } else {
          // ファイルの場合は拡張子をチェック
          const ext = path.extname(entry.name).toLowerCase().replace('.', '');
          const allSupportedExtensions = [...SUPPORTED_EXTENSIONS.video, ...SUPPORTED_EXTENSIONS.image];
          
          if (allSupportedExtensions.includes(ext)) {
            // ファイル情報をオブジェクトとして追加
            const stats = fs.statSync(fullPath);
            const fileObj = {
              id: `file-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
              path: fullPath,
              name: entry.name,
              type: ext.match(/(mp4|mov|avi|webm|mkv)/) ? 'video' : 'image',
              size: stats.size,
              lastModified: stats.mtime
            };
            files.push(fileObj);
          }
        }
      } catch (err) {
        console.error(`Error processing entry ${fullPath}:`, err);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}

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
    const versionMatch = result.stdout.match(/ffmpeg version ([^ ]+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';
    return { 
      available: true, 
      version: version,
      path: ffmpegPath
    };
  } catch (error) {
    console.error('FFmpeg error:', error);
    return { 
      available: false, 
      error: error.message 
    };
  }
});

// 動画情報を取得
ipcMain.handle('get-media-info', async (event, filePath) => {
  try {
    const result = await runFFmpegCommand([
      '-i', filePath,
      '-hide_banner'
    ]);

    // メタデータから撮影日時を取得
    let creationTime = null;
    const creationTimeMatch = result.stderr.match(/creation_time\s*:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/i);
    if (creationTimeMatch) {
      creationTime = new Date(creationTimeMatch[1]).getTime();
    } else {
      // メタデータがない場合はファイルの作成日時を使用
      const stats = fs.statSync(filePath);
      creationTime = stats.birthtimeMs || stats.mtimeMs;
    }

    return { 
      success: true, 
      info: result.stderr,
      creationTime 
    }; // FFmpegは情報をstderrに出力する
  } catch (error) {
    // エラーの場合でもFFmpegは情報をstderrに出力するため、その情報を使用
    let creationTime = null;
    try {
      // メタデータが取得できない場合はファイルの作成日時を使用
      const stats = fs.statSync(filePath);
      creationTime = stats.birthtimeMs || stats.mtimeMs;
    } catch (e) {
      console.error('Failed to get file stats:', e);
    }
    
    return { 
      success: true, 
      info: error.message,
      creationTime 
    };
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