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

// パイプラインクラスとステップをインポート
const ExportContext = require('./export/ExportContext');
const ExportTaskPipeline = require('./export/ExportTaskPipeline');
const TrimStep = require('./export/TrimStep');
const NormalizeLoudnessStep = require('./export/NormalizeLoudnessStep');
const CombineStep = require('./export/CombineStep');

/**
 * 動画書き出しタスク
 * 複数の動画を結合して一つの動画ファイルに書き出す
 * パイプラインパターンを使用して拡張性を確保
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
    
    // パイプラインの構築
    this.pipeline = this._buildPipeline();
    
    // コンテキストの初期化
    this.context = new ExportContext({
      mediaFiles: this.mediaFiles,
      outputPath: this.outputPath,
      settings: this.settings,
      tempDir: this.tempDir
    });

    // FFmpegの準備確認
    this._checkFFmpegAvailability();
  }

  /**
   * FFmpegが利用可能かチェック
   * @private
   */
  _checkFFmpegAvailability() {
    try {
      const ffmpegPath = getFFmpegPath();
      if (!fs.existsSync(ffmpegPath)) {
        console.warn(`警告: FFmpegが見つかりません: ${ffmpegPath}`);
      } else {
        console.log(`FFmpegが見つかりました: ${ffmpegPath}`);
      }
    } catch (error) {
      console.error('FFmpegの確認中にエラーが発生しました:', error);
    }
  }

  /**
   * 設定に基づいてパイプラインを構築
   * @private
   * @returns {ExportTaskPipeline} 構築されたパイプライン
   */
  _buildPipeline() {
    const pipeline = new ExportTaskPipeline();
    
    // トリミングステップを追加（設定で無効化されていなければ）
    if (this.settings.enableTrimming !== false) {
      pipeline.addStep(new TrimStep());
    }
    
    // ラウドネス調整ステップは常に追加
    // 実際にラウドネス調整するかはステップのcanExecuteで判断
    pipeline.addStep(new NormalizeLoudnessStep({
      targetLoudness: this.settings.targetLoudness || -14 // YouTube推奨値
    }));
    
    // 結合ステップは常に追加（必須・最後に実行）
    pipeline.addStep(new CombineStep({
      codec: this.settings.codec,
      resolution: this.settings.resolution,
      fps: this.settings.fps,
      format: this.settings.format
    }));
    
    return pipeline;
  }

  /**
   * 一時ディレクトリの作成
   * @private
   */
  _createTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      try {
        fs.mkdirSync(this.tempDir, { recursive: true });
        console.log(`一時ディレクトリを作成しました: ${this.tempDir}`);
      } catch (error) {
        console.error(`一時ディレクトリの作成に失敗しました: ${error.message}`);
        throw error;
      }
    } else {
      console.log(`一時ディレクトリは既に存在します: ${this.tempDir}`);
    }
  }

  /**
   * 一時ディレクトリの削除
   * @private
   */
  _cleanupTempDir() {
    if (fs.existsSync(this.tempDir)) {
      try {
        // ディレクトリ内のファイルをすべて削除
        const files = fs.readdirSync(this.tempDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.tempDir, file));
        }
        
        // ディレクトリ自体を削除
        fs.rmdirSync(this.tempDir);
        console.log(`一時ディレクトリを削除しました: ${this.tempDir}`);
      } catch (error) {
        console.error(`一時ディレクトリの削除に失敗しました: ${error.message}`);
      }
    }
  }

  /**
   * タスクのキャンセル
   * @returns {Promise<boolean>} キャンセル結果
   */
  async cancel() {
    try {
      // パイプラインのキャンセル
      if (this.pipeline) {
        await this.pipeline.cancel();
      }
      
      // 一時ディレクトリの削除
      this._cleanupTempDir();
      
      return super.cancel();
    } catch (error) {
      console.error(`ExportTask ${this.id} のキャンセル中にエラーが発生しました:`, error);
      return super.cancel();
    }
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
            duration: file.duration || 'なし',
            // トリミング情報があれば表示
            hasTrimInfo: !!(file.trimStart !== undefined || file.trimEnd !== undefined),
            trimStart: file.trimStart,
            trimEnd: file.trimEnd
          };
        } else {
          return { index, type: typeof file, value: file };
        }
      }));
      
      console.log('出力先:', this.outputPath);
      console.log('設定:', this.settings);
      console.log('============================');
      
      // 出力先ディレクトリが存在するか確認
      const outputDir = path.dirname(this.outputPath);
      if (!fs.existsSync(outputDir)) {
        console.log(`出力先ディレクトリが存在しないため作成します: ${outputDir}`);
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // 進行状況を更新
      this.updateProgress(0, { phase: 'initializing' });
      
      // 一時ディレクトリの作成
      this._createTempDir();
      
      // 進捗コールバック
      const progressCallback = (progress, details) => {
        this.updateProgress(progress, details);
      };
      
      // パイプラインを実行
      const resultContext = await this.pipeline.execute(this.context, progressCallback);
      
      // 結果を取得
      const result = {
        success: true,
        outputPath: resultContext.result?.outputPath || ''
      };
      
      // 出力ファイルの存在確認
      if (result.outputPath && fs.existsSync(result.outputPath)) {
        // ファイルサイズと長さを取得（可能であれば）
        try {
          const stats = fs.statSync(result.outputPath);
          result.fileSize = stats.size;
          result.fileSizeFormatted = this._formatFileSize(stats.size);
        } catch (err) {
          console.warn('ファイル情報の取得に失敗しました:', err);
        }
      } else if (result.outputPath) {
        console.warn(`警告: 出力ファイルが見つかりません: ${result.outputPath}`);
      }
      
      console.log(`===== 動画書き出しタスク完了 =====`);
      console.log(`タスクID: ${this.id}`);
      console.log(`出力パス: ${result.outputPath}`);
      console.log(`ファイルサイズ: ${result.fileSizeFormatted || '不明'}`);
      console.log(`============================`);
      
      // デバッグ用に一時ディレクトリを残す
      console.log(`デバッグ用に一時ディレクトリを保持します: ${this.tempDir}`);
      // this._cleanupTempDir(); // 一時的にコメントアウト
      
      this.complete(result);
      return result;
    } catch (error) {
      console.error(`===== 動画書き出しタスクエラー =====`);
      console.error(`タスクID: ${this.id}`);
      console.error(`エラー: ${error}`);
      console.error(`エラーメッセージ: ${error.message}`);
      console.error(`スタックトレース: ${error.stack || 'なし'}`);
      console.error(`============================`);
      
      // デバッグ用に一時ディレクトリを残す
      console.error(`デバッグ用に一時ディレクトリを保持します: ${this.tempDir}`);
      // this._cleanupTempDir(); // 一時的にコメントアウト
      
      return this.fail(error);
    }
  }

  /**
   * ファイルサイズを人間が読みやすい形式にフォーマット
   * @param {number} bytes - バイト数
   * @returns {string} - フォーマットされたサイズ
   * @private
   */
  _formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = ExportTask;
