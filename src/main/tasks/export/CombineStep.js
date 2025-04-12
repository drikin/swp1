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
    console.log('結合ステップ開始');
    progressCallback(0, { phase: 'combining_init' });
    
    try {
      // 入力ファイルリストを作成
      const inputListPath = await this._createInputFileList(context);
      
      // 出力ファイルパスを取得または生成
      const outputPath = context.outputPath || this._getOutputFilePath(context);
      console.log(`最終出力先パス: ${outputPath}`);
      
      // 動画を結合
      await this._combineVideos(inputListPath, outputPath, context, progressCallback);
      
      // 結果をコンテキストに設定
      context.result = {
        success: true,
        outputPath: outputPath
      };
      
      context.setMetadata('combining', { 
        completed: true,
        timestamp: new Date().toISOString(),
        outputPath: outputPath
      });
      
      progressCallback(100, { phase: 'combining_complete' });
      console.log('結合ステップ完了');
      
      return context;
    } catch (error) {
      console.error('結合ステップエラー:', error);
      throw error;
    }
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
      
      console.log(`メディアファイル[${i}]の型:`, typeof file);
      
      if (typeof file === 'string') {
        filePath = file;
      } else if (typeof file === 'object' && file !== null) {
        // オブジェクトからパスプロパティを取得
        if (file.path) {
          filePath = file.path;
        } else if (file.filePath) {
          filePath = file.filePath;
        } else {
          console.warn(`警告: ファイル[${i}]にパスプロパティがありません:`, file);
          continue; // このファイルはスキップ
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
      
      console.log(`有効なメディアファイル: ${filePath}`);
      validMediaFiles.push(filePath);
    }
    
    // 有効なファイルが1つもない場合はエラー
    if (validMediaFiles.length === 0) {
      throw new Error('有効なメディアファイルがありません');
    }
    
    console.log(`有効なメディアファイル数: ${validMediaFiles.length}`);
    
    // ファイルリストを作成
    const fileContent = validMediaFiles
      .map(filePath => {
        // ファイルパスに含まれる特殊文字をエスケープ
        return `file '${filePath.replace(/'/g, "'\\''")}'`;
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
      
      // 拡張子を正しいフォーマットに変更
      const fileExt = path.extname(outputPath).toLowerCase();
      const formatExt = `.${format}`.toLowerCase();
      
      if (fileExt !== formatExt) {
        // 拡張子が異なる場合は、ファイル名の拡張子を置き換え
        const dirName = path.dirname(outputPath);
        const baseName = path.basename(outputPath, fileExt);
        outputPath = path.join(dirName, `${baseName}${formatExt}`);
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
      
      // FFmpegコマンド引数を構築
      const args = [
        '-y',                 // 出力ファイルを上書き
        '-f', 'concat',       // 結合モード
        '-safe', '0',         // 安全でないファイルパスを許可
        '-i', inputListPath,  // 入力ファイルリスト
        '-map', '0:v',        // ビデオストリームをマップ
        '-map', '0:a?',       // オーディオストリームをマップ（存在すれば）
        ...encoderParams,     // エンコーダーパラメータ
        '-c:a', 'aac',        // 音声コーデック
        '-b:a', '192k',       // 音声ビットレート
        outputPath            // 出力ファイルパス
      ];
      
      // コマンドラインを出力
      const ffmpegCmd = `${ffmpegPath} ${args.join(' ')}`;
      console.log('=== FFmpeg実行コマンド ===');
      console.log(ffmpegCmd);
      console.log('========================');
      
      // 入力ファイルの内容を表示
      try {
        const inputListContent = fs.readFileSync(inputListPath, 'utf8');
        console.log('=== 入力ファイルリスト内容 ===');
        console.log(inputListContent);
        console.log('============================');
      } catch (err) {
        console.error('入力ファイルリスト読み込みエラー:', err);
      }
      
      // 設定情報のログ出力
      console.log('=== FFmpeg エンコード設定 ===');
      console.log('解像度:', settings.resolution || this.resolution);
      console.log('フレームレート:', settings.fps || this.fps);
      console.log('コーデック:', settings.codec || this.codec);
      console.log('フォーマット:', settings.format || this.format);
      console.log('エンコーダパラメータ:', encoderParams);
      console.log('============================');
      
      progressCallback(10, { phase: 'combining' });
      
      // FFmpegプロセスを開始
      this.ffmpegProcess = spawn(ffmpegPath, args);
      
      // 標準出力をログに記録
      this.ffmpegProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`FFmpeg stdout: ${output}`);
      });
      
      // 進捗情報を取得
      let lastProgress = 0;
      this.ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        
        // デバッグログが大量に出るため、進捗情報のみを抽出
        const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch) {
          console.log(`FFmpeg進捗: ${timeMatch[0]}`);
        }
        
        // 進捗情報を解析して更新
        if (timeMatch) {
          const hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          const seconds = parseFloat(timeMatch[3]);
          const totalSeconds = hours * 3600 + minutes * 60 + seconds;
          
          // 総時間の推定（メディアファイルの合計時間があれば使用）
          let totalDuration = 0;
          context.mediaFiles.forEach(file => {
            if (file.duration) {
              totalDuration += parseFloat(file.duration);
            }
          });
          
          // 進捗情報のログ出力
          console.log(`FFmpeg進捗: ${hours}:${minutes}:${seconds} (合計秒数: ${totalSeconds.toFixed(2)}秒)`);
          
          if (totalDuration > 0) {
            const percent = Math.min(95, 10 + (totalSeconds / totalDuration) * 85);
            console.log(`進捗率: ${percent.toFixed(2)}% (処理秒数: ${totalSeconds.toFixed(2)}秒 / 合計: ${totalDuration.toFixed(2)}秒)`);
          }
          
          // 合計時間が不明または0の場合、進捗表示を微増
          if (!totalDuration || totalDuration <= 0) {
            lastProgress = Math.min(95, lastProgress + 0.5);
          } else {
            // 進捗率を計算 (10%〜95%の間で調整)
            const progressPercent = Math.min(95, 10 + (totalSeconds / totalDuration) * 85);
            lastProgress = progressPercent;
          }
          
          progressCallback(lastProgress, { 
            phase: 'combining',
            currentTime: `${hours}:${minutes}:${Math.floor(seconds)}`,
            totalDuration: totalDuration > 0 ? `${Math.floor(totalDuration / 3600)}:${Math.floor((totalDuration % 3600) / 60)}:${Math.floor(totalDuration % 60)}` : '不明'
          });
        }
      });
      
      // エラーハンドリング
      this.ffmpegProcess.on('error', (err) => {
        console.error('FFmpegプロセスエラー:', err);
        this.ffmpegProcess = null;
        reject(err);
      });
      
      // 完了ハンドリング
      this.ffmpegProcess.on('close', (code) => {
        this.ffmpegProcess = null;
        
        if (code === 0) {
          console.log('FFmpeg処理が正常に完了しました');
          try {
            // 出力ファイルが存在することを確認
            if (fs.existsSync(outputPath)) {
              const stats = fs.statSync(outputPath);
              console.log(`出力ファイル情報: サイズ=${stats.size}バイト, 作成日時=${stats.birthtime}`);
              if (stats.size === 0) {
                reject(new Error('出力ファイルのサイズが0です'));
                return;
              }
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
