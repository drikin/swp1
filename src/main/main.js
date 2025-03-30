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
  video: ['mp4', 'mov', 'avi', 'webm', 'mkv', 'mts', 'm2ts', 'mpg', 'mpeg', 'hevc', 'h265', 'h264'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp']
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

// 動画を結合して出力する関数
ipcMain.handle('export-combined-video', async (event, { mediaFiles, outputPath, settings }) => {
  try {
    console.log('動画結合処理を開始:', { mediaFiles, outputPath, settings });
    
    // ハードウェアエンコードのサポート確認
    const hwaccelSupport = await checkVideoToolboxSupport();
    console.log('エクスポート - VideoToolbox対応状況:', hwaccelSupport);
    
    // 一時ディレクトリを作成
    const tempDir = path.join(app.getPath('temp'), `export_temp_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    console.log('一時ディレクトリを作成:', tempDir);
    
    // 進捗更新関数
    const updateProgress = (current, total, stage) => {
      if (event && event.sender) {
        event.sender.send('export-progress', {
          current,
          total,
          percentage: Math.round((current / total) * 100),
          stage
        });
      }
    };
    
    // ステージ1: 各素材を統一フォーマットに変換
    console.log('ステージ1: 素材変換開始');
    updateProgress(0, mediaFiles.length, 'converting');
    
    const tempFiles = [];
    for (let i = 0; i < mediaFiles.length; i++) {
      const file = mediaFiles[i];
      const tempFilePath = path.join(tempDir, `temp_${i}_${Date.now()}.mp4`);
      
      console.log(`ファイル ${i+1}/${mediaFiles.length} を変換中:`, file.path);
      
      // 解像度の設定
      let resolution;
      switch (settings.resolution) {
        case '720p': resolution = '1280:720'; break;
        case '1080p': resolution = '1920:1080'; break;
        case '2k': resolution = '2560:1440'; break;
        case '4k': resolution = '3840:2160'; break;
        default: resolution = '1920:1080';
      }
      
      // コーデックの設定
      let videoCodec, audioCodec, extraOptions = [];
      switch (settings.codec) {
        case 'h264':
          // ハードウェアエンコードが利用可能な場合はそれを使用、そうでなければソフトウェアエンコードにフォールバック
          if (hwaccelSupport.h264) {
            videoCodec = 'h264_videotoolbox';
            audioCodec = 'aac';
            // より安全なパラメータ設定
            extraOptions = [
              '-b:v', '8000k',          // ビデオビットレート
              '-allow_sw', '1',         // ソフトウェアフォールバック許可
              '-pix_fmt', 'yuv420p',    // 最も互換性の高いピクセルフォーマット
              '-profile:v', 'high',     // プロファイル設定
              '-tag:v', 'avc1',         // 互換性のあるタグ
              '-color_range', 'tv'      // 標準色域
            ];
          } else {
            videoCodec = 'libx264';
            audioCodec = 'aac';
            extraOptions = [
              '-crf', '23',
              '-preset', 'medium',
              '-pix_fmt', 'yuv420p'
            ];
          }
          break;
        case 'h265':
          // ハードウェアエンコードが利用可能な場合はそれを使用、そうでなければソフトウェアエンコードにフォールバック
          if (hwaccelSupport.hevc) {
            videoCodec = 'hevc_videotoolbox';
            audioCodec = 'aac';
            // より安全なパラメータ設定
            extraOptions = [
              '-b:v', '6000k',          // ビデオビットレート
              '-allow_sw', '1',         // ソフトウェアフォールバック許可
              '-pix_fmt', 'yuv420p',    // 最も互換性の高いピクセルフォーマット
              '-tag:v', 'hvc1',         // 互換性のあるタグ
              '-color_range', 'tv'      // 標準色域
            ];
          } else {
            videoCodec = 'libx265';
            audioCodec = 'aac';
            extraOptions = [
              '-crf', '28',
              '-preset', 'medium',
              '-pix_fmt', 'yuv420p'
            ];
          }
          break;
        case 'prores_hq':
          videoCodec = 'prores_ks';
          audioCodec = 'pcm_s16le';
          extraOptions = [
            '-profile:v', '3',
            '-vendor', 'apl0',
            '-pix_fmt', 'yuv422p10le'  // ProResの標準ピクセルフォーマット
          ];
          break;
        default:
          // デフォルトのエンコーダー設定（より安全な設定に変更）
          if (hwaccelSupport.h264) {
            videoCodec = 'h264_videotoolbox';
            audioCodec = 'aac';
            extraOptions = [
              '-b:v', '8000k',
              '-allow_sw', '1',
              '-pix_fmt', 'yuv420p',
              '-profile:v', 'high',
              '-tag:v', 'avc1',
              '-color_range', 'tv'
            ];
          } else {
            videoCodec = 'libx264';
            audioCodec = 'aac';
            extraOptions = [
              '-crf', '23',
              '-preset', 'medium',
              '-pix_fmt', 'yuv420p'
            ];
          }
      }
      
      // FFmpegの引数を構築（単一ファイル変換用）
      // 入力ファイルのパラメータを追加（より安全なデコード設定）
      const ffmpegArgs = [
        // 入力オプション
        '-hwaccel', 'auto',          // 利用可能なハードウェアアクセラレーションを自動選択
        '-i', file.path,
        
        // 出力オプション
        '-map', '0:v:0',             // 主映像ストリームのみ選択（添付画像を除外）
        '-map', '0:a:0?',            // 主音声ストリームがあれば選択
        '-map_metadata', '-1',       // メタデータを削除
        '-c:v', videoCodec,
        '-c:a', audioCodec,
        '-r', settings.fps || '30',
        '-s', resolution,
        ...extraOptions,
        '-y',
        tempFilePath
      ];
      
      try {
        // 画像ファイルの場合、特別な処理を追加
        if (file.type === 'image') {
          // 画像ファイルを5秒間の動画に変換（必要に応じて時間を調整可能）
          ffmpegArgs.splice(1, 0, '-loop', '1', '-t', '5');
        }
        
        // DJI動画の場合、添付画像や特殊ストリームへの対応を追加
        if (file.path.includes('DJI_')) {
          console.log('DJI動画を検出しました:', file.path);
          
          // ストリームマッピングを上書き（DJI特有の添付画像やメタデータを除外）
          // '-map'オプションの位置を特定
          const mapIndex = ffmpegArgs.indexOf('-map');
          if (mapIndex !== -1) {
            // 既存のマッピングオプションを削除
            while (ffmpegArgs.indexOf('-map') !== -1) {
              const idx = ffmpegArgs.indexOf('-map');
              ffmpegArgs.splice(idx, 2);  // '-map'とその引数を削除
            }
            
            // 新しいマッピングを追加
            ffmpegArgs.splice(mapIndex, 0, 
              '-map', '0:v:0',     // メインビデオストリームのみ
              '-map', '0:a:0?'     // メイン音声ストリームがあれば
            );
          }
        }
        
        console.log(`ファイル ${i+1}/${mediaFiles.length} 変換コマンド:`, ffmpegArgs.join(' '));
        
        await runFFmpegCommand(ffmpegArgs);
        tempFiles.push(tempFilePath);
        updateProgress(i + 1, mediaFiles.length, 'converting');
        
        // 変換されたファイルが正しく作成されたか確認
        if (fs.existsSync(tempFilePath)) {
          const fileStats = fs.statSync(tempFilePath);
          console.log(`変換済みファイル情報: ${tempFilePath}, サイズ: ${fileStats.size} bytes`);
          
          if (fileStats.size < 1000) {
            console.warn(`警告: 変換されたファイルのサイズが小さすぎます: ${fileStats.size} bytes`);
          }
        } else {
          console.error(`エラー: 変換後のファイルが見つかりません: ${tempFilePath}`);
        }
      } catch (error) {
        console.error(`ファイル ${file.path} の変換に失敗:`, error);
        // エラーが発生しても処理を続行し、変換できたファイルだけを結合
        updateProgress(i + 1, mediaFiles.length, 'converting');
      }
    }
    
    if (tempFiles.length === 0) {
      throw new Error('変換可能なファイルがありませんでした');
    }
    
    // ステージ2: 変換済みファイルを結合
    console.log('ステージ2: ファイル結合開始');
    updateProgress(0, 1, 'combining');
    
    // 一時ファイルリスト
    const tempListPath = path.join(tempDir, `filelist_${Date.now()}.txt`);
    
    // 素材リストをファイルに書き出し
    let fileContent = '';
    for (const file of tempFiles) {
      fileContent += `file '${file.replace(/'/g, "'\\''")}'\n`;
    }
    fs.writeFileSync(tempListPath, fileContent);
    
    // 出力ファイル名
    const ext = settings.format || 'mp4';
    const outputFilePath = path.join(outputPath, `export_${Date.now()}.${ext}`);
    
    // 結合時は再エンコードなしで結合（より安全なオプション追加）
    const concatArgs = [
      '-f', 'concat',
      '-safe', '0',
      '-i', tempListPath,
      '-c', 'copy',      // 再エンコードなし
      '-map', '0',       // 全入力ストリームをマップ
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
      fs.unlinkSync(tempListPath);
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

// その他のIPC処理をここに追加 