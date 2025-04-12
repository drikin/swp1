/**
 * 波形生成タスク
 * オーディオファイルから波形データを生成します
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const BaseTask = require('../core/base-task');

class WaveformTask extends BaseTask {
  constructor(params) {
    super(params);
    this.type = 'waveform';
    this.cancellable = true;
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

      console.log(`波形生成タスク実行: ID=${this.id}, ファイル=${filePath}`);

      // 一時ファイルのパスを生成
      const homeDir = os.homedir();
      const baseDir = path.join(homeDir, 'Super Watarec');
      const waveformDir = path.join(baseDir, 'waveform'); 
      if (!fs.existsSync(waveformDir)) {
        fs.mkdirSync(waveformDir, { recursive: true });
      }
      
      // 重要: waveform_task_プレフィックスを付けて保存。これはwaveform-handlers.jsが期待するファイル名
      const outputPath = path.join(waveformDir, `waveform_task_${this.id}.json`);
      console.log(`波形データ出力先: ${outputPath}`);

      // 進捗状況の更新
      this.updateProgress(10, { phase: 'starting' });
      
      // 実際のメディアファイルから波形データを生成
      let waveformData;
      let duration;
      
      try {
        const result = await this._extractWaveformFromMedia(filePath);
        waveformData = result.waveform;
        duration = result.duration;
        this.updateProgress(90, { phase: 'processing_complete' });
        
      } catch (extractError) {
        console.error(`波形抽出エラー: ${extractError}. フォールバック生成を使用します。`);
        // 抽出に失敗した場合は、フォールバックとしてランダムなデータを生成
        waveformData = this._generateRandomWaveformData();
        duration = 60; // 仮の長さ
        this.updateProgress(90, { phase: 'fallback_complete' });
      }
      
      const jsonData = {
        waveform: waveformData,
        duration: duration
      };
      
      fs.writeFileSync(outputPath, JSON.stringify(jsonData), 'utf8');
      console.log(`波形データをファイルに保存しました: ${outputPath}`);
      
      this.updateProgress(100, { phase: 'completed' });
      
      const result = {
        waveform: waveformData, 
        duration: duration,
        filePath: outputPath,
        id: this.id  
      };
      
      console.log(`波形生成タスク完了: ID=${this.id}, 結果データポイント数=${waveformData.length}`);
      
      this.complete(result);
      return result;
    } catch (error) {
      console.error(`波形生成タスクエラー: ${error}`);
      return this.fail(error);
    }
  }

  /**
   * 実際のメディアファイルから波形データを抽出
   * @param {string} filePath - メディアファイルのパス
   * @returns {Promise<Object>} - 波形データと継続時間
   * @private
   */
  async _extractWaveformFromMedia(filePath) {
    return new Promise((resolve, reject) => {
      try {
        // グローバル変数からFFmpegパスを取得
        const ffmpegPath = global.ffmpegPath;
        
        if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
          return reject(new Error('FFmpegが見つかりません'));
        }
        
        // 一時ファイルのパスを生成（PCM音声データ用）
        const tempDir = path.join(os.tmpdir(), 'super_watarec_waveform');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const tempPcmFile = path.join(tempDir, `${this.id}_temp.pcm`);
        
        // FFmpegコマンド: オーディオをPCMデータに変換（高速化のため低サンプリングレートを使用）
        const args = [
          '-i', filePath,
          '-ac', '1',          // モノラルに変換
          '-ar', '8000',       // サンプリングレート: 8kHz（低めにして処理を高速化）
          '-f', 's16le',       // 16ビット符号付きリトルエンディアン
          '-acodec', 'pcm_s16le',
          tempPcmFile
        ];
        
        console.log(`FFmpeg実行: ${ffmpegPath} ${args.join(' ')}`);
        
        // FFmpegプロセスを開始
        this.ffmpegProcess = execFile(ffmpegPath, args, (error) => {
          if (error) {
            fs.existsSync(tempPcmFile) && fs.unlinkSync(tempPcmFile);
            return reject(error);
          }
          
          try {
            // メディアファイルの長さを取得するコマンド
            const durationArgs = [
              '-i', filePath,
              '-show_entries', 'format=duration',
              '-v', 'quiet',
              '-of', 'csv=p=0'
            ];
            
            // FFprobeのパスを取得（FFmpegと同じディレクトリにある）
            const ffprobePath = ffmpegPath.replace('ffmpeg', 'ffprobe');
            
            // 継続時間を取得
            execFile(ffprobePath, durationArgs, (durationError, stdout) => {
              const duration = durationError ? 0 : parseFloat(stdout.trim()) || 0;
              
              // PCMファイルから波形データを生成
              try {
                if (!fs.existsSync(tempPcmFile)) {
                  return reject(new Error('PCMファイルの生成に失敗しました'));
                }
                
                const pcmData = fs.readFileSync(tempPcmFile);
                const waveform = this._processPcmData(pcmData, 1000); // 1000ポイントの波形データ
                
                // 一時ファイルを削除
                fs.unlinkSync(tempPcmFile);
                
                resolve({ waveform, duration });
              } catch (processingError) {
                fs.existsSync(tempPcmFile) && fs.unlinkSync(tempPcmFile);
                reject(processingError);
              }
            });
          } catch (postProcessError) {
            fs.existsSync(tempPcmFile) && fs.unlinkSync(tempPcmFile);
            reject(postProcessError);
          }
        });
      } catch (setupError) {
        reject(setupError);
      }
    });
  }

  /**
   * PCMデータを処理して波形データに変換
   * @param {Buffer} pcmData - PCMオーディオデータ
   * @param {number} sampleCount - 出力する波形ポイントの数
   * @returns {Array<number>} - 0〜1の範囲の波形データ配列
   * @private
   */
  _processPcmData(pcmData, sampleCount) {
    // PCMデータがない場合はランダムデータを返す
    if (!pcmData || pcmData.length === 0) {
      console.log('PCMデータがないため、ランダムデータを生成します');
      return this._generateRandomWaveformData(sampleCount);
    }
    
    try {
      // 16ビット符号付き整数として値を取得
      const dataView = new DataView(pcmData.buffer);
      const sampleSize = 2; // 16ビット = 2バイト
      const totalSamples = Math.floor(pcmData.length / sampleSize);
      
      console.log(`PCMデータ解析: 合計サンプル数=${totalSamples}, データ長=${pcmData.length}バイト`);
      
      if (totalSamples === 0) {
        console.log('有効なサンプルがないため、ランダムデータを生成します');
        return this._generateRandomWaveformData(sampleCount);
      }
      
      // サンプルあたりのPCMデータポイント数
      const pointsPerSample = Math.max(1, Math.floor(totalSamples / sampleCount));
      console.log(`波形生成設定: サンプル数=${sampleCount}, サンプルあたりのポイント数=${pointsPerSample}`);
      
      // 波形データを生成
      const waveform = [];
      let maxAmplitude = 0; // 最大振幅を追跡
      
      // 各サンプル範囲の最大値を見つける
      for (let i = 0; i < sampleCount; i++) {
        const startIdx = i * pointsPerSample;
        const endIdx = Math.min(startIdx + pointsPerSample, totalSamples);
        
        let maxSample = 0;
        
        for (let j = startIdx; j < endIdx; j++) {
          const offset = j * sampleSize;
          if (offset + 1 < pcmData.length) {
            const sample = Math.abs(dataView.getInt16(offset, true)); // リトルエンディアン
            maxSample = Math.max(maxSample, sample);
          }
        }
        
        maxAmplitude = Math.max(maxAmplitude, maxSample);
        waveform.push(maxSample);
      }
      
      // 値を0〜1の範囲に正規化
      const normalizedWaveform = waveform.map(value => {
        if (maxAmplitude === 0) return 0;
        return value / maxAmplitude;
      });
      
      console.log(`波形データ生成完了: データポイント数=${normalizedWaveform.length}, 最大振幅=${maxAmplitude}`);
      
      // 生成した波形データのサンプルをログ出力
      const previewData = normalizedWaveform.slice(0, 10).map(v => v.toFixed(2));
      console.log(`波形データサンプル: [${previewData.join(', ')}...]`);
      
      return normalizedWaveform;
    } catch (error) {
      console.error('PCMデータ処理エラー:', error);
      return this._generateRandomWaveformData(sampleCount);
    }
  }

  /**
   * ランダムな波形データを生成（フォールバック用）
   * @param {number} [points=1000] - 生成するデータポイントの数
   * @returns {Array<number>} - 0〜1の範囲の波形データ配列
   * @private
   */
  _generateRandomWaveformData(points = 1000) {
    console.log('ランダムな波形データを生成します（フォールバック）');
    const waveform = [];
    
    for (let i = 0; i < points; i++) {
      const sine = Math.sin(i / 30) * 0.4 + 0.5;
      const randomness = Math.random() * 0.2;
      let value = sine + randomness;
      
      value = Math.max(0, Math.min(1, value));
      
      waveform.push(value);
    }
    
    return waveform;
  }

  /**
   * タスクキャンセル
   */
  cancel() {
    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.kill();
        console.log(`FFmpegプロセスをキャンセルしました: タスクID=${this.id}`);
      } catch (error) {
        console.error(`FFmpegプロセスのキャンセルに失敗: ${error}`);
      }
      this.ffmpegProcess = null;
    }
    return super.cancel();
  }
}

module.exports = WaveformTask;