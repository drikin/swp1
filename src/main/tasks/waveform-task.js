/**
 * 波形生成タスク
 * オーディオファイルから波形データを生成します
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const BaseTask = require('../core/base-task');

class WaveformTask extends BaseTask {
  constructor(params) {
    super(params);
    this.type = 'waveform';
    this.cancellable = true;
    
    // FFmpeg処理用の変数
    this.ffmpegProcess = null;
  }

  /**
   * 波形データ生成の実行
   */
  async execute() {
    if (!this.mediaPath) {
      return this.fail('メディアパスが指定されていません');
    }

    try {
      // mediaPathがオブジェクトの場合、pathプロパティを使用
      const filePath = typeof this.mediaPath === 'object' && this.mediaPath.path 
        ? this.mediaPath.path 
        : this.mediaPath;

      // 入力ファイルの存在確認
      if (!fs.existsSync(filePath)) {
        return this.fail(`入力ファイルが存在しません: ${filePath}`);
      }

      // FFmpegのパスを取得
      const ffmpegPath = global.ffmpegPath;
      if (!ffmpegPath) {
        return this.fail('FFmpegのパスが設定されていません');
      }

      // 一時ファイルのパスを生成
      const tmpDir = path.join(require('os').tmpdir(), 'swp1-waveform');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      
      const outputPath = path.join(tmpDir, `waveform_${this.id}.json`);

      // FFmpegコマンドライン引数の設定
      const args = [
        '-i', filePath,
        '-filter_complex', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
        '-f', 'null', '-'
      ];

      return new Promise((resolve, reject) => {
        let waveformData = [];
        let duration = 0;
        
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
              
              // 進捗を計算
              if (duration > 0) {
                const progress = Math.min(Math.round((currentTime / duration) * 100), 99);
                this.updateProgress(progress);
              }
            }
          }
          
          // 波形データを抽出
          if (output.includes('lavfi.astats.Overall.RMS_level')) {
            const rmsMatch = output.match(/lavfi\.astats\.Overall\.RMS_level=(.+)/);
            if (rmsMatch) {
              const rmsLevel = parseFloat(rmsMatch[1]);
              // RMSレベルをデシベルから0-1の範囲に変換
              // -90dBを0、0dBを1とする
              const normalizedLevel = Math.max(0, Math.min(1, (rmsLevel + 90) / 90));
              waveformData.push(normalizedLevel);
            }
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
            reject(new Error(`FFmpegプロセスが${code}で終了しました`));
            return;
          }
          
          // 波形データの間引き（最大1000ポイント）
          const maxPoints = 1000;
          let finalWaveformData = waveformData;
          
          if (waveformData.length > maxPoints) {
            finalWaveformData = [];
            const step = waveformData.length / maxPoints;
            
            for (let i = 0; i < maxPoints; i++) {
              const index = Math.min(Math.floor(i * step), waveformData.length - 1);
              finalWaveformData.push(waveformData[index]);
            }
          }
          
          // 波形データを保存
          fs.writeFileSync(outputPath, JSON.stringify({
            waveform: finalWaveformData,
            duration: duration
          }), 'utf8');
          
          // タスク完了
          const result = {
            waveform: finalWaveformData,
            duration: duration,
            filePath: outputPath
          };
          
          this.complete(result);
          resolve(result);
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

module.exports = WaveformTask;
