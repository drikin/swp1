/**
 * ラウドネス測定タスク
 * オーディオファイルのラウドネスを測定します
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const BaseTask = require('../core/base-task');

class LoudnessTask extends BaseTask {
  constructor(params) {
    super(params);
    this.type = 'loudness';
    this.cancellable = true;
    
    // FFmpeg処理用の変数
    this.ffmpegProcess = null;
  }

  /**
   * ラウドネス測定の実行
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

      // 一時ファイルのパスを生成
      const tmpDir = path.join(require('os').tmpdir(), 'swp1-loudness');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      
      const outputPath = path.join(tmpDir, `loudness_${this.id}.json`);

      // FFmpegコマンドライン引数の設定
      const args = [
        '-hide_banner',
        '-i', inputPath,
        '-af', 'loudnorm=print_format=json',
        '-f', 'null',
        '-'
      ];

      return new Promise((resolve, reject) => {
        let loudnessData = '';
        let duration = 0;
        let measurementPhase = 'first_pass'; // 測定フェーズ（first_pass または second_pass）
        
        // FFmpegプロセスを作成
        this.ffmpegProcess = spawn(ffmpegPath, args);
        
        // データ受信
        this.ffmpegProcess.stderr.on('data', (data) => {
          const output = data.toString();
          
          // 進捗情報を抽出
          if (output.includes('time=')) {
            const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
            if (timeMatch) {
              const hours = parseInt(timeMatch[1]);
              const minutes = parseInt(timeMatch[2]);
              const seconds = parseFloat(timeMatch[3]);
              const currentTime = hours * 3600 + minutes * 60 + seconds;
              
              // 動画の長さを抽出
              const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
              if (durationMatch && duration === 0) {
                const dHours = parseInt(durationMatch[1]);
                const dMinutes = parseInt(durationMatch[2]);
                const dSeconds = parseFloat(durationMatch[3]);
                duration = dHours * 3600 + dMinutes * 60 + dSeconds;
              }
              
              // 進捗を計算（2パスあるため最大50%）
              if (duration > 0) {
                const phaseProgress = Math.min(Math.round((currentTime / duration) * 100), 99);
                let totalProgress;
                
                if (measurementPhase === 'first_pass') {
                  totalProgress = Math.floor(phaseProgress / 2); // 最大50%
                } else {
                  totalProgress = 50 + Math.floor(phaseProgress / 2); // 50%〜100%
                }
                
                this.updateProgress(totalProgress);
              }
            }
          }
          
          // 第一パス完了を検出
          if (output.includes('Parsed_loudnorm')) {
            measurementPhase = 'second_pass';
            this.updateProgress(50, { phase: 'second_pass' });
          }
          
          // ラウドネスデータを収集
          if (output.includes('{') && output.includes('}')) {
            loudnessData += output;
          }
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
            reject(new Error(`FFmpegプロセスが${code}で終了しました: ${loudnessData}`));
            return;
          }
          
          try {
            // JSON部分を抽出して解析
            const jsonMatch = loudnessData.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              reject(new Error('ラウドネスデータの解析に失敗しました'));
              return;
            }
            
            const jsonData = JSON.parse(jsonMatch[0]);
            
            // 結果を保存
            fs.writeFileSync(outputPath, JSON.stringify(jsonData), 'utf8');
            
            // フォーマットされた結果
            const result = {
              integrated_loudness: parseFloat(jsonData.input_i),
              true_peak: parseFloat(jsonData.input_tp),
              lra: parseFloat(jsonData.input_lra),
              threshold: parseFloat(jsonData.input_thresh),
              raw: jsonData,
              filePath: outputPath
            };
            
            // デバッグログを追加
            console.log(`===== ラウドネス測定タスク完了 [${this.id}] =====`);
            console.log(`メディアパス: ${typeof this.mediaPath === 'object' ? JSON.stringify(this.mediaPath) : this.mediaPath}`);
            console.log(`結果: ${JSON.stringify({
              lufs: result.integrated_loudness,
              truePeak: result.true_peak
            })}`);
            
            // タスク完了（TaskManagerのeventEmitterを通じてイベントが発行される）
            this.complete(result);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
    } catch (error) {
      return this.fail(error);
    }
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

module.exports = LoudnessTask;
