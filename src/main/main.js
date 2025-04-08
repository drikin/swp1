const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const url = require('url');
const { spawn } = require('child_process');
const { execSync } = require('child_process');
const ffmpegServiceManager = require('./ffmpeg-service-manager');

// 新しいタスク管理システムをインポート
const { initializeTaskSystem } = require('./task-init');

// グローバルの参照を保持
let globalTaskManager = null;

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

// 作業ディレクトリのパス
const workDir = path.join(os.homedir(), 'Super Watarec');
const thumbnailDir = path.join(workDir, 'thumbnails');

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
    console.log('====== アプリケーション起動シーケンス開始 ======');
    
    // FFmpegのパスを保存（既にグローバル変数で設定済み）
    global.ffmpegPath = ffmpegPath;
    
    console.log('FFmpeg path:', ffmpegPath);
    
    // ウィンドウを作成
    console.log('メインウィンドウを作成します...');
    createWindow();
    console.log('メインウィンドウ作成完了');
    
    // 作業ディレクトリを作成
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
      console.log('作業ディレクトリを作成しました:', workDir);
    }
    
    // サムネイルディレクトリを作成
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
      console.log('サムネイルディレクトリを作成しました:', thumbnailDir);
    }
    console.log('作業ディレクトリの確認完了');
    
    // タスク管理システムの初期化
    console.log('タスク管理システムの初期化を開始します...');
    // IPC Mainと新しいタスクマネージャーを初期化
    const taskManager = initializeTaskSystem(ipcMain);
    console.log('initializeTaskSystem結果:', taskManager ? 'インスタンス生成成功' : 'インスタンス生成失敗');

    if (taskManager) {
      // グローバル変数に設定
      globalTaskManager = taskManager;
      console.log('globalTaskManagerを設定しました');

      // ウィンドウにタスクマネージャーを設定
      mainWindow.taskManager = taskManager;
      console.log('メインウィンドウをタスクマネージャーに設定しました');

      // タスク関連のイベントリスナーを追加
      setupTaskEventListeners(mainWindow);
      console.log('タスクイベントリスナーを設定しました');
      
      // タスクマネージャーが持つメソッドの確認
      console.log('タスクマネージャーのメソッド:', 
        'getAllTasks:', typeof taskManager.getAllTasks, 
        'getTaskById:', typeof taskManager.getTaskById,
        'getTasksByMedia:', typeof taskManager.getTasksByMedia
      );
    }
  
    // メディア関連APIが登録されていることを確認するため、直接再登録する
    const { registerMediaAPI } = require('./api/media-api');
    try {
      console.log('メディア関連APIを直接登録します...');
      registerMediaAPI(ipcMain);
      console.log('メディア関連APIの登録が完了しました');
    } catch (error) {
      console.error('メディア関連APIの登録中にエラーが発生しました:', error);
    }

    // サムネイル生成用のAPIハンドラを直接登録
    console.log('サムネイル生成ハンドラを直接登録します...');
    try {
      // 既存のハンドラを削除（エラーを無視）
      try {
        ipcMain.removeHandler('generate-thumbnail');
        console.log('既存のgenerate-thumbnailハンドラを削除しました');
      } catch (err) {
        // ハンドラが存在しない場合は無視
      }
      
      // サムネイル生成ハンドラを登録
      ipcMain.handle('generate-thumbnail', async (event, pathOrParams, fileId) => {
        console.log('サムネイル生成リクエスト受信:', pathOrParams, fileId);
        const result = await generateThumbnail(pathOrParams, fileId);
        console.log('サムネイル生成結果:', result);
        return result;
      });
      console.log('サムネイル生成ハンドラを登録しました');
    } catch (error) {
      console.error('サムネイル生成ハンドラの登録中にエラーが発生しました:', error);
    }

    // FFmpegサービスの起動
    ffmpegServiceManager.start().catch(error => {
      console.error('FFmpegサービス起動エラー:', error);
    });
    
    // FFmpegサービスの準備が完了したらハードウェアエンコード対応確認を実行
    ffmpegServiceManager.onReady(() => {
      console.log('FFmpegサービスの準備が完了しました。ハードウェアエンコード対応確認を実行します。');
      checkVideoToolboxSupport().then(hwaccelSupport => {
        console.log('VideoToolbox対応状況確認完了:', hwaccelSupport);
      }).catch(error => {
        console.error('VideoToolbox対応確認エラー:', error);
      });
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
  }
});

// アプリ終了フラグ
let isQuitting = false;

// アプリが終了する前にクリーンアップ
app.on('before-quit', async (event) => {
  // 初回の終了イベントでは終了をキャンセルし、クリーンアップを実行
  if (!isQuitting) {
    // 終了プロセスを一度だけ実行
    event.preventDefault();
    isQuitting = true;
    
    console.log('アプリケーション終了処理を開始します...');
    
    try {
      // 新しいタスク管理システムのデータを保存
      if (globalTaskManager) {
        console.log('タスク状態を保存しています...');
        await globalTaskManager._saveTasks().catch(error => {
          console.error('タスク状態の保存エラー:', error);
        });
        
        // すべてのタスクをキャンセル
        console.log('実行中のタスクをキャンセルしています...');
        await globalTaskManager.cancelAllTasks().catch(error => {
          console.error('タスクキャンセルエラー:', error);
        });
      }
      
      // FFmpegサービスの停止と残存FFmpegプロセスの終了
      console.log('FFmpegサービスを停止し、残存プロセスを終了します...');
      await ffmpegServiceManager.stop().catch(error => {
        console.error('FFmpegサービス停止エラー:', error);
      });
      
      // 残存FFmpegプロセスを強制終了（念のため）
      console.log('残存FFmpegプロセスの強制終了を確認します...');
      await ffmpegServiceManager.killAllFFmpegProcesses().catch(error => {
        console.error('FFmpegプロセス強制終了エラー:', error);
      });
    } catch (error) {
      console.error('アプリケーション終了処理エラー:', error);
    } finally {
      console.log('アプリケーション終了処理が完了しました、終了します');
      // 終了処理が完了したため、アプリケーションを終了
      setTimeout(() => app.quit(), 500);
    }
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
async function generateThumbnail(pathOrParams, fileId) {
  try {
    console.log('サムネイル生成開始 - 引数:', pathOrParams, 'ID:', fileId);
    
    // パラメータの正規化
    let filePath, mediaId;
    
    // オブジェクト形式のパラメータ対応
    if (typeof pathOrParams === 'object') {
      filePath = pathOrParams.filePath || pathOrParams.path;
      mediaId = pathOrParams.fileId || pathOrParams.mediaId || fileId;
      console.log('オブジェクト形式のパラメータを処理:', { filePath, mediaId });
    } else {
      filePath = pathOrParams;
      mediaId = fileId;
      console.log('文字列形式のパラメータを処理:', { filePath, mediaId });
    }
    
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
    if (!mediaId) {
      // IDが提供されていない場合は、ファイル名からIDを生成
      mediaId = `file-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      console.log('IDが提供されていないため新しいIDを生成:', mediaId);
    }
    
    const ext = path.extname(filePath).toLowerCase();
    // サムネイルをサムネイルディレクトリに保存
    const thumbnailPath = path.join(thumbnailDir, `thumbnail-${mediaId}.jpg`);
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
    
    // 生成されたサムネイルファイルをチェック
    if (fs.existsSync(thumbnailPath)) {
      const fileStats = fs.statSync(thumbnailPath);
      if (fileStats.size > 0) {
        console.log('サムネイル生成成功、ファイルサイズ:', fileStats.size);
        
        // シンプルにファイルパスをデータとして準備
        const thumbnailData = {
          id: mediaId,
          filePath: thumbnailPath
        };
        
        // サムネイル生成に成功したことをレンダラープロセスに通知
        if (mainWindow) {
          console.log('サムネイル生成通知送信 ID:', mediaId);
          try {
            mainWindow.webContents.send('thumbnail-generated', thumbnailData);
          } catch (err) {
            console.error('サムネイル通知のIPC送信エラー:', err);
          }
        } else {
          console.error('mainWindowが利用できません');
        }
        
        // ファイルパスを返す（文字列として）
        return thumbnailPath;
      } else {
        console.error('サムネイル画像ファイルが空です');
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
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`FFprobe process exited with code ${code}`));
        }
      });
      
      process.on('error', (err) => {
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
              name: entry.name,
              path: fullPath,
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
    // 複数の方法を組み合わせて検出
    let hasVideoToolbox = false;
    
    // 方法1: hwaccelsコマンドでの検出
    try {
      const hwaccelsResult = await runFFmpegCommand(['-hwaccels']);
      console.log('FFmpeg利用可能ハードウェアアクセラレーション:', hwaccelsResult.stdout);
      if (hwaccelsResult.stdout.includes('videotoolbox')) {
        hasVideoToolbox = true;
        console.log('hwaccelsコマンドでVideoToolboxを検出しました');
      }
    } catch (err) {
      console.warn('hwaccelsコマンド実行エラー:', err);
    }
    
    // 方法2: encodersの詳細出力での検出
    if (!hasVideoToolbox) {
      try {
        const encodersResult = await runFFmpegCommand(['-encoders']);
        console.log('FFmpegエンコーダー出力（一部）:', encodersResult.stdout.slice(0, 200) + '...');
        if (encodersResult.stdout.includes('videotoolbox')) {
          hasVideoToolbox = true;
          console.log('encodersコマンドでVideoToolboxを検出しました');
        }
      } catch (err) {
        console.warn('encodersコマンド実行エラー:', err);
      }
    }
    
    // 方法3: OSによる判定（最終手段）
    const isMac = process.platform === 'darwin';
    if (!hasVideoToolbox && isMac) {
      // macOSなら基本的にVideoToolboxが使える
      console.log('OS検出によりmacOSを検出、VideoToolboxが利用可能と仮定します');
      hasVideoToolbox = true;
    }
    
    // 結果を返す
    const hwaccelSupport = {
      h264: hasVideoToolbox,
      hevc: hasVideoToolbox,
      isHardwareAccelerated: hasVideoToolbox,
      supportedCodecs: hasVideoToolbox ? ['h264_videotoolbox', 'hevc_videotoolbox'] : [],
      hwaccelEngine: hasVideoToolbox ? 'videotoolbox' : null,
      detectionMethod: hasVideoToolbox ? 
        (hwaccelsResult?.stdout?.includes('videotoolbox') ? 'hwaccels' : 
         (encodersResult?.stdout?.includes('videotoolbox') ? 'encoders' : 'os-detection')) : 'none'
    };
    
    console.log('VideoToolbox対応状況（複合検出）:', hwaccelSupport);
    return hwaccelSupport;
  } catch (error) {
    console.warn('ハードウェアエンコード対応確認エラー:', error);
    // macOSのデフォルト値
    const isMac = process.platform === 'darwin';
    return { 
      h264: isMac, 
      hevc: isMac, 
      isHardwareAccelerated: isMac,
      supportedCodecs: isMac ? ['h264_videotoolbox', 'hevc_videotoolbox'] : [],
      hwaccelEngine: isMac ? 'videotoolbox' : null,
      detectionMethod: 'fallback'
    };
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
    
    // ハードウェアアクセラレーション状態を表示するためのタグを追加
    const hwTag = hwaccelSupport.isHardwareAccelerated ? '(HW)' : '(SW)';
    const versionWithHWTag = `${version} ${hwTag}`;
    
    // デバッグログ - レンダラープロセスに送る情報を確認
    console.log('FFmpeg情報（送信データ）:', {
      available: true,
      version: version,
      versionWithHWTag: versionWithHWTag,
      hwTag: hwTag,
      hwaccel: hwaccelSupport
    });
    
    // レンダラープロセスに結果を返す（修正済み）
    return { 
      available: true, 
      version: version,
      versionWithHWTag: versionWithHWTag,
      hwTag: hwTag,
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
/* 重複登録のため削除
ipcMain.handle('get-media-info', async (event, filePath) => {
  return await getMediaInfo(filePath);
});
*/

// サムネイル生成ハンドラーもtask-api.jsに統合済み
// 'generate-thumbnail'ハンドラーは削除しました

// 以下の旧式のLUFS測定関連コードは新しいタスク管理システムに統合済みのため削除しました
// ラウドネス測定処理は task-api.js の measure-loudness ハンドラーを使用してください

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
      console.log('新しいファイル名に変更して書き出します:', newName);
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
  return globalTaskManager.getTasksSummary();
});

// FFmpegサービスからのタスクイベントをタスク管理システムに統合
const ffmpegTaskMap = new Map();

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

// タスク管理システムのイベントリスナーを設定
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