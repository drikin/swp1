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
    
    // サンプリング関連の設定
    this.maxProcessingTime = 10; // 目標処理時間（秒）
    this.maxSamples = 10; // 最大サンプル数
    this.minSampleDuration = 3; // 最小サンプル持続時間（秒）
  }

  /**
   * 動画の長さを取得する
   * @param {string} filePath - 入力ファイルのパス
   * @param {string} ffmpegPath - FFmpegのパス
   * @returns {Promise<number>} - 動画の長さ（秒）
   */
  async getVideoDuration(filePath, ffmpegPath) {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', filePath,
        '-hide_banner'
      ];
      
      const process = spawn(ffmpegPath, args);
      let output = '';
      
      process.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      process.on('close', (code) => {
        const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1]);
          const minutes = parseInt(durationMatch[2]);
          const seconds = parseFloat(durationMatch[3]);
          const duration = hours * 3600 + minutes * 60 + seconds;
          resolve(duration);
        } else {
          reject(new Error('動画の長さを取得できませんでした'));
        }
      });
      
      process.on('error', reject);
    });
  }
  
  /**
   * サンプルポイントを生成する
   * @param {number} duration - 動画の長さ（秒）
   * @returns {Array<{start: number, duration: number}>} - サンプルポイントの配列
   */
  generateSamplePoints(duration) {
    // 動画の長さに基づいてサンプル数を決定
    let sampleCount = Math.min(
      Math.ceil(duration / 10), // 10秒ごとに1サンプル
      this.maxSamples // 最大サンプル数を制限
    );
    
    // 短い動画の場合は1サンプルのみ
    if (duration <= this.minSampleDuration * 2) {
      return [{
        start: 0,
        duration: Math.min(duration, this.minSampleDuration)
      }];
    }
    
    // サンプルポイントを均等に分散させる
    const samples = [];
    const sampleDuration = Math.min(this.minSampleDuration, duration / sampleCount);
    
    for (let i = 0; i < sampleCount; i++) {
      // 均等に分散させたスタート位置を計算
      const segmentSize = duration / sampleCount;
      const startPosition = (i * segmentSize) + ((segmentSize - sampleDuration) / 2);
      
      samples.push({
        start: Math.max(0, startPosition),
        duration: sampleDuration
      });
    }
    
    return samples;
  }
  
  /**
   * 単一サンプルのラウドネスを測定する
   * @param {string} inputPath - 入力ファイルのパス
   * @param {string} ffmpegPath - FFmpegのパス
   * @param {number} start - 開始位置（秒）
   * @param {number} duration - サンプル持続時間（秒）
   * @returns {Promise<Object>} - ラウドネス測定結果
   */
  async measureSampleLoudness(inputPath, ffmpegPath, start, duration) {
    return new Promise((resolve, reject) => {
      // FFmpegコマンドライン引数の設定（特定の時間範囲のみ処理）
      const args = [
        '-hide_banner',
        '-ss', start.toString(),
        '-t', duration.toString(),
        '-i', inputPath,
        '-af', 'loudnorm=print_format=json',
        '-f', 'null',
        '-'
      ];
      
      let loudnessData = '';
      this.ffmpegProcess = spawn(ffmpegPath, args);
      
      this.ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        // ラウドネスデータを収集
        if (output.includes('{') && output.includes('}')) {
          loudnessData += output;
        }
      });
      
      this.ffmpegProcess.on('error', (error) => {
        this.ffmpegProcess = null;
        reject(error);
      });
      
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
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      });
    });
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
      
      // 動画の長さを取得
      this.updateProgress(5, { phase: 'duration_check' });
      const duration = await this.getVideoDuration(inputPath, ffmpegPath);
      
      // サンプルポイントを生成
      const samplePoints = this.generateSamplePoints(duration);
      const totalSamples = samplePoints.length;
      
      this.updateProgress(10, { 
        phase: 'sampling',
        message: `${totalSamples}個のサンプルで測定します`
      });
      
      // 各サンプルのラウドネスを測定
      const sampleResults = [];
      let currentSample = 0;
      
      for (const sample of samplePoints) {
        currentSample++;
        this.updateProgress(
          10 + Math.floor((currentSample / totalSamples) * 80),
          { 
            phase: 'measuring',
            message: `サンプル ${currentSample}/${totalSamples} を測定中`
          }
        );
        
        const result = await this.measureSampleLoudness(
          inputPath, 
          ffmpegPath, 
          sample.start, 
          sample.duration
        );
        
        sampleResults.push(result);
      }
      
      this.updateProgress(90, { phase: 'calculating' });
      
      // 平均値を計算
      const averageLoudness = {
        integrated_loudness: this.calculateAverage(sampleResults.map(r => parseFloat(r.input_i))),
        true_peak: this.calculateMaxValue(sampleResults.map(r => parseFloat(r.input_tp))),
        lra: this.calculateAverage(sampleResults.map(r => parseFloat(r.input_lra))),
        threshold: this.calculateAverage(sampleResults.map(r => parseFloat(r.input_thresh)))
      };
      
      // 結果をJSON形式で保存
      const resultData = {
        ...averageLoudness,
        samples: sampleResults,
        sample_count: totalSamples,
        duration: duration
      };
      
      fs.writeFileSync(outputPath, JSON.stringify(resultData), 'utf8');
      
      this.updateProgress(100, { phase: 'complete' });
      
      // フォーマットされた結果
      const result = {
        integrated_loudness: averageLoudness.integrated_loudness,
        true_peak: averageLoudness.true_peak,
        lra: averageLoudness.lra,
        threshold: averageLoudness.threshold,
        raw: resultData,
        filePath: outputPath
      };
      
      // デバッグログを追加
      console.log(`===== ラウドネス測定タスク完了 [${this.id}] =====`);
      console.log(`メディアパス: ${typeof this.mediaPath === 'object' ? JSON.stringify(this.mediaPath) : this.mediaPath}`);
      console.log(`サンプル数: ${totalSamples}, 動画長: ${duration}秒`);
      console.log(`結果: ${JSON.stringify({
        lufs: result.integrated_loudness,
        truePeak: result.true_peak
      })}`);
      
      // タスク完了（TaskManagerのeventEmitterを通じてイベントが発行される）
      this.complete(result);
      return result;
    } catch (error) {
      return this.fail(error);
    }
  }
  
  /**
   * 平均値を計算
   * @param {Array<number>} values - 数値の配列
   * @returns {number} - 平均値
   */
  calculateAverage(values) {
    if (!values.length) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }
  
  /**
   * 最大値を計算
   * @param {Array<number>} values - 数値の配列
   * @returns {number} - 最大値
   */
  calculateMaxValue(values) {
    if (!values.length) return 0;
    return Math.max(...values);
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
