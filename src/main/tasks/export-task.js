/**
 * 動画書き出しタスク
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const BaseTask = require('../core/base-task');
const { getFFmpegPath } = require('../services/ffmpeg/utils');
const storageService = require('../services/storage-service');

/**
 * 動画書き出しタスク
 * 複数の動画を結合して一つの動画ファイルに書き出す
 */
class ExportTask extends BaseTask {
  constructor(params) {
    super(params);
    this.type = 'export';
    this.cancellable = true;
    this.ffmpegProcess = null;

    // タスクパラメータを設定
    this.mediaFiles = params.mediaFiles || [];
    this.outputPath = params.outputPath || '';
    this.settings = params.settings || {
      resolution: '1080p',
      fps: '30',
      codec: 'h265',
      format: 'mp4'
    };

    // 作業ディレクトリを共通のstorageServiceから取得
    const workDirs = storageService.ensureWorkDirectories('Super Watarec', ['export']);
    
    // 中間ファイルを保存するディレクトリ
    this.tempDir = path.join(workDirs.export, `export-task-${this.id}`);
    
    console.log(`ExportTask: 作業ディレクトリを設定 - ${this.tempDir}`);
  }

  /**
   * 解像度文字列から幅と高さを取得
   * @private
   * @returns {{width: number, height: number}} 解像度情報
   */
  _getResolutionDimensions() {
    const resolution = this.settings.resolution || '1080p';
    
    switch (resolution) {
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
   * @private
   * @returns {string[]} FFmpegコマンドライン引数の配列
   */
  _getEncoderParams() {
    const codec = this.settings.codec || 'h265';
    const fps = this.settings.fps || '30';
    const { width, height } = this._getResolutionDimensions();
    
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
   * @private
   * @returns {string} 出力ファイルパス
   */
  _getOutputFilePath() {
    const format = this.settings.format || 'mp4';
    const date = new Date();
    const timestamp = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`;
    
    let outputPath = this.outputPath;
    
    // ディレクトリが指定されている場合、ファイル名を生成
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
      outputPath = path.join(outputPath, `SuperWatarec_${timestamp}.${format}`);
    } else {
      // 拡張子チェック
      const ext = path.extname(outputPath).toLowerCase();
      const validExt = `.${format.toLowerCase()}`;
      
      // 拡張子が指定されていない、または異なる場合は修正
      if (!ext || ext !== validExt) {
        outputPath = `${outputPath.replace(/\.[^/.]+$/, '')}${validExt}`;
      }
    }
    
    return outputPath;
  }

  /**
   * 一時ディレクトリの作成
   * @private
   */
  _createTempDir() {
    try {
      // 既にディレクトリが存在する場合は削除
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
      
      // ディレクトリ作成
      fs.mkdirSync(this.tempDir, { recursive: true });
      
      console.log(`一時ディレクトリを作成しました: ${this.tempDir}`);
    } catch (error) {
      console.error('一時ディレクトリ作成エラー:', error);
      throw error;
    }
  }

  /**
   * 一時ディレクトリの削除
   * @private
   */
  _cleanupTempDir() {
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
        console.log(`一時ディレクトリを削除しました: ${this.tempDir}`);
      }
    } catch (error) {
      console.error('一時ディレクトリ削除エラー:', error);
      // エラーをスローせず、続行
    }
  }

  /**
   * 入力ファイルリストの作成
   * @private
   * @returns {Promise<string>} 入力ファイルリストのパス
   */
  async _createInputFileList() {
    const inputListPath = path.join(this.tempDir, 'input_list.txt');
    const mediaFiles = this.mediaFiles;
    
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
   * FFmpegを使って動画を結合
   * @private
   * @param {string} inputListPath - 入力ファイルリストのパス
   * @param {string} outputPath - 出力先ファイルパス
   * @returns {Promise<void>}
   */
  _combineVideos(inputListPath, outputPath) {
    return new Promise((resolve, reject) => {
      const ffmpegPath = getFFmpegPath();
      const encoderParams = this._getEncoderParams();
      
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
      console.log('解像度:', this.settings.resolution);
      console.log('フレームレート:', this.settings.fps);
      console.log('コーデック:', this.settings.codec);
      console.log('フォーマット:', this.settings.format);
      console.log('エンコーダパラメータ:', encoderParams);
      console.log('============================');
      
      this.updateProgress(10, { phase: 'combining' });
      
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
        console.log(`FFmpeg stderr: ${output}`);
        
        // 進捗情報を解析して更新
        const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          const seconds = parseFloat(timeMatch[3]);
          const totalSeconds = hours * 3600 + minutes * 60 + seconds;
          
          // 総時間の推定（メディアファイルの合計時間があれば使用）
          let totalDuration = 0;
          this.mediaFiles.forEach(file => {
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
          
          this.updateProgress(lastProgress, { 
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
            // 出力ファイルの存在と大きさを確認
            const stats = fs.statSync(outputPath);
            console.log(`出力ファイル: ${outputPath}`);
            console.log(`ファイルサイズ: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
          } catch (err) {
            console.error('出力ファイル確認エラー:', err);
          }
          resolve();
        } else {
          const error = new Error(`FFmpegプロセスが異常終了しました (コード: ${code})`);
          console.error(error.message);
          reject(error);
        }
      });
    });
  }

  /**
   * タスクのキャンセル
   * @returns {Promise<boolean>} キャンセル結果
   */
  async cancel() {
    // FFmpegプロセスが実行中の場合、強制終了
    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.kill('SIGKILL');
        this.ffmpegProcess = null;
        console.log(`ExportTask ${this.id} のFFmpegプロセスをキャンセルしました`);
      } catch (error) {
        console.error(`FFmpegプロセスのキャンセルエラー: ${error}`);
      }
    }
    
    // 一時ディレクトリの削除
    this._cleanupTempDir();
    
    return super.cancel();
  }

  /**
   * 書き出しの実行
   * @returns {Promise<Object>} 書き出し結果
   */
  async execute() {
    // デバッグ用の詳細なデータ構造表示
    console.log('===== 書き出しタスク開始 =====');
    console.log('タスクID:', this.id);
    console.log('メディアファイル構造:', JSON.stringify({
      type: typeof this.mediaFiles,
      isArray: Array.isArray(this.mediaFiles),
      length: this.mediaFiles ? this.mediaFiles.length : 0
    }));
    
    try {
      // メディアファイルのチェック
      if (!this.mediaFiles || !Array.isArray(this.mediaFiles) || this.mediaFiles.length === 0) {
        return this.fail('エクスポートするメディアファイルがありません');
      }
      
      // 詳細なメディアファイル情報を出力
      console.log('メディアファイル詳細:', this.mediaFiles.map((file, index) => {
        if (typeof file === 'string') {
          return { index, type: 'string', path: file };
        } else if (file && typeof file === 'object') {
          return {
            index,
            type: 'object',
            id: file.id || 'なし',
            path: file.path || 'なし',
            name: file.name || (file.path ? path.basename(file.path) : 'なし'),
            hasFilePath: !!file.filePath,
            filePath: file.filePath || 'なし',
            hasDuration: !!file.duration,
            duration: file.duration || 'なし'
          };
        } else {
          return { index, type: typeof file, value: file };
        }
      }));
      
      console.log('出力先:', this.outputPath);
      console.log('設定:', this.settings);
      console.log('============================');
      
      let inputListPath = null;
      
      // 進行状況を更新
      this.updateProgress(0, { phase: 'initializing' });
      
      // 一時ディレクトリの作成
      this._createTempDir();
      
      // 出力ファイルパスの決定
      const outputFilePath = this._getOutputFilePath();
      console.log('最終出力先パス:', outputFilePath);
      
      // 入力ファイルリストの作成
      inputListPath = await this._createInputFileList();
      
      // 動画を結合
      await this._combineVideos(inputListPath, outputFilePath);
      
      this.updateProgress(100, { phase: 'completed' });
      
      const result = {
        success: true,
        outputPath: outputFilePath
      };
      
      console.log(`===== 動画書き出しタスク完了 =====`);
      console.log(`タスクID: ${this.id}`);
      console.log(`出力パス: ${outputFilePath}`);
      console.log(`============================`);
      
      // 一時ディレクトリの削除
      this._cleanupTempDir();
      
      this.complete(result);
      return result;
    } catch (error) {
      console.error(`===== 動画書き出しタスクエラー =====`);
      console.error(`タスクID: ${this.id}`);
      console.error(`エラー: ${error}`);
      console.error(`エラーメッセージ: ${error.message}`);
      console.error(`スタックトレース: ${error.stack || 'なし'}`);
      console.error(`============================`);
      
      // 一時ディレクトリの削除
      this._cleanupTempDir();
      
      return this.fail(error);
    }
  }
}

module.exports = ExportTask;
