/**
 * サムネイル生成タスク
 * 動画ファイルからサムネイル画像を生成します
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const BaseTask = require('../core/base-task');

// FFmpegサービスのインポート
const { getFFmpegService } = require('../services/ffmpeg/index');
const ffmpegService = getFFmpegService();

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
    this.ffmpegTaskId = null;
  }

  /**
   * タスクの実行
   * @returns {Promise<Object>} 実行結果
   */
  async execute() {
    console.log(`===== サムネイル生成タスク開始 [${this.id}] =====`);
    console.log(`入力ファイル: ${this.mediaPath}`);
    console.log(`時間位置: ${this.timePosition}秒`);
    console.log(`サイズ: ${this.thumbnailWidth}x${this.thumbnailHeight}`);

    if (!this.mediaPath) {
      console.error('メディアパスが指定されていません');
      return this.fail('メディアパスが指定されていません');
    }

    // 指定されたメディアファイルの存在確認
    const inputPath = this.mediaPath;
    
    try {
      if (!fs.existsSync(inputPath)) {
        console.error(`入力ファイルが存在しません: ${inputPath}`);
        return this.fail(`ファイルが存在しません: ${inputPath}`);
      }

      // FFmpegサービスが初期化されているか確認
      if (!ffmpegService) {
        console.error('FFmpegサービスが利用できません');
        return this.fail('FFmpegサービスが利用できません');
      }

      console.log('FFmpegサービスのインスタンス情報:', {
        type: typeof ffmpegService,
        methods: Object.getOwnPropertyNames(Object.getPrototypeOf(ffmpegService))
      });

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

      // 進捗更新
      this.updateProgress(10, { phase: 'starting' });

      console.log('FFmpegサービスを使用してサムネイル生成を開始します');

      // オプションの準備
      const options = {
        time: this.timePosition,
        width: this.thumbnailWidth,
        height: this.thumbnailHeight !== -1 ? this.thumbnailHeight : null,
        quality: 90,
        outputPath: outputPath
      };
      
      console.log('サムネイル生成パラメータ:', {
        inputPath,
        options,
        timePosition: this.timePosition,
        width: this.thumbnailWidth,
        height: this.thumbnailHeight
      });
      
      // FFmpegコマンドを直接準備（バックアップとしてログ表示のみ）
      const ffmpegPath = global.ffmpegPath || '/opt/homebrew/bin/ffmpeg';
      console.log('FFmpegパス:', ffmpegPath);
      
      // 時間をhh:mm:ss形式に変換
      const formattedTime = this._formatTimePosition(this.timePosition);
      
      // FFmpegコマンドライン引数の設定
      const ffmpegArgs = [
        '-ss', formattedTime,
        '-i', inputPath,
        '-vframes', '1',
        '-vf', `scale=${this.thumbnailWidth}:${this.thumbnailHeight === -1 ? '-1' : this.thumbnailHeight}`,
        '-q:v', '2',
        '-y',
        outputPath
      ];
      
      console.log('サムネイル生成コマンド（参考用）:', `${ffmpegPath} ${ffmpegArgs.join(' ')}`);
      
      this.updateProgress(20, { phase: 'preparing' });
      
      // FFmpegサービスを使用してサムネイル生成
      console.log('ffmpegService.generateThumbnailを呼び出します');
      const result = await ffmpegService.generateThumbnail(inputPath, options);
      console.log('FFmpegServiceのサムネイル生成結果:', result);
      
      if (!result || !result.success) {
        console.error('サムネイル生成に失敗しました:', result);
        
        // バックアップメソッド：直接FFmpegを実行
        console.log('バックアップ方法としてFFmpegを直接実行します');
        const { spawn } = require('child_process');
        
        return new Promise((resolve, reject) => {
          this.updateProgress(30, { phase: 'direct_execution' });
          
          const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);
          console.log('FFmpegプロセスを直接開始しました');
          
          let stdoutData = '';
          let stderrData = '';
          
          ffmpegProcess.stdout.on('data', (data) => {
            const chunk = data.toString();
            stdoutData += chunk;
            console.log('FFmpeg stdout:', chunk);
          });
          
          ffmpegProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderrData += chunk;
            console.log('FFmpeg stderr:', chunk);
          });
          
          ffmpegProcess.on('exit', (code, signal) => {
            console.log(`FFmpegプロセスが終了しました: code=${code}, signal=${signal}`);
            
            if (code === 0) {
              // ファイルの存在を確認
              if (fs.existsSync(outputPath)) {
                console.log(`サムネイルファイルが生成されました: ${outputPath}`);
                this.updateProgress(100, { phase: 'completed', filePath: outputPath });
                resolve(this.succeed({ filePath: outputPath }));
              } else {
                console.error(`FFmpegは正常終了しましたが、ファイルが存在しません: ${outputPath}`);
                resolve(this.fail('サムネイルファイルが生成されませんでした'));
              }
            } else {
              console.error('FFmpegによるサムネイル生成に失敗しました', { code, stderr: stderrData });
              resolve(this.fail(`FFmpegエラー: ${stderrData}`));
            }
          });
          
          ffmpegProcess.on('error', (err) => {
            console.error('FFmpegプロセス起動エラー:', err);
            resolve(this.fail(`FFmpegプロセス起動エラー: ${err.message}`));
          });
        });
      }
      
      // 生成されたサムネイルファイルの存在を確認
      if (!fs.existsSync(result.path)) {
        console.error(`サムネイルが生成されましたが、ファイルが見つかりません: ${result.path}`);
        return this.fail('サムネイルファイルが見つかりません');
      }
      
      console.log(`===== サムネイル生成タスク完了 [${this.id}] =====`);
      console.log(`生成されたファイル: ${result.path}`);
      
      // タスク完了
      this.updateProgress(100, { phase: 'completed' });
      return this.complete({
        filePath: result.path,
        width: result.width,
        height: result.height,
        time: result.time
      });
    } catch (error) {
      console.error('サムネイル生成中にエラーが発生しました:', error);
      return this.fail(`サムネイル生成エラー: ${error.message}`);
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
    // FFmpegサービス経由でタスクをキャンセル
    if (this.ffmpegTaskId && ffmpegService) {
      try {
        ffmpegService.cancelTask(this.ffmpegTaskId);
      } catch (err) {
        console.error('FFmpegタスクのキャンセルに失敗:', err);
      }
    }
    
    return super.cancel();
  }
}

module.exports = ThumbnailTask;
