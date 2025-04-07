/**
 * FFmpegサービス
 * FFmpegを使用した処理を共通化するためのサービス
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class FFmpegService {
  constructor() {
    this.events = new EventEmitter();
    this.processes = new Map(); // タスクIDとFFmpegプロセスのマッピング
  }

  /**
   * FFmpegのパスを取得
   * @returns {string} - FFmpegの実行パス
   * @throws {Error} - FFmpegのパスが設定されていない場合
   */
  _getFFmpegPath() {
    const ffmpegPath = global.ffmpegPath;
    if (!ffmpegPath) {
      throw new Error('FFmpegのパスが設定されていません');
    }
    return ffmpegPath;
  }

  /**
   * 時間文字列をパース
   * @param {string} timeStr - hh:mm:ss.ms 形式の時間文字列
   * @returns {number} - 秒数
   */
  parseTimeString(timeStr) {
    if (!timeStr) return 0;
    
    const match = timeStr.match(/(\d+):(\d+):(\d+\.\d+)/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const seconds = parseFloat(match[3]);
      return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
  }

  /**
   * 秒数を時間文字列に変換
   * @param {number} seconds - 秒数
   * @returns {string} - hh:mm:ss.ms 形式の時間文字列
   */
  formatTimeString(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  /**
   * FFmpeg出力から進捗情報を抽出
   * @param {string} output - FFmpegの出力文字列
   * @returns {object|null} - 進捗情報またはnull
   */
  extractProgressInfo(output) {
    let currentTime = 0;
    let duration = 0;
    let progress = 0;
    
    // 現在時間を抽出
    const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const seconds = parseFloat(timeMatch[3]);
      currentTime = hours * 3600 + minutes * 60 + seconds;
    } else {
      return null;
    }
    
    // 総時間を抽出
    const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    if (durationMatch) {
      const dHours = parseInt(durationMatch[1]);
      const dMinutes = parseInt(durationMatch[2]);
      const dSeconds = parseFloat(durationMatch[3]);
      duration = dHours * 3600 + dMinutes * 60 + dSeconds;
    }
    
    // 進捗率を計算
    if (duration > 0) {
      progress = Math.min(Math.round((currentTime / duration) * 100), 99);
    }
    
    return {
      currentTime,
      duration,
      progress,
      output
    };
  }

  /**
   * 波形データの生成
   * @param {object} options - オプション
   * @param {string} options.inputPath - 入力ファイルパス
   * @param {string} options.taskId - タスクID
   * @returns {Promise<object>} - 波形データと関連情報
   */
  async generateWaveform(options) {
    const { inputPath, taskId } = options;
    
    if (!inputPath) {
      throw new Error('入力ファイルパスが指定されていません');
    }
    
    // 一時ファイルのパスを生成
    const tmpDir = path.join(require('os').tmpdir(), 'swp1-waveform');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    const outputPath = path.join(tmpDir, `waveform_${Date.now()}.json`);
    
    // FFmpegのパスを取得
    const ffmpegPath = this._getFFmpegPath();
    
    // コマンドライン引数の設定
    const args = [
      '-i', inputPath,
      '-filter_complex', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
      '-f', 'null', '-'
    ];
    
    return new Promise((resolve, reject) => {
      let waveformData = [];
      let duration = 0;
      
      // FFmpegプロセスを作成
      const process = spawn(ffmpegPath, args);
      
      // プロセスを保存
      if (taskId) {
        this.processes.set(taskId, process);
      }
      
      // データ受信
      process.stderr.on('data', (data) => {
        const output = data.toString();
        
        // 進捗情報を抽出
        const progressInfo = this.extractProgressInfo(output);
        if (progressInfo) {
          duration = progressInfo.duration;
          this.events.emit('progress', progressInfo);
        }
        
        // 波形データを抽出
        if (output.includes('lavfi.astats.Overall.RMS_level')) {
          const rmsMatch = output.match(/lavfi\.astats\.Overall\.RMS_level=(.+)/);
          if (rmsMatch) {
            const rmsLevel = parseFloat(rmsMatch[1]);
            // RMSレベルをデシベルから0-1の範囲に変換
            // -90dBを0、0dBを1とする（-90dBより小さい値は0に丸める）
            const normalizedLevel = Math.max(0, Math.min(1, (rmsLevel + 90) / 90));
            waveformData.push(normalizedLevel);
          }
        }
      });
      
      // エラーハンドリング
      process.on('error', (error) => {
        if (taskId) {
          this.processes.delete(taskId);
        }
        reject(error);
      });
      
      // プロセス終了時の処理
      process.on('close', (code) => {
        if (taskId) {
          this.processes.delete(taskId);
        }
        
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
        
        // 結果オブジェクト
        const result = {
          waveform: finalWaveformData,
          duration: duration,
          filePath: outputPath
        };
        
        resolve(result);
      });
    });
  }

  /**
   * ラウドネス測定
   * @param {object} options - オプション
   * @param {string} options.inputPath - 入力ファイルパス
   * @param {string} options.taskId - タスクID
   * @returns {Promise<object>} - ラウドネスデータ
   */
  async measureLoudness(options) {
    const { inputPath, taskId } = options;
    
    if (!inputPath) {
      throw new Error('入力ファイルパスが指定されていません');
    }
    
    // 一時ファイルのパスを生成
    const tmpDir = path.join(require('os').tmpdir(), 'swp1-loudness');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    const outputPath = path.join(tmpDir, `loudness_${Date.now()}.json`);
    
    // FFmpegのパスを取得
    const ffmpegPath = this._getFFmpegPath();
    
    // コマンドライン引数の設定
    const args = [
      '-hide_banner',
      '-i', inputPath,
      '-af', 'loudnorm=print_format=json',
      '-f', 'null',
      '-'
    ];
    
    return new Promise((resolve, reject) => {
      let loudnessData = '';
      let measurementPhase = 'first_pass';
      
      // FFmpegプロセスを作成
      const process = spawn(ffmpegPath, args);
      
      // プロセスを保存
      if (taskId) {
        this.processes.set(taskId, process);
      }
      
      // データ受信
      process.stderr.on('data', (data) => {
        const output = data.toString();
        
        // 進捗情報を抽出
        const progressInfo = this.extractProgressInfo(output);
        if (progressInfo) {
          // 進捗を2段階に分ける
          let finalProgress;
          if (measurementPhase === 'first_pass') {
            finalProgress = Math.floor(progressInfo.progress / 2); // 最大50%
          } else {
            finalProgress = 50 + Math.floor(progressInfo.progress / 2); // 50%〜100%
          }
          
          this.events.emit('progress', {
            ...progressInfo,
            progress: finalProgress,
            phase: measurementPhase
          });
        }
        
        // 第一パス完了を検出
        if (output.includes('Parsed_loudnorm')) {
          measurementPhase = 'second_pass';
          this.events.emit('progress', {
            progress: 50,
            phase: 'second_pass'
          });
        }
        
        // ラウドネスデータを収集
        if (output.includes('{') && output.includes('}')) {
          loudnessData += output;
        }
      });
      
      // エラーハンドリング
      process.on('error', (error) => {
        if (taskId) {
          this.processes.delete(taskId);
        }
        reject(error);
      });
      
      // プロセス終了時の処理
      process.on('close', (code) => {
        if (taskId) {
          this.processes.delete(taskId);
        }
        
        if (code !== 0) {
          reject(new Error(`FFmpegプロセスが${code}で終了しました`));
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
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * サムネイル生成
   * @param {object} options - オプション
   * @param {string} options.inputPath - 入力ファイルパス
   * @param {number} options.timePosition - 時間位置（秒）
   * @param {string} options.size - サイズ指定（例: '320x240'）
   * @param {string} options.taskId - タスクID
   * @returns {Promise<object>} - サムネイル情報
   */
  async generateThumbnail(options) {
    const { 
      inputPath, 
      timePosition = 0, 
      size = '320x240', 
      taskId 
    } = options;
    
    if (!inputPath) {
      throw new Error('入力ファイルパスが指定されていません');
    }
    
    // 出力パスを生成
    const outputDir = path.join(require('os').tmpdir(), 'swp1-thumbnails');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, `thumbnail_${Date.now()}.jpg`);
    
    // FFmpegのパスを取得
    const ffmpegPath = this._getFFmpegPath();
    
    // 時間をhh:mm:ss形式に変換
    const formattedTime = this.formatTimeString(timePosition);
    
    // FFmpegコマンドライン引数の設定
    const args = [
      '-ss', formattedTime,
      '-i', inputPath,
      '-vframes', '1',
      '-s', size,
      '-y', // 既存ファイルを上書き
      outputPath
    ];
    
    // 開始を通知
    this.events.emit('progress', { progress: 10, phase: 'starting' });
    
    return new Promise((resolve, reject) => {
      // FFmpegプロセスを作成
      const process = spawn(ffmpegPath, args);
      
      // プロセスを保存
      if (taskId) {
        this.processes.set(taskId, process);
      }
      
      // 処理中を通知
      this.events.emit('progress', { progress: 50, phase: 'processing' });
      
      // エラー出力を収集
      let errorOutput = '';
      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      // エラーハンドリング
      process.on('error', (error) => {
        if (taskId) {
          this.processes.delete(taskId);
        }
        reject(error);
      });
      
      // プロセス終了時の処理
      process.on('close', (code) => {
        if (taskId) {
          this.processes.delete(taskId);
        }
        
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
          timePosition: timePosition,
          size: size,
          base64: base64Image
        };
        
        resolve(result);
      });
    });
  }

  /**
   * タスクキャンセル
   * @param {string} taskId - キャンセルするタスクのID
   * @returns {boolean} - 成功したらtrue
   */
  cancelTask(taskId) {
    if (!this.processes.has(taskId)) {
      return false;
    }
    
    try {
      const process = this.processes.get(taskId);
      process.kill('SIGTERM');
      this.processes.delete(taskId);
      return true;
    } catch (err) {
      console.error('FFmpegプロセスの終了に失敗:', err);
      return false;
    }
  }

  /**
   * イベントリスナー登録
   * @param {string} event - イベント名
   * @param {Function} listener - リスナー関数
   */
  on(event, listener) {
    this.events.on(event, listener);
    return this;
  }

  /**
   * イベントリスナー解除
   * @param {string} event - イベント名
   * @param {Function} listener - リスナー関数
   */
  off(event, listener) {
    this.events.off(event, listener);
    return this;
  }
}

// シングルトンインスタンスの作成
const ffmpegService = new FFmpegService();

module.exports = ffmpegService;
