/**
 * サムネイル生成タスク
 * 動画ファイルからサムネイル画像を生成します
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const BaseTask = require('../core/base-task');

class ThumbnailTask extends BaseTask {
  constructor(params) {
    super(params);
    this.type = 'thumbnail';
    this.cancellable = true;
    
    // 追加パラメータ
    this.timePosition = params.timePosition || 0; // 秒単位
    this.size = params.size || '320x240';
    
    // FFmpeg処理用の変数
    this.ffmpegProcess = null;
  }

  /**
   * サムネイル生成の実行
   */
  async execute() {
    if (!this.mediaPath) {
      return this.fail('メディアパスが指定されていません');
    }

    try {
      // mediaPathがオブジェクトの場合、pathプロパティを使用
      const inputPath = typeof this.mediaPath === 'object' && this.mediaPath.path 
        ? this.mediaPath.path 
        : this.mediaPath;

      // 入力ファイルの存在確認
      if (!fs.existsSync(inputPath)) {
        return this.fail(`入力ファイルが存在しません: ${inputPath}`);
      }

      // FFmpegのパスを取得
      const ffmpegPath = global.ffmpegPath;
      if (!ffmpegPath) {
        return this.fail('FFmpegのパスが設定されていません');
      }

      // 出力パスを生成
      const outputDir = path.join(require('os').tmpdir(), 'swp1-thumbnails');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const outputPath = path.join(outputDir, `thumbnail_${this.id}.jpg`);

      // 時間をhh:mm:ss形式に変換
      const formattedTime = this._formatTimePosition(this.timePosition);

      // FFmpegコマンドライン引数の設定
      const args = [
        '-ss', formattedTime,
        '-i', inputPath,
        '-vframes', '1',
        '-s', this.size,
        '-y', // 既存ファイルを上書き
        outputPath
      ];

      this.updateProgress(10, { phase: 'starting' });

      return new Promise((resolve, reject) => {
        // FFmpegプロセスを作成
        this.ffmpegProcess = spawn(ffmpegPath, args);
        
        this.updateProgress(50, { phase: 'processing' });
        
        // エラー出力を収集
        let errorOutput = '';
        this.ffmpegProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        // エラーハンドリング
        this.ffmpegProcess.on('error', (error) => {
          this.ffmpegProcess = null;
          reject(error);
        });
        
        // プロセス終了時の処理
        this.ffmpegProcess.on('close', (code) => {
          this.ffmpegProcess = null;
          
          if (code !== 0) {
            reject(new Error(`FFmpegプロセスが${code}で終了しました: ${errorOutput}`));
            return;
          }
          
          // ファイルの存在確認
          if (!fs.existsSync(outputPath)) {
            reject(new Error('サムネイルファイルが生成されませんでした'));
            return;
          }
          
          // ファイルサイズの確認
          const fileStats = fs.statSync(outputPath);
          if (fileStats.size === 0) {
            reject(new Error('生成されたサムネイルファイルが空です'));
            return;
          }
          
          // 画像をBase64エンコード
          const imageBuffer = fs.readFileSync(outputPath);
          const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
          
          // 結果オブジェクト
          const result = {
            filePath: outputPath,
            timePosition: this.timePosition,
            size: this.size,
            base64: base64Image
          };
          
          // タスク完了
          this.complete(result);
          resolve(result);
        });
      });
    } catch (error) {
      return this.fail(error);
    }
  }

  /**
   * 秒数を hh:mm:ss.fff 形式に変換
   * @param {number} seconds - 秒数
   * @returns {string} - フォーマットされた時間文字列
   * @private
   */
  _formatTimePosition(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  /**
   * タスクキャンセル
   */
  cancel() {
    // FFmpegプロセスが実行中なら終了
    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.kill('SIGTERM');
      } catch (err) {
        console.error('FFmpegプロセスの終了に失敗:', err);
      }
      this.ffmpegProcess = null;
    }
    
    return super.cancel();
  }
}

module.exports = ThumbnailTask;
