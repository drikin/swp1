/**
 * 動画結合処理を行うステップクラス
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ExportStep = require('./ExportStep');
const { getFFmpegPath } = require('../../services/ffmpeg/utils');

class CombineStep extends ExportStep {
  /**
   * @param {Object} options - オプション
   */
  constructor(options = {}) {
    super({ name: 'combining', ...options });
    this.codec = options.codec || 'h265';
    this.resolution = options.resolution || '1080p';
    this.fps = options.fps || '30';
    this.format = options.format || 'mp4';
    this.ffmpegProcess = null;
  }
  
  /**
   * 結合処理が実行可能かを判定
   * @param {ExportContext} context
   * @returns {boolean} 実行可能かどうか
   */
  canExecute(context) {
    // メディアファイルが2つ以上あるか、1つでも指定された設定で書き出しが必要な場合は実行
    return context.mediaFiles.length > 0;
  }
  
  /**
   * 結合処理を実行
   * @param {ExportContext} context - コンテキスト
   * @param {Function} progressCallback - 進捗コールバック
   * @returns {Promise<ExportContext>} - 更新されたコンテキスト
   */
  async execute(context, progressCallback) {
    if (!this.canExecute(context)) {
      return context;
    }
    
    try {
      // 進捗コールバックを初期化
      if (progressCallback) {
        progressCallback(0, { 
          phase: 'combining_init', 
          message: '結合処理の準備をしています' 
        });
      }
      
      // 入力ファイルリストを作成
      const inputFiles = await this._createInputFileList(context);
      
      if (inputFiles.length === 0) {
        throw new Error('結合する入力ファイルがありません');
      }
      
      // 出力パスを取得
      const outputPath = this._getOutputFilePath(context);
      console.log(`結合出力先: ${outputPath}`);
      
      if (progressCallback) {
        progressCallback(10, { 
          phase: 'combining', 
          message: '結合処理を開始しています',
          currentFile: 0,
          totalFiles: inputFiles.length
        });
      }
      
      // 結合処理を実行
      if (inputFiles.length === 1) {
        // 単一ファイルの場合はコピー
        await this._copySingleFile(inputFiles[0], outputPath, context, progressCallback);
      } else {
        // 複数ファイルの場合は結合
        await this._combineVideos(inputFiles, outputPath, context, progressCallback);
      }
      
      // 結果を設定
      context.result = {
        success: true,
        outputPath: outputPath
      };
      
      if (progressCallback) {
        progressCallback(100, { 
          phase: 'combining_complete', 
          message: '結合処理が完了しました',
          outputPath: outputPath
        });
      }
      
      return context;
    } catch (error) {
      console.error(`結合ステップでエラーが発生しました: ${error.message}`);
      console.error(error.stack);
      throw error;
    }
  }
  
  /**
   * 単一ファイルをコピー
   * @private
   */
  async _copySingleFile(inputFile, outputPath, context, progressCallback) {
    // FFmpegを使用して単純なコピー処理（再エンコードなし）
    return new Promise((resolve, reject) => {
      const ffmpegPath = getFFmpegPath();
      const args = [
        '-i', inputFile,
        '-c', 'copy',  // コーデックはコピー（再エンコードなし）
        '-y',  // 出力ファイルが存在する場合は上書き
        outputPath
      ];
      
      console.log(`単一ファイルコピーコマンド: ${ffmpegPath} ${args.join(' ')}`);
      
      const ffmpegProcess = spawn(ffmpegPath, args);
      let duration = 0;
      let currentTime = 0;
      
      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        
        // 動画の長さを検出（Duration: 00:00:30.57）
        const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1]);
          const minutes = parseInt(durationMatch[2]);
          const seconds = parseFloat(durationMatch[3]);
          duration = (hours * 3600) + (minutes * 60) + seconds;
        }
        
        // 現在の処理位置を検出（time=00:00:14.43）
        const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch && progressCallback) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          const seconds = parseFloat(timeMatch[3]);
          currentTime = (hours * 3600) + (minutes * 60) + seconds;
          
          // 進捗率を計算
          const progress = duration > 0 ? Math.min(Math.round((currentTime / duration) * 100), 100) : 0;
          
          // 時間を mm:ss 形式に変換
          const currentTimeFormatted = this._formatTime(currentTime);
          const durationFormatted = this._formatTime(duration);
          
          progressCallback(progress, {
            phase: 'combining',
            message: `ファイルを処理中: ${currentTimeFormatted} / ${durationFormatted}`,
            currentTime: currentTimeFormatted,
            totalDuration: durationFormatted,
            currentFile: 1,
            totalFiles: 1,
            fileName: path.basename(inputFile)
          });
        }
      });
      
      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`単一ファイルのコピーが成功しました: ${outputPath}`);
          resolve();
        } else {
          console.error(`FFmpegプロセスがコード ${code} で終了しました`);
          reject(new Error(`FFmpegプロセスがコード ${code} で終了しました`));
        }
      });
      
      ffmpegProcess.on('error', (err) => {
        console.error('FFmpegプロセスでエラーが発生しました:', err);
        reject(err);
      });
    });
  }
  
  /**
   * 複数の動画を結合
   * @private
   */
  async _combineVideos(inputFiles, outputPath, context, progressCallback) {
    return new Promise((resolve, reject) => {
      const ffmpegPath = getFFmpegPath();
      
      // 入力ファイルの引数を構築
      const inputArgs = [];
      inputFiles.forEach(file => {
        inputArgs.push('-i', file);
      });
      
      // フィルタコンプレックスを構築
      const filterComplex = [];
      for (let i = 0; i < inputFiles.length; i++) {
        filterComplex.push(`[${i}:v:0][${i}:a:0]`);
      }
      
      // ffmpegコマンド引数
      const args = [
        ...inputArgs,
        '-filter_complex', `${filterComplex.join('')}concat=n=${inputFiles.length}:v=1:a=1[outv][outa]`,
        '-map', '[outv]',
        '-map', '[outa]'
      ];
      
      // 解像度が指定されている場合
      if (this.resolution && this.resolution !== 'original') {
        if (this.resolution === '1080p') {
          args.push('-vf', 'scale=-1:1080');
        } else if (this.resolution === '720p') {
          args.push('-vf', 'scale=-1:720');
        } else if (this.resolution === '4k') {
          args.push('-vf', 'scale=-1:2160');
        }
      }
      
      // コーデックが指定されている場合
      if (this.codec) {
        if (this.codec === 'h265') {
          args.push('-c:v', 'libx265', '-crf', '23');
        } else if (this.codec === 'h264') {
          args.push('-c:v', 'libx264', '-crf', '23');
        } else if (this.codec === 'copy') {
          args.push('-c:v', 'copy');
        }
      } else {
        // デフォルトコーデック
        args.push('-c:v', 'libx264', '-crf', '23');
      }
      
      // 音声コーデック
      args.push('-c:a', 'aac', '-b:a', '192k');
      
      // フレームレート
      if (this.fps && this.fps !== 'original') {
        args.push('-r', this.fps);
      }
      
      // 出力ファイル
      args.push('-y', outputPath);
      
      console.log(`FFmpeg結合コマンド: ${ffmpegPath} ${args.join(' ')}`);
      
      const ffmpegProcess = spawn(ffmpegPath, args);
      let duration = 0;
      let currentTime = 0;
      
      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        
        // 動画の長さを検出（Duration: 00:00:30.57）
        const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1]);
          const minutes = parseInt(durationMatch[2]);
          const seconds = parseFloat(durationMatch[3]);
          duration = (hours * 3600) + (minutes * 60) + seconds;
        }
        
        // 現在の処理位置を検出（time=00:00:14.43）
        const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch && progressCallback) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          const seconds = parseFloat(timeMatch[3]);
          currentTime = (hours * 3600) + (minutes * 60) + seconds;
          
          // 進捗率を計算
          const progress = duration > 0 ? Math.min(Math.round((currentTime / duration) * 100), 100) : 0;
          
          // 時間を mm:ss 形式に変換
          const currentTimeFormatted = this._formatTime(currentTime);
          const durationFormatted = this._formatTime(duration);
          
          progressCallback(progress, {
            phase: 'combining',
            message: `複数ファイルを結合中: ${currentTimeFormatted} / ${durationFormatted}`,
            currentTime: currentTimeFormatted,
            totalDuration: durationFormatted,
            currentFile: progress,
            totalFiles: 100,
            fileCount: inputFiles.length
          });
        }
      });
      
      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`動画結合が成功しました: ${outputPath}`);
          resolve();
        } else {
          console.error(`FFmpegプロセスがコード ${code} で終了しました`);
          reject(new Error(`FFmpegプロセスがコード ${code} で終了しました`));
        }
      });
      
      ffmpegProcess.on('error', (err) => {
        console.error('FFmpegプロセスでエラーが発生しました:', err);
        reject(err);
      });
    });
  }
  
  /**
   * 時間を mm:ss 形式にフォーマット
   * @param {number} timeInSeconds - 秒単位の時間
   * @returns {string} - フォーマットされた時間
   * @private
   */
  _formatTime(timeInSeconds) {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  /**
   * 入力ファイルリストの作成
   * @param {ExportContext} context - コンテキスト
   * @returns {Promise<string>} - 入力ファイルリストのパス
   * @private
   */
  async _createInputFileList(context) {
    const inputListPath = path.join(context.tempDir, 'input_list.txt');
    const mediaFiles = context.mediaFiles;
    
    console.log('入力ファイルリスト作成開始');
    console.log('mediaFilesの型:', typeof mediaFiles);
    console.log('mediaFilesは配列か:', Array.isArray(mediaFiles));
    
    // mediaFilesが空の場合はエラー
    if (!mediaFiles || mediaFiles.length === 0) {
      throw new Error('入力メディアファイルがありません');
    }
    
    let validMediaFiles = [];
    
    // 入力ファイルの整形とパス抽出
    for (let i = 0; i < mediaFiles.length; i++) {
      const file = mediaFiles[i];
      let filePath = '';
      let fileDuration = 0;
      
      console.log(`メディアファイル[${i}]の型:`, typeof file);
      
      if (typeof file === 'string') {
        filePath = file;
      } else if (typeof file === 'object' && file !== null) {
        // 事前処理済みファイルがあるかどうかを確認
        let processedFilePath = null;

        // ファイルの時間情報を取得
        if (file.duration) {
          fileDuration = parseFloat(file.duration);
        }

        // 1. Normalized(ラウドネスノーマライズ)済みファイルを確認
        if (context.normalizedFiles && context.normalizedFiles[file.id]) {
          processedFilePath = context.normalizedFiles[file.id];
          console.log(`ラウドネスノーマライズ済みファイルを使用: ${processedFilePath}`);
        } 
        // 2. Trimmed(トリム)済みファイルを確認
        else if (context.trimmedFiles && context.trimmedFiles[file.id]) {
          processedFilePath = context.trimmedFiles[file.id];
          console.log(`トリム済みファイルを使用: ${processedFilePath}`);
          
          // トリムされたファイルの場合、時間情報を調整
          if (file.trimStart !== undefined && file.trimEnd !== undefined) {
            fileDuration = file.trimEnd - file.trimStart;
            console.log(`トリム調整後の時間: ${fileDuration}秒`);
          }
        }

        // 処理済みファイルがある場合はそれを使用
        if (processedFilePath && fs.existsSync(processedFilePath)) {
          filePath = processedFilePath;
        } 
        // なければ元のファイルパスを使用
        else {
          // オブジェクトからパスプロパティを取得
          if (file.path) {
            filePath = file.path;
          } else if (file.filePath) {
            filePath = file.filePath;
          } else {
            console.warn(`警告: ファイル[${i}]にパスプロパティがありません:`, file);
            continue; // このファイルはスキップ
          }
          console.log(`オリジナルファイルを使用: ${filePath}`);
        }
      } else {
        console.warn(`警告: ファイル[${i}]は無効な形式です:`, file);
        continue; // このファイルはスキップ
      }
      
      // ファイルの存在確認
      if (!fs.existsSync(filePath)) {
        console.warn(`警告: ファイルが存在しません: ${filePath}`);
        continue; // このファイルはスキップ
      }
      
      console.log(`有効なメディアファイル: ${filePath}, 長さ: ${fileDuration}秒`);
      validMediaFiles.push({ path: filePath, duration: fileDuration });
    }
    
    // 有効なファイルが1つもない場合はエラー
    if (validMediaFiles.length === 0) {
      throw new Error('有効なメディアファイルがありません');
    }
    
    console.log(`有効なメディアファイル数: ${validMediaFiles.length}`);
    
    // ファイルリストを作成
    const fileContent = validMediaFiles
      .map(fileInfo => {
        // ファイルパスに含まれる特殊文字をエスケープ
        return `file '${fileInfo.path.replace(/'/g, "'\\''")}'`;
      })
      .join('\n');
    
    fs.writeFileSync(inputListPath, fileContent, 'utf8');
    console.log(`入力ファイルリストを作成しました: ${inputListPath}`);
    
    return inputListPath;
  }
  
  /**
   * 解像度文字列から幅と高さを取得
   * @param {string} resolution - 解像度文字列
   * @returns {{width: number, height: number}} 解像度情報
   * @private
   */
  _getResolutionDimensions(resolution) {
    const resolutionStr = resolution || this.resolution || '1080p';
    
    switch (resolutionStr) {
      case '720p':
        return { width: 1280, height: 720 };
      case '1080p':
        return { width: 1920, height: 1080 };
      case '2k':
        return { width: 2560, height: 1440 };
      case '4k':
        return { width: 3840, height: 2160 };
      default:
        return { width: 1920, height: 1080 }; // デフォルトは1080p
    }
  }
  
  /**
   * コーデックに基づいたFFmpegのエンコードパラメータを取得
   * @param {Object} settings - エンコード設定
   * @returns {string[]} FFmpegコマンドライン引数の配列
   * @private
   */
  _getEncoderParams(settings = {}) {
    const codec = settings.codec || this.codec || 'h265';
    const fps = settings.fps || this.fps || '30';
    const resolution = settings.resolution || this.resolution || '1080p';
    const { width, height } = this._getResolutionDimensions(resolution);
    
    let codecParams = [];
    
    switch (codec) {
      case 'h264':
        // H.264 (VideoToolbox ハードウェアアクセラレーション)
        codecParams = [
          '-c:v', 'h264_videotoolbox',
          '-b:v', '10M',
          '-profile:v', 'high',
          '-r', fps,
          '-pix_fmt', 'yuv420p'
        ];
        break;
      
      case 'h265': 
        // H.265/HEVC (VideoToolbox ハードウェアアクセラレーション)
        codecParams = [
          '-c:v', 'hevc_videotoolbox',
          '-b:v', '8M',
          '-tag:v', 'hvc1', // iOSとの互換性のためにHEVCのタグを指定
          '-r', fps,
          '-pix_fmt', 'yuv420p'
        ];
        break;
      
      case 'prores_hq':
        // Apple ProRes HQ
        codecParams = [
          '-c:v', 'prores_ks',
          '-profile:v', '3', // 3=HQ
          '-r', fps,
          '-vendor', 'ap10',
          '-pix_fmt', 'yuv422p10le'
        ];
        break;
      
      default:
        // デフォルトはH.265
        codecParams = [
          '-c:v', 'hevc_videotoolbox',
          '-b:v', '8M',
          '-tag:v', 'hvc1',
          '-r', fps,
          '-pix_fmt', 'yuv420p'
        ];
    }
    
    // 解像度パラメータを追加
    codecParams.push('-s', `${width}x${height}`);
    
    return codecParams;
  }
  
  /**
   * ファイル名からフォーマットに合わせた出力ファイルパスを生成
   * @param {ExportContext} context - コンテキスト
   * @returns {string} 出力ファイルパス
   * @private
   */
  _getOutputFilePath(context) {
    const format = context.settings.format || this.format || 'mp4';
    const date = new Date();
    const timestamp = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date.getSeconds().toString().padStart(2, '0')}`;
    
    // 出力先が指定されている場合はそれを使用
    if (context.outputPath && context.outputPath.trim() !== '') {
      let outputPath = context.outputPath;
      
      try {
        // 出力先がディレクトリかどうかを確認
        const stats = fs.existsSync(outputPath) ? fs.statSync(outputPath) : null;
        
        if (stats && stats.isDirectory()) {
          // ディレクトリの場合はファイル名を生成して追加
          console.log(`出力先はディレクトリです: ${outputPath}`);
          outputPath = path.join(outputPath, `export_${timestamp}.${format}`);
          console.log(`生成された出力ファイルパス: ${outputPath}`);
        } else {
          // ファイルパスの場合、拡張子を正しいフォーマットに変更
          const fileExt = path.extname(outputPath).toLowerCase();
          const formatExt = `.${format}`.toLowerCase();
          
          if (fileExt !== formatExt) {
            // 拡張子が異なる場合は、ファイル名の拡張子を置き換え
            const dirName = path.dirname(outputPath);
            const baseName = path.basename(outputPath, fileExt);
            outputPath = path.join(dirName, `${baseName}${formatExt}`);
          }
        }
      } catch (error) {
        console.error('出力パスの処理中にエラーが発生しました:', error);
        // エラーが発生した場合は、安全のためファイル名を追加
        const dirName = path.dirname(outputPath);
        outputPath = path.join(dirName, `export_${timestamp}.${format}`);
      }
      
      return outputPath;
    }
    
    // 出力先が指定されていない場合はデスクトップなどに保存
    let defaultOutputDir = '';
    
    try {
      // デスクトップパスを取得
      defaultOutputDir = path.join(require('os').homedir(), 'Desktop');
      
      // デスクトップが存在しない場合はホームディレクトリを使用
      if (!fs.existsSync(defaultOutputDir)) {
        defaultOutputDir = require('os').homedir();
      }
    } catch (error) {
      console.error('デフォルト出力ディレクトリの取得に失敗しました:', error);
      defaultOutputDir = context.tempDir; // 一時ディレクトリを使用
    }
    
    return path.join(defaultOutputDir, `export_${timestamp}.${format}`);
  }
  
  /**
   * FFmpegを使って動画を結合
   * @param {string} inputListPath - 入力ファイルリストのパス
   * @param {string} outputPath - 出力先ファイルパス
   * @param {ExportContext} context - コンテキスト
   * @param {Function} progressCallback - 進捗コールバック
   * @returns {Promise<void>}
   * @private
   */
  _combineVideos(inputListPath, outputPath, context, progressCallback) {
    return new Promise((resolve, reject) => {
      const ffmpegPath = getFFmpegPath();
      const settings = context.settings || {};
      const encoderParams = this._getEncoderParams(settings);
      
      // 出力先ディレクトリの存在確認
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        try {
          fs.mkdirSync(outputDir, { recursive: true });
          console.log(`出力先ディレクトリを作成しました: ${outputDir}`);
        } catch (err) {
          console.error(`出力先ディレクトリの作成に失敗しました: ${err.message}`);
          return reject(new Error(`出力先ディレクトリの作成に失敗しました: ${err.message}`));
        }
      }
      
      // 安全な結合方法を使用: 一時ファイルを作成し、それを結合
      // 入力ファイルリストから実際のファイルパスを取得
      let inputFiles = [];
      try {
        const fileListContent = fs.readFileSync(inputListPath, 'utf8');
        const lines = fileListContent.split('\n');
        for (const line of lines) {
          const match = line.match(/file ['"](.+)['"]/);
          if (match && match[1]) {
            inputFiles.push(match[1]);
          }
        }
        console.log(`入力ファイル数: ${inputFiles.length}`);
      } catch (err) {
        console.error('入力ファイルリスト読み込みエラー:', err);
        return reject(err);
      }
      
      if (inputFiles.length === 0) {
        return reject(new Error('有効な入力ファイルがありません'));
      }
      
      // 1ファイルのみの場合は単純コピー
      if (inputFiles.length === 1) {
        console.log('入力ファイルが1つのみのため、単純コピーを実行します');
        const args = [
          '-y',
          '-i', inputFiles[0],
          '-c', 'copy',
          outputPath
        ];
        
        const ffmpegCmd = `${ffmpegPath} ${args.join(' ')}`;
        console.log('=== FFmpeg実行コマンド（単純コピー） ===');
        console.log(ffmpegCmd);
        console.log('========================');
        
        this.ffmpegProcess = spawn(ffmpegPath, args);
        
        this.ffmpegProcess.stdout.on('data', (data) => {
          console.log(`FFmpeg stdout: ${data.toString()}`);
        });
        
        this.ffmpegProcess.stderr.on('data', (data) => {
          console.log(`FFmpeg stderr: ${data.toString()}`);
        });
        
        this.ffmpegProcess.on('error', (err) => {
          console.error('FFmpegプロセスエラー:', err);
          this.ffmpegProcess = null;
          reject(err);
        });
        
        this.ffmpegProcess.on('close', (code) => {
          this.ffmpegProcess = null;
          if (code === 0) {
            console.log('単純コピーが正常に完了しました');
            try {
              if (fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                if (stats.size === 0) {
                  reject(new Error('出力ファイルのサイズが0です'));
                  return;
                }
                
                let fileSizeFormatted = this._formatFileSize(stats.size);
                context.fileSizeFormatted = fileSizeFormatted;
                progressCallback(100, { phase: 'combining_complete' });
                resolve();
              } else {
                reject(new Error('出力ファイルが作成されませんでした'));
              }
            } catch (error) {
              console.error('出力ファイル確認エラー:', error);
              reject(error);
            }
          } else {
            const error = new Error(`単純コピーが終了コード ${code} で失敗しました`);
            console.error(error.message);
            reject(error);
          }
        });
        
        return;
      }
      
      // 安全な結合方法：フィルタ複合（filtercomplex）を使用
      const filterComplex = [];
      for (let i = 0; i < inputFiles.length; i++) {
        filterComplex.push(`[${i}:v:0][${i}:a:0]`);
      }
      
      const args = ['-y'];
      
      // 入力ファイルを追加
      for (const file of inputFiles) {
        args.push('-i', file);
      }
      
      // フィルタ複合を追加
      args.push(
        '-filter_complex', `${filterComplex.join('')}concat=n=${inputFiles.length}:v=1:a=1[outv][outa]`,
        '-map', '[outv]',
        '-map', '[outa]',
        ...encoderParams,
        '-max_muxing_queue_size', '1024',
        '-c:a', 'aac',
        '-b:a', '192k',
        outputPath
      );
      
      const ffmpegCmd = `${ffmpegPath} ${args.join(' ')}`;
      console.log('=== FFmpeg実行コマンド（フィルタ複合） ===');
      console.log(ffmpegCmd);
      console.log('========================');
      
      progressCallback(10, { phase: 'combining' });
      
      this.ffmpegProcess = spawn(ffmpegPath, args);
      
      this.ffmpegProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`FFmpeg stdout: ${output}`);
      });
      
      let lastProgress = 10;
      this.ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        
        const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          const seconds = parseFloat(timeMatch[3]);
          const totalSeconds = hours * 3600 + minutes * 60 + seconds;
          
          console.log(`FFmpeg進捗: ${timeMatch[0]}`);
          
          let totalDuration = 0;
          context.mediaFiles.forEach(file => {
            if (file.duration) {
              if (file.trimStart !== undefined && file.trimEnd !== undefined) {
                totalDuration += (file.trimEnd - file.trimStart);
              } else {
                totalDuration += parseFloat(file.duration);
              }
            }
          });
          
          console.log(`FFmpeg進捗: ${hours}:${minutes}:${seconds} (合計秒数: ${totalSeconds.toFixed(2)}秒)`);
          
          if (totalDuration > 0) {
            const percent = Math.min(95, 10 + (totalSeconds / totalDuration) * 85);
            console.log(`進捗率: ${percent.toFixed(2)}% (処理秒数: ${totalSeconds.toFixed(2)}秒 / 合計: ${totalDuration.toFixed(2)}秒)`);
            lastProgress = percent;
          } else {
            lastProgress = Math.min(95, lastProgress + 0.5);
          }
          
          progressCallback(lastProgress, { 
            phase: 'combining',
            currentTime: `${hours}:${minutes}:${Math.floor(seconds)}`,
            totalDuration: totalDuration > 0 ? `${Math.floor(totalDuration / 3600)}:${Math.floor((totalDuration % 3600) / 60)}:${Math.floor(totalDuration % 60)}` : '不明'
          });
        }
        
        if (output.includes('Error') || output.includes('Invalid') || output.includes('error') || output.includes('failed')) {
          console.error(`FFmpegエラー: ${output}`);
        }
      });
      
      this.ffmpegProcess.on('error', (err) => {
        console.error('FFmpegプロセスエラー:', err);
        this.ffmpegProcess = null;
        reject(err);
      });
      
      this.ffmpegProcess.on('close', (code) => {
        this.ffmpegProcess = null;
        
        if (code === 0) {
          console.log('FFmpeg処理が正常に完了しました');
          try {
            if (fs.existsSync(outputPath)) {
              const stats = fs.statSync(outputPath);
              console.log(`出力ファイル情報: サイズ=${stats.size}バイト, 作成日時=${stats.birthtime}`);
              
              if (stats.size === 0) {
                reject(new Error('出力ファイルのサイズが0です'));
                return;
              }
              
              let fileSizeFormatted = this._formatFileSize(stats.size);
              context.fileSizeFormatted = fileSizeFormatted;
              
            } else {
              reject(new Error('出力ファイルが作成されませんでした'));
              return;
            }
            
            progressCallback(100, { phase: 'combining_complete' });
            resolve();
          } catch (error) {
            console.error('出力ファイル確認エラー:', error);
            reject(error);
          }
        } else {
          const error = new Error(`FFmpegプロセスが終了コード ${code} で終了しました`);
          console.error(error.message);
          reject(error);
        }
      });
    });
  }
  
  /**
   * ファイルサイズをフォーマット
   * @param {number} size - ファイルサイズ（バイト）
   * @returns {string} - フォーマットされたサイズ文字列
   * @private
   */
  _formatFileSize(size) {
    if (size < 1024) {
      return `${size} B`;
    } else if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(2)} KB`;
    } else if (size < 1024 * 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    } else {
      return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
  }
  
  /**
   * ステップをキャンセル
   * @returns {Promise<void>}
   */
  async cancel() {
    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.kill('SIGKILL');
        this.ffmpegProcess = null;
        console.log('FFmpegプロセスがキャンセルされました');
      } catch (error) {
        console.error('FFmpegプロセスのキャンセルに失敗しました:', error);
      }
    }
  }
}

module.exports = CombineStep;
