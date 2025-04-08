/**
 * サムネイル生成タスク
 * 動画ファイルからサムネイル画像を生成します
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const BaseTask = require('../core/base-task');

class ThumbnailTask extends BaseTask {
  constructor(params) {
    super(params);
    this.type = 'thumbnail';
    this.cancellable = true;
    
    // 追加パラメータ
    this.timePosition = params.timePosition || 0; // 秒単位
    
    // サイズ設定
    // デフォルトは幅320、高さは動的に計算（縦横比を維持）
    this.thumbnailWidth = params.width || 320;
    this.thumbnailHeight = params.height || -1; // -1は縦横比を維持
    
    // 後方互換性のために文字列形式のサイズも保持
    this.size = params.size || `${this.thumbnailWidth}x${this.thumbnailHeight}`;
    
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
      // mediaPathがオブジェクトの場合の処理を改善
      let inputPath = this.mediaPath;
      
      // オブジェクトかどうかのチェックを強化
      if (this.mediaPath && typeof this.mediaPath === 'object') {
        console.log('mediaPathはオブジェクトです:', JSON.stringify(this.mediaPath));
        
        // pathプロパティまたはfilePathプロパティを使用
        if (this.mediaPath.path) {
          inputPath = this.mediaPath.path;
          console.log('mediaPath.pathを使用します:', inputPath);
        } else if (this.mediaPath.filePath) {
          inputPath = this.mediaPath.filePath;
          console.log('mediaPath.filePathを使用します:', inputPath);
        } else {
          // オブジェクトに必要なプロパティがない場合
          console.error('mediaPathオブジェクトに有効なパスプロパティがありません:', this.mediaPath);
          return this.fail(`無効なメディアパス形式です: ${JSON.stringify(this.mediaPath)}`);
        }
      } else {
        console.log('mediaPathは文字列です:', inputPath);
      }

      // 入力ファイルの存在確認
      if (!fs.existsSync(inputPath)) {
        console.error('入力ファイルが存在しません:', inputPath);
        return this.fail(`入力ファイルが存在しません: ${inputPath}`);
      }

      // FFmpegのパスを取得
      const ffmpegPath = global.ffmpegPath;
      if (!ffmpegPath) {
        return this.fail('FFmpegのパスが設定されていません');
      }

      // 新しい作業ディレクトリを使用（ホームディレクトリ直下のSuper Waterec）
      const homeDir = os.homedir();
      const baseDir = path.join(homeDir, 'Super Watarec');
      const outputDir = path.join(baseDir, 'thumbnails');
      
      // ディレクトリの存在を確認し、必要なら作成
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log('サムネイルディレクトリを作成しました:', outputDir);
      }
      
      const outputPath = path.join(outputDir, `thumbnail_${this.id}.jpg`);
      console.log('サムネイル出力先:', outputPath);

      // 時間をhh:mm:ss形式に変換
      const formattedTime = this._formatTimePosition(this.timePosition);

      // FFmpegコマンドライン引数の設定
      const args = [
        '-ss', formattedTime,
        '-i', inputPath,
        '-vframes', '1',
        // 縦横比を維持するため、-sオプションを削除し、フィルターを使用
        '-vf', `scale=${this.thumbnailWidth}:-1`,
        '-y', // 既存ファイルを上書き
        outputPath
      ];

      console.log('サムネイル生成コマンド:', `${ffmpegPath} ${args.join(' ')}`);

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
          
          // タスク完了時にファイルパスをオブジェクト形式で保存
          const result = {
            filePath: outputPath,
            fileSize: fileStats.size,
            width: this.thumbnailWidth,
            height: this.thumbnailHeight === -1 ? 'auto' : this.thumbnailHeight,
            timePosition: this.timePosition
          };
          
          // 完了状態に設定し、結果データを保存
          this.complete(result);
          resolve(outputPath);
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
