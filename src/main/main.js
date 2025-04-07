const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const url = require('url');
const { spawn } = require('child_process');
const { execSync } = require('child_process');
const ffmpegServiceManager = require('./ffmpeg-service-manager');
const taskManager = require('./task-manager'); 

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

// FFmpegのパスを確認
console.log('FFmpeg path:', ffmpegPath);

// fluent-ffmpegにパスを設定
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

// ウィンドウオブジェクトのグローバル参照を保持
let mainWindow;

// 一時ディレクトリのパス
const tempDir = path.join(app.getPath('temp'), 'swp1-thumbnails');

function createWindow() {
  // ブラウザウィンドウを作成
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      nodeIntegration: false, // Node.js統合を無効化
      contextIsolation: true, // コンテキスト分離を有効化
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false // ローカルファイルアクセスを許可
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
app.whenReady().then(async () => {
  try {
    // FFmpegのパスを保存（既にグローバル変数で設定済み）
    global.ffmpegPath = ffmpegPath;
    
    console.log('FFmpeg path:', ffmpegPath);
    
    // ウィンドウを作成
    createWindow();
    
    // 一時ディレクトリを作成
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // FFmpegサービスの起動
    ffmpegServiceManager.start().catch(error => {
      console.error('FFmpegサービス起動エラー:', error);
    });
    
    // ファイルのドラッグ&ドロップを許可
    app.on('browser-window-created', (_, window) => {
      window.webContents.on('did-finish-load', () => {
        window.webContents.session.on('will-download', (e, item) => {
          e.preventDefault();
        });
      });
    });
  } catch (error) {
    console.error('初期化エラー:', error);
  }
});

// すべてのウィンドウが閉じられたときの処理 (macOS以外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // FFmpegサービスの停止
    ffmpegServiceManager.stop().finally(() => {
      app.quit();
    });
  } else {
    app.quit();
  }
});

// アプリが終了する前にクリーンアップ
app.on('before-quit', () => {
  // FFmpegサービスの停止
  ffmpegServiceManager.stop().catch(error => {
    console.error('FFmpegサービス停止エラー:', error);
  });
});

// アプリがアクティブになったときの処理 (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// サポートされているファイル拡張子
const SUPPORTED_EXTENSIONS = {
  video: ['mp4', 'mov', 'avi', 'webm', 'mkv', 'mts', 'm2ts', 'mpg', 'mpeg', 'hevc', 'h265', 'h264'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp']
};

// サムネイルを生成する関数
async function generateThumbnail(filePath, fileId) {
  try {
    console.log('サムネイル生成開始:', filePath, 'ID:', fileId);
    
    // ファイルパスの検証
    if (!filePath || typeof filePath !== 'string') {
      console.error('無効なファイルパス:', filePath);
      return null;
    }
    
    // ファイルの存在確認
    if (!fs.existsSync(filePath)) {
      console.error('ファイルが存在しません:', filePath);
      return null;
    }
    
    // IDの検証
    if (!fileId) {
      // IDが提供されていない場合は、ファイル名からIDを生成
      fileId = `file-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      console.log('IDが提供されていないため新しいIDを生成:', fileId);
    }
    
    const ext = path.extname(filePath).toLowerCase();
    // サムネイルを一時ディレクトリに保存
    const thumbnailPath = path.join(tempDir, `thumbnail-${fileId}.jpg`);
    console.log('サムネイル保存先:', thumbnailPath);
    
    // 動画と画像で異なる処理
    if (['.mp4', '.mov', '.avi', '.webm', '.mkv', '.mts', '.m2ts'].includes(ext)) {
      console.log('動画ファイルからサムネイルを生成します');
      // 動画ファイルの場合
      await runFFmpegCommand([
        '-ss', '00:00:01',
        '-i', filePath,
        '-vframes', '1',
        '-q:v', '2',
        thumbnailPath
      ]);
      
      console.log('FFmpegコマンド完了、サムネイルファイルチェック:', fs.existsSync(thumbnailPath));
    } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
      console.log('画像ファイルからサムネイルを生成します');
      // 画像ファイルの場合
      await runFFmpegCommand([
        '-i', filePath,
        '-vf', 'scale=320:-1',
        thumbnailPath
      ]);
      
      console.log('FFmpegコマンド完了、サムネイルファイルチェック:', fs.existsSync(thumbnailPath));
    } else {
      console.log('サポートされていないファイル形式:', ext);
      return null; // サポートされていない形式
    }
    
    // 生成されたサムネイルをBase64エンコード
    if (fs.existsSync(thumbnailPath)) {
      const imageBuffer = fs.readFileSync(thumbnailPath);
      if (imageBuffer.length > 0) {
        const base64Data = imageBuffer.toString('base64');
        console.log('サムネイル生成成功、Base64データ長:', base64Data.length);
        
        // サムネイル生成に成功したことをレンダラープロセスに通知
        if (mainWindow) {
          console.log('サムネイル生成通知送信 ID:', fileId);
          mainWindow.webContents.send('thumbnail-generated', {
            id: fileId,
            thumbnail: `data:image/jpeg;base64,${base64Data}`
          });
        } else {
          console.error('mainWindowが利用できません');
        }
        return `data:image/jpeg;base64,${base64Data}`;
      } else {
        console.error('サムネイル画像バッファが空です');
      }
    } else {
      console.error('サムネイルファイルが生成されませんでした:', thumbnailPath);
    }
    
    return null;
  } catch (error) {
    console.error('サムネイル生成エラー:', error);
    return null;
  }
}

// FFmpegコマンドを実行する関数
async function runFFmpegCommand(args) {
  try {
    // 新しいFFmpegサービスを使用してタスクを処理
    const result = await ffmpegServiceManager.processFFmpeg(args);
    
    if (result.error) {
      console.error('FFmpeg処理エラー:', result.error);
      throw new Error(result.error);
    }
    
    // 完了したタスクの状態を取得
    let taskStatus = null;
    let attempts = 0;
    const maxAttempts = 50; // 最大50回試行
    
    while (attempts < maxAttempts) {
      taskStatus = await ffmpegServiceManager.getTaskStatus(result.taskId);
      
      if (taskStatus.status === 'completed') {
        // 成功時はサービスからの結果を返す
        return { stdout: taskStatus.stdout || '', stderr: taskStatus.stderr || '' };
      } else if (taskStatus.status === 'failed' || taskStatus.status === 'error') {
        // エラー時は例外をスロー
        throw new Error(`FFmpeg処理失敗: ${taskStatus.stderr || 'Unknown error'}`);
      }
      
      // まだ処理中の場合は少し待機
      await new Promise(resolve => setTimeout(resolve, 200));
      attempts++;
    }
    
    // タイムアウト時は例外をスロー
    throw new Error('FFmpeg処理がタイムアウトしました');
  } catch (error) {
    console.error('FFmpeg実行エラー:', error);
    
    // 後方互換性のために既存の関数と同じ形式でエラーをスロー
    throw error;
  }
}

// FFprobeコマンドを実行する関数（メタデータ取得用）
async function runFFprobeCommand(args) {
  try {
    // 直接FFprobeコマンドを実行する方法に変更
    const { spawn } = require('child_process');
    const ffprobePath = ffmpegPath.replace('ffmpeg', 'ffprobe');
    
    console.log('FFprobe実行:', args.join(' '));
    console.log('FFprobeパス:', ffprobePath);
    
    // FFprobeコマンド実行
    const result = await new Promise((resolve, reject) => {
      const process = spawn(ffprobePath, args);
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        if (chunk.trim()) {
          console.log('FFprobe stdout:', chunk.trim());
        }
      });
      
      process.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        console.log('FFprobe stderr:', chunk.trim());
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          console.log('FFprobe処理成功');
          resolve({ stdout, stderr });
        } else {
          console.error(`FFprobe処理失敗 (コード ${code}):`);
          // エラーの概要のみを出力
          const errorSummary = stderr.split('\n')
            .filter(line => line.includes('Error') || line.includes('failed') || line.includes('Invalid'))
            .slice(0, 10)
            .join('\n');
          console.error('エラー概要:', errorSummary || 'エラー詳細が見つかりません');
          reject(new Error(`FFprobe process exited with code ${code}: ${stderr}`));
        }
      });
      
      process.on('error', (err) => {
        console.error('FFprobeプロセスエラー:', err);
        reject(err);
      });
    });
    
    return result;
  } catch (error) {
    console.error('FFprobe実行エラー:', error);
    throw error;
  }
}

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
            // ファイルIDを生成
            const fileId = `file-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            
            // ファイル情報をオブジェクトとして追加
            const fileObj = {
              id: fileId,
              path: filePath,
              name: path.basename(filePath),
              type: SUPPORTED_EXTENSIONS.video.includes(ext) ? 'video' : 'image',
              size: stats.size,
              lastModified: stats.mtime
            };
            
            // サムネイルを生成
            const thumbnail = await generateThumbnail(filePath, fileId);
            if (thumbnail) {
              fileObj.thumbnail = thumbnail;
            }
            
            // 動画の場合、長さ情報を取得
            if (fileObj.type === 'video') {
              try {
                const info = await getMediaInfo(filePath);
                if (info && info.duration) {
                  fileObj.duration = info.duration;
                }
              } catch (err) {
                console.error('メディア情報取得エラー:', err);
              }
            }
            
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

// フォルダー選択ダイアログを開く
ipcMain.handle('open-directory-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '保存先フォルダーを選択'
    });
    
    if (result.canceled) {
      return null;
    }
    
    return result.filePaths[0];
  } catch (error) {
    console.error('フォルダー選択エラー:', error);
    throw error;
  }
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
          console.log('Processing directory:', fullPath);
          const subDirFiles = getFilesRecursively(fullPath);
          files.push(...subDirFiles);
        } else {
          // ファイルの場合は拡張子をチェック
          const ext = path.extname(entry.name).toLowerCase().replace('.', '');
          const allSupportedExtensions = [...SUPPORTED_EXTENSIONS.video, ...SUPPORTED_EXTENSIONS.image];
          
          if (allSupportedExtensions.includes(ext)) {
            // ファイルIDを生成
            const fileId = `file-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            
            // ファイル情報をオブジェクトとして追加
            const stats = fs.statSync(fullPath);
            const fileObj = {
              id: fileId,
              path: fullPath,
              name: entry.name,
              type: SUPPORTED_EXTENSIONS.video.includes(ext) ? 'video' : 'image',
              size: stats.size,
              lastModified: stats.mtime
            };
            
            // サムネイルを非同期で生成（処理を遅延させないためにawaitしない）
            generateThumbnail(fullPath, fileId).then(thumbnail => {
              if (thumbnail) {
                fileObj.thumbnail = thumbnail;
                
                // サムネイルが生成されたことをレンダラーに通知
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('thumbnail-generated', {
                    id: fileId,
                    thumbnail: thumbnail
                  });
                }
              }
            }).catch(err => {
              console.error('サムネイル生成エラー:', err);
            });
            
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

// VideoToolboxサポートをチェックする共通関数
async function checkVideoToolboxSupport() {
  try {
    const codecsResult = await runFFmpegCommand(['-encoders']);
    const hasH264HW = codecsResult.stdout.includes('h264_videotoolbox');
    const hasHEVCHW = codecsResult.stdout.includes('hevc_videotoolbox');
    
    const hwaccelSupport = {
      h264: hasH264HW,
      hevc: hasHEVCHW
    };
    
    console.log('VideoToolbox対応状況:', hwaccelSupport);
    return hwaccelSupport;
  } catch (error) {
    console.warn('ハードウェアエンコード対応確認エラー:', error);
    // デフォルト値を返す
    return { h264: false, hevc: false };
  }
}

// FFmpegバージョン確認 (アプリ起動時に実行)
ipcMain.handle('check-ffmpeg', async () => {
  try {
    // 新しい方法：直接コマンドを実行してバージョン情報を取得
    const { spawn } = require('child_process');
    
    // FFmpegバージョン情報取得
    const versionOutput = await new Promise((resolve, reject) => {
      const process = spawn(ffmpegPath, ['-version']);
      let output = '';
      
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`FFmpeg process exited with code ${code}`));
        }
      });
      
      process.on('error', (err) => {
        reject(err);
      });
    });
    
    // バージョン文字列から情報を抽出
    const versionMatch = versionOutput.match(/ffmpeg version (\S+)/);
    const version = versionMatch ? versionMatch[1] : '不明';
    
    console.log('検出されたFFmpegバージョン:', version);
    
    // ハードウェアアクセラレーションサポートの確認
    const hwaccelSupport = await checkVideoToolboxSupport();
    
    return { 
      available: true, 
      version: version,
      path: ffmpegPath,
      hwaccel: hwaccelSupport
    };
  } catch (error) {
    console.error('FFmpegエラー:', error);
    return { 
      available: false, 
      error: error.message 
    };
  }
});

// FFmpegタスクのステータスを確認するIPC通信ハンドラ
ipcMain.handle('ffmpeg-task-status', async (event, taskId) => {
  if (!taskId) {
    return { error: 'タスクIDが指定されていません' };
  }
  
  try {
    return await ffmpegServiceManager.getTaskStatus(taskId);
  } catch (error) {
    console.error('タスクステータス取得エラー:', error);
    return { error: error.message };
  }
});

// FFmpegタスクをキャンセルするIPC通信ハンドラ
ipcMain.handle('ffmpeg-task-cancel', async (event, taskId) => {
  if (!taskId) {
    return { error: 'タスクIDが指定されていません' };
  }
  
  try {
    // TODO: キャンセル処理の実装（現在のffmpeg-service.jsでは未実装）
    console.log(`タスク ${taskId} のキャンセルが要求されました`);
    return { success: true, message: 'キャンセル要求を送信しました' };
  } catch (error) {
    console.error('タスクキャンセルエラー:', error);
    return { error: error.message };
  }
});

// メディア情報を取得する関数
async function getMediaInfo(filePath) {
  // パスの検証
  if (!filePath || typeof filePath !== 'string') {
    console.error('無効なファイルパス:', filePath);
    throw new Error('Invalid file path');
  }
  
  // ファイルの存在確認
  if (!fs.existsSync(filePath)) {
    console.error('ファイルが存在しません:', filePath);
    throw new Error(`File not found: ${filePath}`);
  }
  
  try {
    // ファイルの基本情報を取得
    const stats = fs.statSync(filePath);
    const fileId = `file-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const fileObj = {
      id: fileId,
      name: path.basename(filePath),
      path: filePath,
      size: stats.size
    };
    
    // フォーマット情報を抽出
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration,bit_rate,size:stream=codec_type,codec_name,width,height,sample_rate,channels',
      '-of', 'json',
      filePath
    ];
    
    const { stdout } = await runFFprobeCommand(args);
    
    // JSON解析
    const info = JSON.parse(stdout);
    let result = {
      ...fileObj, // 基本情報を統合
      duration: 0,
      video: false,
      audio: false,
      width: 0,
      height: 0,
      format: '',
      size: stats.size // 確実にファイルサイズを設定
    };
    
    console.log('メディア情報取得:', filePath, '基本情報:', { id: fileId, size: stats.size });
    
    // フォーマット情報を抽出
    if (info.format) {
      if (info.format.duration) {
        result.duration = parseFloat(info.format.duration);
      }
      if (info.format.format_name) {
        result.format = info.format.format_name;
      }
      // format.sizeがある場合は上書き
      if (info.format.size) {
        result.size = parseInt(info.format.size, 10) || stats.size;
      }
    }
    
    // ストリーム情報が配列なら処理
    if (info.streams && Array.isArray(info.streams)) {
      for (const stream of info.streams) {
        // ビデオストリーム
        if (stream.codec_type === 'video') {
          result.video = true;
          result.width = parseInt(stream.width || 0);
          result.height = parseInt(stream.height || 0);
          result.videoCodec = stream.codec_name;
        }
        
        // オーディオストリーム
        if (stream.codec_type === 'audio') {
          result.audio = true;
          result.audioCodec = stream.codec_name;
          result.channels = parseInt(stream.channels || 0);
          result.sampleRate = parseInt(stream.sample_rate || 0);
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('メディア情報取得エラー:', error);
    throw error;
  }
}

// IPC通信でメディア情報取得を提供
ipcMain.handle('get-media-info', async (event, filePath) => {
  return await getMediaInfo(filePath);
});

// IPC通信でサムネイル生成を提供
ipcMain.handle('generate-thumbnail', async (event, options) => {
  // パラメータ形式の統一（オブジェクトか個別パラメータか）
  let filePath, fileId;
  
  if (typeof options === 'object') {
    filePath = options.filePath;
    fileId = options.fileId;
  } else {
    filePath = options;
    fileId = null;
  }
  
  if (!filePath) {
    console.error('サムネイル生成エラー: ファイルパスが指定されていません');
    return null;
  }
  
  return await generateThumbnail(filePath, fileId);
});

// LUFSを測定キューとキャッシュ
const loudnessQueue = [];
const loudnessCache = new Map();
let isProcessingLoudness = false;

// キューを順次処理するプロセッサー
async function processLoudnessQueue() {
  if (isProcessingLoudness || loudnessQueue.length === 0) return;
  
  isProcessingLoudness = true;
  
  try {
    const item = loudnessQueue.shift();
    const { filePath, fileId, originalPath, resolve, reject } = item;
    
    // キャッシュに存在するかチェック
    const cacheKey = originalPath;
    if (loudnessCache.has(cacheKey)) {
      console.log('ラウドネスキャッシュからデータを使用:', cacheKey);
      const cachedData = loudnessCache.get(cacheKey);
      
      // イベント通知（メイン処理とは別に行う）
      if (mainWindow) {
        mainWindow.webContents.send('loudness-measured', {
          id: fileId,
          loudnessInfo: cachedData
        });
      }
      
      resolve(cachedData);
    } else {
      // 実際に測定を実行
      try {
        const result = await measureLoudnessInternal(filePath);
        
        // キャッシュに保存
        loudnessCache.set(cacheKey, result);
        
        // イベント通知（メイン処理とは別に行う）
        if (mainWindow) {
          mainWindow.webContents.send('loudness-measured', {
            id: fileId,
            loudnessInfo: result
          });
        }
        
        resolve(result);
      } catch (error) {
        console.error('ラウドネス測定エラー:', error);
        
        // エラーイベントを発行
        if (mainWindow && fileId) {
          mainWindow.webContents.send('loudness-error', { id: fileId });
        }
        
        reject(error);
      }
    }
  } catch (error) {
    console.error('ラウドネスキュー処理エラー:', error);
  } finally {
    isProcessingLoudness = false;
    
    // キューに残りがあれば続けて処理
    if (loudnessQueue.length > 0) {
      processLoudnessQueue();
    }
  }
}

// LUFS測定関数 (ITU-R BS.1770-3準拠) - 内部実装
async function measureLoudnessInternal(filePath) {
  try {
    // パスの検証
    if (!filePath || typeof filePath !== 'string') {
      console.error('無効なファイルパスでのLUFS測定:', filePath);
      throw new Error('Invalid file path for loudness measurement');
    }
    
    // ファイルの存在確認
    if (!fs.existsSync(filePath)) {
      console.error('存在しないファイルでのLUFS測定:', filePath);
      throw new Error(`File not found: ${filePath}`);
    }
    
    console.log('LUFSの測定開始:', filePath);
    
    // メディア情報を取得して動画の長さを確認
    const mediaInfo = await getMediaInfo(filePath);
    const duration = mediaInfo.duration || 0;
    
    // 短い動画（10秒未満）の場合は全体を測定、それ以外は部分測定
    const isBriefClip = duration < 10;
    
    // サンプリング時間の設定（最大30秒、または動画の長さの15%のいずれか短い方）
    const sampleDuration = isBriefClip ? duration : Math.min(30, duration * 0.15);
    
    // 動画の中央部分から測定するためのオフセット計算（中央の少し手前から）
    const startOffset = isBriefClip ? 0 : Math.max(0, (duration / 2) - (sampleDuration / 2));
    
    // 解析コマンドを構築 - ffmpeg 7.1.1に最適化
    const args = [
      '-hide_banner',
      '-nostats'
    ];
    
    // 短くない動画の場合のみシーク指定を追加
    if (!isBriefClip) {
      args.push('-ss', `${startOffset}`);
      args.push('-t', `${sampleDuration}`);
    }
    
    // 入力ファイルと解析フィルタを追加
    args.push(
      '-i', filePath,
      '-filter:a', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
      '-f', 'null',
      '-'
    );
    
    console.log('ラウドネス測定コマンド:', args.join(' '));
    const { stderr } = await runFFmpegCommand(args);
    
    // 正規表現でJSON部分を抽出
    const jsonMatch = stderr.match(/\{.*\}/s);
    if (!jsonMatch) {
      console.error('JSONデータが見つかりません。FFmpeg出力:', stderr);
      throw new Error('ラウドネス解析の出力からJSONデータが取得できませんでした');
    }
    
    const loudnessData = JSON.parse(jsonMatch[0]);
    return {
      // 入力時のラウドネス値
      inputIntegratedLoudness: parseFloat(loudnessData.input_i),
      inputTruePeak: parseFloat(loudnessData.input_tp),
      inputLRA: parseFloat(loudnessData.input_lra),
      inputThreshold: parseFloat(loudnessData.input_thresh),
      
      // ターゲット値
      targetIntegratedLoudness: parseFloat(loudnessData.target_i),
      targetTruePeak: parseFloat(loudnessData.target_tp),
      targetLRA: parseFloat(loudnessData.target_lra),
      targetThreshold: parseFloat(loudnessData.target_thresh),
      
      // -14 LUFSにするためのゲイン値
      lufsGain: -14 - parseFloat(loudnessData.input_i)
    };
  } catch (error) {
    console.error('LUFS測定エラー:', error);
    throw error;
  }
}

// 外部公開用のLUFS測定関数（キューベースのラッパー）
async function measureLoudness(filePathWithId) {
  return new Promise((resolve, reject) => {
    // パラメータのチェック
    if (!filePathWithId || typeof filePathWithId !== 'string') {
      console.error('無効なファイルパス/ID形式:', filePathWithId);
      return reject(new Error('Invalid file path or ID format'));
    }
    
    // ファイルIDとパスを分離
    const [fileId, filePath] = filePathWithId.includes('|') 
      ? filePathWithId.split('|')
      : [null, filePathWithId];
    
    // パスの検証
    if (!filePath || typeof filePath !== 'string' || filePath === 'undefined' || filePath === 'null') {
      console.error('ラウドネス測定：無効なファイルパス:', filePath);
      return reject(new Error('Invalid file path for loudness measurement'));
    }
    
    // ファイルの存在確認は非同期処理で実行されるため、ここではスキップし、
    // 内部実装（measureLoudnessInternal）でチェックする

    // キューに追加
    loudnessQueue.push({
      filePath,
      fileId,
      originalPath: filePath,
      resolve,
      reject
    });
    
    // 処理開始
    processLoudnessQueue();
  });
}

// IPC通信でLUFSの測定を提供
ipcMain.handle('measure-loudness', async (event, filePath) => {
  try {
    // パスのチェック
    if (!filePath || typeof filePath !== 'string') {
      console.error('無効なファイルパスでのLUFS測定リクエスト:', filePath);
      throw new Error('Invalid file path for loudness measurement request');
    }
    
    return await measureLoudness(filePath);
  } catch (error) {
    console.error('ラウドネス測定エラー:', error);
    
    // エラーイベントを発行
    // ファイルIDを含む引数形式を想定
    const fileId = filePath && filePath.includes && filePath.includes('|') ? filePath.split('|')[0] : null;
    if (mainWindow && fileId) {
      mainWindow.webContents.send('loudness-error', { id: fileId });
    }
    
    return { error: error.message };
  }
});

// 波形データを生成
ipcMain.handle('generate-waveform', async (event, filePath, outputPath) => {
  try {
    // ファイルパスの検証
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('有効なファイルパスが指定されていません');
    }
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`ファイルが存在しません: ${filePath}`);
    }
    
    console.log('波形データ生成開始:', filePath);
    
    // PCM音声データを抽出
    const pcmOutputPath = outputPath || path.join(app.getPath('temp'), `${path.basename(filePath, path.extname(filePath))}_${Date.now()}.pcm`);
    
    // 直接FFmpegコマンドを実行（新しい方法）
    const { spawn } = require('child_process');
    
    await new Promise((resolve, reject) => {
      console.log('PCM音声データ抽出コマンド実行中...');
      const process = spawn(ffmpegPath, [
        '-i', filePath,
        '-f', 's16le',  // 16ビット符号付き整数（リトルエンディアン）形式
        '-acodec', 'pcm_s16le',
        '-ac', '1',     // モノラルに変換
        '-ar', '44100', // サンプリングレート44.1kHz
        pcmOutputPath
      ]);
      
      process.stderr.on('data', (data) => {
        console.log('FFmpeg 波形抽出:', data.toString().trim());
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          console.log('PCM抽出成功:', pcmOutputPath);
          resolve();
        } else {
          reject(new Error(`音声データ抽出に失敗しました (コード: ${code})`));
        }
      });
      
      process.on('error', (err) => {
        reject(new Error(`FFmpegプロセスエラー: ${err.message}`));
      });
    });
    
    console.log('PCMファイル読み込み中...');
    
    // PCMファイルの内容を読み取る
    const pcmData = fs.readFileSync(pcmOutputPath);
    
    // Int16Array に変換
    const waveformData = new Int16Array(new Uint8Array(pcmData).buffer);
    
    console.log(`波形データ生成: ${waveformData.length}サンプル`);
    
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
    try {
      fs.unlinkSync(pcmOutputPath);
      console.log('一時PCMファイルを削除しました');
    } catch (err) {
      console.warn('一時ファイル削除エラー:', err);
    }
    
    console.log('波形データ生成完了');
    
    return {
      success: true,
      waveform: Array.from(downsampled), // ArrayBufferをJSONで送信可能な通常の配列に変換
      sampleRate: 44100
    };
  } catch (error) {
    console.error('波形生成エラー:', error);
    return { success: false, error: error.message };
  }
});

// 進捗更新関数
function updateProgress(current, total, stage) {
  const percentage = Math.round((current / total) * 100);
  if (mainWindow) {
    mainWindow.webContents.send('export-progress', {
      current,
      total,
      percentage,
      stage
    });
  }
}

// 結合動画を書き出す
ipcMain.handle('export-combined-video', async (event, options) => {
  try {
    const { mediaFiles, outputPath, filename, settings = {} } = options;
    
    if (!mediaFiles || mediaFiles.length === 0) {
      throw new Error('エクスポートするファイルが選択されていません');
    }
    
    if (!outputPath) {
      throw new Error('出力先が選択されていません');
    }
    
    console.log('動画結合処理開始:', mediaFiles.length, '個のファイル');
    console.log('出力先:', outputPath);
    console.log('設定:', settings);
    
    // 一時フォルダを作成
    const tempDir = path.join(app.getPath('temp'), `swp1-export-${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // 進捗通知の初期化関数
    const updateProgress = (current, total, stage) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const progress = Math.round((current / total) * 100);
        console.log(`進捗状況: ${stage} ${progress}% (${current}/${total})`);
        
        mainWindow.webContents.send('export-progress', {
          stage,
          progress,
          current,
          total
        });
      }
    };
    
    // concatファイルのパス
    const concatFilePath = path.join(tempDir, 'concat.txt');
    const tempFiles = [];
    const concatFileContent = [];
    
    // ステージ1: 各ファイルを一時ファイルとしてエクスポート
    console.log('ステージ1: 個別ファイル変換開始');
    updateProgress(0, mediaFiles.length, 'converting');
    
    for (let i = 0; i < mediaFiles.length; i++) {
      const file = mediaFiles[i];
      console.log(`ファイル処理 (${i+1}/${mediaFiles.length}):`, file.path);
      
      try {
        // 出力一時ファイルパス
        const tempFilePath = path.join(tempDir, `temp-${i}.mp4`);
        
        // FFmpegコマンドを構築
        const ffmpegArgs = [
          '-hide_banner',
          '-y'  // 上書き確認なし
        ];
        
        // ビデオコーデックの選択
        let videoCodec = 'libx264';  // デフォルトはH.264
        
        // Apple Siliconでのハードウェアエンコード設定
        if (settings.useHardwareAcceleration) {
          const hwaccelSupport = await checkVideoToolboxSupport();
          if (hwaccelSupport.videotoolbox) {
            console.log('VideoToolboxを使用したハードウェアエンコードを有効化');
            ffmpegArgs.push('-hwaccel', 'videotoolbox');
            
            if (settings.codec === 'h265') {
              videoCodec = 'hevc_videotoolbox';
            } else {
              videoCodec = 'h264_videotoolbox';
            }
          } else {
            console.log('ハードウェアエンコードはサポートされていません、ソフトウェアエンコードを使用します');
            if (settings.codec === 'h265') {
              videoCodec = 'libx265';
            }
          }
        } else {
          // ソフトウェアエンコード
          if (settings.codec === 'h265') {
            videoCodec = 'libx265';
          }
        }
        
        // 入力ファイル
        ffmpegArgs.push('-i', file.path);
        
        // 開始時間と終了時間の設定（トリミング）
        if (file.trimStart || file.trimEnd) {
          if (file.trimStart) {
            ffmpegArgs.push('-ss', file.trimStart);
          }
          
          if (file.trimEnd) {
            // 継続時間ではなく終了時間が指定されている場合
            ffmpegArgs.push('-to', file.trimEnd);
          }
        }
        
        // ビデオ設定
        ffmpegArgs.push('-c:v', videoCodec);
        
        // 品質設定
        if (settings.quality === 'high') {
          ffmpegArgs.push('-crf', '18');  // 高品質
        } else if (settings.quality === 'low') {
          ffmpegArgs.push('-crf', '28');  // 低品質
        } else {
          // デフォルトは中品質
          ffmpegArgs.push('-crf', '23');
        }
        
        // 解像度設定
        if (settings.resolution) {
          ffmpegArgs.push('-vf', `scale=${settings.resolution}`);
        }
        
        // プリセット設定
        ffmpegArgs.push('-preset', settings.preset || 'medium');
        
        // H.265固有の設定
        if (settings.codec === 'h265') {
          ffmpegArgs.push('-tag:v', 'hvc1');  // Appleデバイス互換性
        }
        
        // 静止画の場合は特別な処理
        const ext = path.extname(file.path).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
          ffmpegArgs.splice(1, 0, '-loop', '1', '-t', '5');
        }
        
        // 音声処理
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
        
        // 最終的なファイルパスを追加
        ffmpegArgs.push(tempFilePath);
        
        // 新しいFFmpegサービスを使用して処理を開始
        const result = await ffmpegServiceManager.processFFmpeg(ffmpegArgs);
        console.log(`ファイル変換タスク開始 (${i+1}/${mediaFiles.length}):`, result.taskId);
        
        // タスク進捗監視を開始
        startTaskProgress(result.taskId, {
          type: 'export',
          data: {
            stage: 'converting',
            current: i,
            total: mediaFiles.length
          }
        });
        
        // タスクが完了するまで待機
        let taskStatus = null;
        let isCompleted = false;
        
        while (!isCompleted) {
          await new Promise(resolve => setTimeout(resolve, 500));
          taskStatus = await ffmpegServiceManager.getTaskStatus(result.taskId);
          
          if (taskStatus.status === 'completed') {
            isCompleted = true;
          } else if (taskStatus.status === 'failed' || taskStatus.status === 'error') {
            throw new Error(`ファイル変換エラー: ${taskStatus.stderr || 'Unknown error'}`);
          }
        }
        
        // 一時ファイルリストに追加
        tempFiles.push(tempFilePath);
        
        // concat用のエントリを追加
        concatFileContent.push(`file '${tempFilePath.replace(/'/g, "'\\''")}'`);
        
        // 進捗更新
        updateProgress(i + 1, mediaFiles.length, 'converting');
      } catch (error) {
        console.error(`ファイル変換エラー (${file.path}):`, error);
        // エラーが発生してもスキップして次のファイルを処理
      }
    }
    
    if (tempFiles.length === 0) {
      throw new Error('変換可能なファイルがありませんでした');
    }
    
    // ステージ2: 変換済みファイルを結合
    console.log('ステージ2: ファイル結合開始');
    updateProgress(0, 1, 'combining');
    
    // 一時ファイルリストをファイルに書き出し
    let fileContent = '';
    for (const file of tempFiles) {
      fileContent += `file '${file.replace(/'/g, "'\\''")}'\n`;
    }
    fs.writeFileSync(concatFilePath, fileContent);
    
    // 出力ファイル名
    const ext = settings.format || 'mp4';
    const outputFileName = filename || `export_${Date.now()}.${ext}`;
    let outputFilePath = path.join(outputPath, outputFileName);
    
    // 出力ファイルが既に存在する場合は確認
    if (fs.existsSync(outputFilePath)) {
      console.log(`出力ファイルが既に存在します: ${outputFilePath}`);
      // ファイル名に日時を追加して重複を避ける
      const timestamp = Date.now();
      const parts = outputFileName.split('.');
      const newName = `${parts[0]}_${timestamp}.${parts[parts.length - 1]}`;
      console.log(`新しいファイル名に変更して書き出します: ${newName}`);
      outputFilePath = path.join(outputPath, newName);
    }
    
    // 結合時は再エンコードなしで結合（より安全なオプション追加）
    const concatArgs = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFilePath,
      '-map', '0:v?',    // ビデオストリームのみマップ（存在する場合）
      '-map', '0:a?',    // オーディオストリームのみマップ（存在する場合）
      '-c', 'copy',      // 再エンコードなし
      '-ignore_unknown', // 未知のストリームタイプを無視
      '-movflags', '+faststart',  // Web配信に適した形式
    ];
    
    // H.265（HEVC）コーデックの場合のタグ設定
    if (settings.codec === 'h265') {
      concatArgs.push('-tag:v', 'hvc1');
    } else if (settings.codec === 'h264') {
      concatArgs.push('-tag:v', 'avc1');
    }
    
    // 出力ファイルパスを追加
    concatArgs.push('-y', outputFilePath);
    
    console.log('FFmpeg結合コマンド:', concatArgs.join(' '));
    
    // 新しいFFmpegサービスを使用して結合処理を開始
    const concatResult = await ffmpegServiceManager.processFFmpeg(concatArgs);
    console.log('結合タスク開始:', concatResult.taskId);
    
    // タスク進捗監視を開始
    startTaskProgress(concatResult.taskId, {
      type: 'export',
      data: {
        stage: 'combining',
        current: 0,
        total: 1
      }
    });
    
    // タスクが完了するまで待機
    let concatStatus = null;
    let isCompleted = false;
    
    while (!isCompleted) {
      await new Promise(resolve => setTimeout(resolve, 500));
      concatStatus = await ffmpegServiceManager.getTaskStatus(concatResult.taskId);
      
      if (concatStatus.status === 'completed') {
        isCompleted = true;
      } else if (concatStatus.status === 'failed' || concatStatus.status === 'error') {
        throw new Error(`ファイル結合エラー: ${concatStatus.stderr || 'Unknown error'}`);
      }
    }
    
    updateProgress(1, 1, 'combining');
    
    // 一時ファイルの削除
    try {
      for (const file of tempFiles) {
        fs.unlinkSync(file);
      }
      fs.unlinkSync(concatFilePath);
      fs.rmdirSync(tempDir);
    } catch (cleanupError) {
      console.warn('一時ファイルの削除に失敗:', cleanupError);
    }
    
    console.log('動画結合処理完了:', outputFilePath);
    
    return {
      success: true,
      outputPath: outputFilePath
    };
  } catch (error) {
    console.error('動画結合処理エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// デスクトップパスを取得
ipcMain.handle('get-desktop-path', () => {
  return app.getPath('desktop');
});

// タスク管理システム関連のハンドラー登録
// タスク一覧取得
ipcMain.handle('get-task-list', async () => {
  return taskManager.getTasksSummary();
});

// タスクキャンセル
ipcMain.handle('cancel-task', async (event, taskId) => {
  return taskManager.cancelTask(taskId);
});

// タスク更新イベントをレンダラープロセスに送信
taskManager.on('tasks-updated', (taskSummary) => {
  // 全ウィンドウにイベントを送信
  BrowserWindow.getAllWindows().forEach(window => {
    if (!window.isDestroyed()) {
      window.webContents.send('tasks-updated', taskSummary);
    }
  });
});

// FFmpegサービスからのタスクイベントをタスク管理システムに統合
ffmpegServiceManager.on('task-created', (taskId, options) => {
  // FFmpegタスクをタスク管理システムに登録
  const globalTaskId = taskManager.createTask({
    type: options.type || 'encode',
    fileId: options.fileId,
    fileName: options.fileName || path.basename(options.input || '不明なファイル'),
    cancellable: true,
    details: options.details || `FFmpeg処理: ${options.command || ''}`
  });
  
  // FFmpegタスクIDとグローバルタスクIDのマッピングを保存
  ffmpegTaskMap.set(taskId, globalTaskId);
});

// FFmpegタスクとグローバルタスクのマッピング
const ffmpegTaskMap = new Map();

// FFmpegタスクの進捗更新イベント
ffmpegServiceManager.on('task-progress', (taskId, progress) => {
  const globalTaskId = ffmpegTaskMap.get(taskId);
  if (globalTaskId) {
    taskManager.updateTask(globalTaskId, {
      status: 'processing',
      progress: progress.percent || 0
    });
  }
});

// FFmpegタスクの完了イベント
ffmpegServiceManager.on('task-completed', (taskId, result) => {
  const globalTaskId = ffmpegTaskMap.get(taskId);
  if (globalTaskId) {
    taskManager.updateTask(globalTaskId, {
      status: 'completed',
      progress: 100,
      details: result ? `完了: ${JSON.stringify(result)}` : '処理完了'
    });
    ffmpegTaskMap.delete(taskId);
  }
});

// FFmpegタスクのエラーイベント
ffmpegServiceManager.on('task-error', (taskId, error) => {
  const globalTaskId = ffmpegTaskMap.get(taskId);
  if (globalTaskId) {
    taskManager.updateTask(globalTaskId, {
      status: 'error',
      error: error.message || 'FFmpeg処理中にエラーが発生しました',
      details: error.details || null
    });
    ffmpegTaskMap.delete(taskId);
  }
});

// FFmpegタスクのキャンセルイベント
ffmpegServiceManager.on('task-cancelled', (taskId, result) => {
  const globalTaskId = ffmpegTaskMap.get(taskId);
  if (globalTaskId) {
    taskManager.updateTask(globalTaskId, {
      status: 'cancelled',
      progress: 0,
      details: 'タスクはキャンセルされました'
    });
    ffmpegTaskMap.delete(taskId);
  }
});

// タスクキャンセルリクエストの処理
taskManager.on('task-cancel-requested', async (taskId, taskType) => {
  // FFmpegタスクのキャンセル処理
  for (const [ffmpegTaskId, globalTaskId] of ffmpegTaskMap.entries()) {
    if (globalTaskId === taskId) {
      try {
        const result = await ffmpegServiceManager.cancelTask(ffmpegTaskId);
        console.log(`タスク ${taskId} のキャンセル結果:`, result);
        
        // タスクをキャンセル状態に更新（成功した場合のみ）
        if (result && result.success) {
          taskManager.updateTask(taskId, {
            status: 'cancelled',
            progress: 0,
            details: 'キャンセル処理が完了しました'
          });
        }
      } catch (error) {
        console.error(`FFmpegタスク ${ffmpegTaskId} のキャンセルに失敗:`, error);
        // キャンセル処理に失敗した場合も通知
        taskManager.updateTask(taskId, {
          error: `キャンセル処理中にエラーが発生しました: ${error.message || '不明なエラー'}`
        });
      }
      break;
    }
  }
});

// タスク進捗状況をポーリングするバックグラウンド処理
const activeTasks = new Map();

// タスク進捗状況の監視を開始
function startTaskProgress(taskId, options = {}) {
  if (activeTasks.has(taskId)) {
    // 既に監視中の場合は何もしない
    return;
  }
  
  console.log(`タスク ${taskId} の進捗監視を開始`);
  
  const intervalId = setInterval(async () => {
    try {
      const status = await ffmpegServiceManager.getTaskStatus(taskId);
      
      // タスクが完了または失敗した場合は監視を停止
      if (status.status === 'completed' || status.status === 'failed' || status.status === 'error' || status.status === 'cancelled') {
        stopTaskProgress(taskId);
      }
      
      // 進捗情報をレンダラープロセスに送信
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ffmpeg-task-progress', {
          taskId,
          status: status.status,
          progress: status.progress || 0,
          ...status
        });
        
        // 特定のタスク種別の場合、専用のイベントも発行
        if (options.type === 'export') {
          mainWindow.webContents.send('export-progress', {
            progress: status.progress || 0,
            status: status.status,
            ...options.data
          });
        } else if (options.type === 'loudness') {
          // 完了時のみ通知
          if (status.status === 'completed') {
            mainWindow.webContents.send('loudness-measured', {
              ...options.data,
              result: status.result
            });
          } else if (status.status === 'failed' || status.status === 'error') {
            mainWindow.webContents.send('loudness-error', {
              error: status.stderr || 'Unknown error'
            });
          }
        }
      }
    } catch (error) {
      console.error(`タスク ${taskId} の進捗取得エラー:`, error);
      
      // エラー発生時も監視を停止
      stopTaskProgress(taskId);
    }
  }, 500); // 500ミリ秒ごとに更新
  
  // タスク情報を保存
  activeTasks.set(taskId, {
    intervalId,
    options,
    startTime: Date.now()
  });
}

// タスク進捗状況の監視を停止
function stopTaskProgress(taskId) {
  const task = activeTasks.get(taskId);
  if (task) {
    clearInterval(task.intervalId);
    activeTasks.delete(taskId);
    console.log(`タスク ${taskId} の進捗監視を停止 (所要時間: ${(Date.now() - task.startTime) / 1000}秒)`);
  }
}