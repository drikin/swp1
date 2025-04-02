const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');

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

// fluent-ffmpegにパスを設定
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
app.whenReady().then(() => {
  createWindow();
  
  // 一時ディレクトリを作成
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
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
  video: ['mp4', 'mov', 'avi', 'webm', 'mkv', 'mts', 'm2ts', 'mpg', 'mpeg', 'hevc', 'h265', 'h264'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp']
};

// サムネイルを生成する関数
async function generateThumbnail(filePath, fileId) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    // サムネイルを一時ディレクトリに保存
    const thumbnailPath = path.join(tempDir, `thumbnail-${fileId}.jpg`);
    
    // 動画と画像で異なる処理
    if (['.mp4', '.mov', '.avi', '.webm', '.mkv', '.mts', '.m2ts'].includes(ext)) {
      // 動画ファイルの場合
      await runFFmpegCommand([
        '-i', filePath,
        '-ss', '00:00:01',        // 1秒目のフレームを取得
        '-vframes', '1',          // 1フレームのみ
        '-vf', 'scale=120:-1',    // 幅120pxに変換
        '-y',                     // 既存ファイルを上書き
        thumbnailPath
      ]);
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'].includes(ext)) {
      // 画像ファイルの場合
      await runFFmpegCommand([
        '-i', filePath,
        '-vf', 'scale=120:-1',    // 幅120pxに変換
        '-y',                     // 既存ファイルを上書き
        thumbnailPath
      ]);
    } else {
      return null; // サポートされていない形式
    }
    
    // 生成されたサムネイルをBase64エンコード
    if (fs.existsSync(thumbnailPath)) {
      const imageBuffer = fs.readFileSync(thumbnailPath);
      if (imageBuffer.length > 0) {
        const base64Data = imageBuffer.toString('base64');
        // サムネイル生成に成功したことをレンダラープロセスに通知
        if (mainWindow) {
          mainWindow.webContents.send('thumbnail-generated', {
            id: fileId,
            thumbnail: `data:image/jpeg;base64,${base64Data}`
          });
        }
        return `data:image/jpeg;base64,${base64Data}`;
      }
    }
    
    return null;
  } catch (error) {
    console.error('サムネイル生成エラー:', error);
    return null;
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

// FFmpegコマンドを実行する関数
function runFFmpegCommand(args) {
  return new Promise((resolve, reject) => {
    console.log('FFmpeg実行:', args.join(' '));
    
    // より大きなバッファサイズを確保して「stdout/stderr maxBuffer exceeded」を防止
    const process = spawn(ffmpegPath, args, {
      maxBuffer: 10 * 1024 * 1024  // 10MBのバッファ
    });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (chunk.trim()) {  // 空白行を避ける
        console.log('FFmpeg stdout:', chunk.trim());
      }
    });
    
    // ログ出力量の制限（非常に長いログを避ける）
    let logLines = 0;
    const maxLogLines = 100;
    
    process.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      
      // ログの行数を制限
      if (logLines < maxLogLines) {
        const lines = chunk.split('\n').filter(l => l.trim());
        for (const line of lines) {
          if (logLines < maxLogLines) {
            // 進捗情報のみログ出力を間引く（フレーム情報は頻度が高すぎる）
            if (!line.startsWith('frame=')) {
              console.log('FFmpeg stderr:', line);
            } else if (logLines % 10 === 0) {  // 10行に1回だけ進捗情報を出力
              console.log('FFmpeg進捗:', line);
            }
            logLines++;
          } else {
            // 最大行数に達したら要約メッセージを表示
            if (logLines === maxLogLines) {
              console.log('FFmpeg: ログが多すぎるため以降は省略します...');
              logLines++;
            }
            break;
          }
        }
      }
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        console.log('FFmpeg処理成功');
        resolve({ stdout, stderr });
      } else {
        console.error(`FFmpeg処理失敗 (コード ${code}):`);
        // エラーの概要のみを出力（長すぎるエラーを避ける）
        const errorSummary = stderr.split('\n')
          .filter(line => line.includes('Error') || line.includes('failed') || line.includes('Invalid'))
          .slice(0, 10)
          .join('\n');
        console.error('エラー概要:', errorSummary || 'エラー詳細が見つかりません');
        reject(new Error(`FFmpeg process exited with code ${code}: ${stderr}`));
      }
    });
    
    process.on('error', (err) => {
      console.error('FFmpegプロセスエラー:', err);
      reject(err);
    });
  });
}

// FFprobeコマンドを実行する関数（メタデータ取得用）
function runFFprobeCommand(args) {
  return new Promise((resolve, reject) => {
    console.log('FFprobe実行:', args.join(' '));
    const process = spawn('ffprobe', args, {
      maxBuffer: 10 * 1024 * 1024  // 10MBのバッファ
    });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (chunk.trim()) {  // 空白行を避ける
        console.log('FFprobe stdout:', chunk.trim());
      }
    });
    
    // ログ出力量の制限（非常に長いログを避ける）
    let logLines = 0;
    const maxLogLines = 100;
    
    process.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      
      // ログの行数を制限
      if (logLines < maxLogLines) {
        const lines = chunk.split('\n').filter(l => l.trim());
        for (const line of lines) {
          if (logLines < maxLogLines) {
            // 進捗情報のみログ出力を間引く（フレーム情報は頻度が高すぎる）
            if (!line.startsWith('frame=')) {
              console.log('FFprobe stderr:', line);
            } else if (logLines % 10 === 0) {  // 10行に1回だけ進捗情報を出力
              console.log('FFprobe進捗:', line);
            }
            logLines++;
          } else {
            // 最大行数に達したら要約メッセージを表示
            if (logLines === maxLogLines) {
              console.log('FFprobe: ログが多すぎるため以降は省略します...');
              logLines++;
            }
            break;
          }
        }
      }
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        console.log('FFprobe処理成功');
        resolve({ stdout, stderr });
      } else {
        console.error(`FFprobe処理失敗 (コード ${code}):`);
        // エラーの概要のみを出力（長すぎるエラーを避ける）
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
    // バージョン情報取得
    const versionResult = await runFFmpegCommand(['-version']);
    const versionMatch = versionResult.stdout.match(/ffmpeg version ([^ ]+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';
    
    // VideoToolboxのサポートを確認
    const hwaccelSupport = await checkVideoToolboxSupport();
    
    return { 
      available: true, 
      version: version,
      path: ffmpegPath,
      hwaccel: hwaccelSupport
    };
  } catch (error) {
    console.error('FFmpeg error:', error);
    return { 
      available: false, 
      error: error.message 
    };
  }
});

// メディア情報を取得する関数
async function getMediaInfo(filePath) {
  try {
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
      duration: 0,
      video: false,
      audio: false,
      width: 0,
      height: 0,
      format: ''
    };
    
    // フォーマット情報を抽出
    if (info.format) {
      if (info.format.duration) {
        result.duration = parseFloat(info.format.duration);
      }
      if (info.format.format_name) {
        result.format = info.format.format_name;
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
        if (mainWindow) {
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
    // ファイルIDとパスを分離
    const [fileId, filePath] = filePathWithId.includes('|') 
      ? filePathWithId.split('|')
      : [null, filePathWithId];
    
    if (!filePath) {
      return reject(new Error('無効なファイルパス'));
    }

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
    return await measureLoudness(filePath);
  } catch (error) {
    console.error('ラウドネス測定エラー:', error);
    
    // エラーイベントを発行
    // ファイルIDを含む引数形式を想定
    const fileId = filePath.includes('|') ? filePath.split('|')[0] : null;
    if (mainWindow && fileId) {
      mainWindow.webContents.send('loudness-error', { id: fileId });
    }
    
    return { error: error.message };
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
ipcMain.handle('export-combined-video', async (event, { mediaFiles, outputPath, settings, filename }) => {
  const tempDir = path.join(app.getPath('temp'), `swp1-export-${Date.now()}`);
  const tempFiles = [];
  const concatFilePath = path.join(tempDir, 'concat.txt');
  
  // 一時ディレクトリを作成（毎回新しい一時ディレクトリを作成して重複回避）
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  try {
    // 解像度をピクセル値に変換
    let resolution;
    switch (settings.resolution) {
      case '720p':
        resolution = '1280:720';
        break;
      case '1080p':
        resolution = '1920:1080';
        break;
      case '2k':
        resolution = '2560:1440';
        break;
      case '4k':
        resolution = '3840:2160';
        break;
      default:
        resolution = '1920:1080';
    }
    
    // コーデックオプションを設定
    const hwaccel = await checkVideoToolboxSupport();
    
    // ステージ1: 各素材を統一フォーマットに変換
    console.log('ステージ1: 素材変換開始');
    updateProgress(0, mediaFiles.length, 'converting');
    
    const concatFileContent = [];
    
    for (let i = 0; i < mediaFiles.length; i++) {
      const file = mediaFiles[i];
      const tempFilePath = path.join(tempDir, `temp_${i}_${Date.now()}.mp4`);
      
      console.log(`ファイル ${i+1}/${mediaFiles.length} を変換中:`, file.path);
      
      let ffmpegArgs = [
        '-i', file.path,
        '-vf', `scale=${resolution}:force_original_aspect_ratio=decrease,pad=${resolution}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
        '-r', settings.fps,
        '-pix_fmt', 'yuv420p'
      ];
      
      // トリムが設定されている場合
      if (typeof file.trimStart === 'number' && typeof file.trimEnd === 'number' && file.trimStart < file.trimEnd) {
        // トリムの開始と終了時間を設定
        const start = file.trimStart;
        const duration = file.trimEnd - file.trimStart;
        
        console.log(`Applying trim for ${file.path}: start=${start}s, duration=${duration}s`);
        
        // -ss（開始位置）と-t（継続時間）を追加
        ffmpegArgs.splice(1, 0, '-ss', start.toString());
        ffmpegArgs.splice(3, 0, '-t', duration.toString());
      }
      
      // Loudness 正規化がオンの場合
      if (file.loudnessNormalization !== false) {
        try {
          // まだLUFS情報がない場合は測定
          let loudnessInfo = file.loudnessInfo;
          
          if (!loudnessInfo) {
            loudnessInfo = await measureLoudness(file.path);
            // mainWindow?.webContents.send('loudness-measured', { id: file.id, loudnessInfo });
          }
          
          // YouTubeの推奨値である-14 LUFSに合わせて正規化
          ffmpegArgs.push('-af', `loudnorm=I=-14:LRA=11:TP=-1.5`);
          
          console.log(`ラウドネス正規化適用: ${file.path} (現在: ${loudnessInfo.inputIntegratedLoudness} LUFS → 目標: -14 LUFS)`);
        } catch (error) {
          console.error('ラウドネス正規化エラー:', error);
          // エラーが発生してもラウドネス正規化をスキップして処理を続行
        }
      }
      
      // ハードウェアエンコーダー（H.264/H.265）またはProResを選択
      if (settings.codec === 'h264') {
        if (hwaccel) {
          // macOSのVideoToolboxを使用（H.264）
          ffmpegArgs.push('-c:v', 'h264_videotoolbox', '-b:v', '20M');
        } else {
          // ソフトウェアエンコーダーを使用
          ffmpegArgs.push('-c:v', 'libx264', '-crf', '22', '-preset', 'fast');
        }
      } else if (settings.codec === 'h265') {
        if (hwaccel) {
          // macOSのVideoToolboxを使用（H.265/HEVC）
          ffmpegArgs.push('-c:v', 'hevc_videotoolbox', '-b:v', '20M');
        } else {
          // ソフトウェアエンコーダーを使用
          ffmpegArgs.push('-c:v', 'libx265', '-crf', '26', '-preset', 'fast');
        }
      } else if (settings.codec === 'prores_hq') {
        // ProRes HQ
        ffmpegArgs.push('-c:v', 'prores_ks', '-profile:v', '3', '-qscale:v', '5');
      }
      
      try {
        // 画像ファイルの場合、特別な処理を追加
        if (file.type === 'image') {
          // 画像ファイルを5秒間の動画に変換（必要に応じて時間を調整可能）
          ffmpegArgs.splice(1, 0, '-loop', '1', '-t', '5');
        }
        
        // 音声処理
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
        
        // 最終的なファイルパスを追加
        ffmpegArgs.push(tempFilePath);
        
        // FFmpegコマンドを実行
        await runFFmpegCommand(ffmpegArgs);
        
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
    
    // FFmpeg実行
    await runFFmpegCommand(concatArgs);
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

// その他のIPC処理をここに追加 