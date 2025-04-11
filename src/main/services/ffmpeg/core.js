/**
 * FFmpegサービスコア
 * FFmpegを使用した各種処理を提供する中心モジュール
 */
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const FFmpegTaskManager = require('./task-manager');
const { 
  initializeWorkDirectories, 
  parseTimeString, 
  formatTimeString 
} = require('./utils');
const { EventEmitter } = require('events');

class FFmpegServiceCore extends EventEmitter {
  constructor() {
    super();
    // 作業ディレクトリを初期化
    this.directories = initializeWorkDirectories();
    
    // タスクマネージャーを初期化
    this.taskManager = new FFmpegTaskManager();
    
    // イベントを転送
    this._forwardEvents();
  }
  
  /**
   * タスクマネージャーからのイベントを転送
   * @private
   */
  _forwardEvents() {
    // 進捗イベント
    this.taskManager.on('progress', (taskId, task) => {
      this.emit('progress', taskId, task);
    });
    
    // 完了イベント
    this.taskManager.on('completed', (taskId, task) => {
      this.emit('completed', taskId, task);
    });
    
    // エラーイベント
    this.taskManager.on('error', (taskId, task) => {
      this.emit('error', taskId, task);
    });
    
    // キャンセルイベント
    this.taskManager.on('cancelled', (taskId, task) => {
      this.emit('cancelled', taskId, task);
    });
  }
  
  /**
   * 特定のタイプの作業ディレクトリパスを取得
   * @param {string} type - ディレクトリタイプ ('waveform', 'thumbnails', 'temp', 'logs')
   * @returns {string} - 作業ディレクトリのパス
   */
  getWorkDir(type) {
    return this.directories[type] || this.directories.base;
  }
  
  /**
   * イベント発行用のミックスイン
   * @param {string} eventName - イベント名
   * @param {...any} args - イベント引数
   */
  emit(eventName, ...args) {
    // EventEmitterの標準的なemitを使用
    return super.emit(eventName, ...args);
  }
  
  /**
   * イベントリスナー登録用のミックスイン
   * @param {string} eventName - イベント名
   * @param {Function} listener - リスナー関数
   */
  on(eventName, listener) {
    this.taskManager.on(eventName, listener);
  }
  
  /**
   * イベントリスナー削除用のミックスイン
   * @param {string} eventName - イベント名
   * @param {Function} listener - リスナー関数
   */
  off(eventName, listener) {
    this.taskManager.off(eventName, listener);
  }
  
  /**
   * メディアファイルの情報を取得
   * @param {string} filePath - メディアファイルのパス
   * @returns {Promise<Object>} - メディアファイルの情報
   */
  async getMediaInfo(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`ファイルが存在しません: ${filePath}`);
    }
    
    const args = [
      '-v', 'error',
      '-show_format',
      '-show_streams',
      '-of', 'json',
      filePath
    ];
    
    const taskId = uuidv4();
    
    try {
      await this.taskManager.createTask(args, {
        taskId,
        type: 'mediainfo',
        details: { filePath }
      });
      
      // タスク情報を取得
      const task = this.taskManager.getTaskStatus(taskId);
      
      if (task.status === 'error') {
        throw new Error(`メディア情報の取得に失敗しました: ${task.error}`);
      }
      
      // JSON結果をパース
      try {
        const mediaInfo = JSON.parse(task.stdout);
        return this._processMediaInfo(mediaInfo, filePath);
      } catch (error) {
        throw new Error(`メディア情報のパースに失敗しました: ${error.message}`);
      }
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * メディア情報を処理して整形
   * @param {Object} mediaInfo - 生のメディア情報オブジェクト
   * @param {string} filePath - メディアファイルのパス
   * @returns {Object} - 整形されたメディア情報
   * @private
   */
  _processMediaInfo(mediaInfo, filePath) {
    const result = {
      path: filePath,
      filename: path.basename(filePath),
      duration: 0,
      format: '',
      width: 0,
      height: 0,
      videoCodec: '',
      audioCodec: '',
      bitrate: 0,
      streams: {
        video: [],
        audio: []
      }
    };
    
    // フォーマット情報
    if (mediaInfo.format) {
      result.format = mediaInfo.format.format_name;
      result.duration = parseFloat(mediaInfo.format.duration) || 0;
      result.bitrate = parseInt(mediaInfo.format.bit_rate) || 0;
    }
    
    // ストリーム情報
    if (mediaInfo.streams && Array.isArray(mediaInfo.streams)) {
      mediaInfo.streams.forEach(stream => {
        // ビデオストリーム
        if (stream.codec_type === 'video') {
          result.streams.video.push({
            index: stream.index,
            codec: stream.codec_name,
            width: stream.width,
            height: stream.height,
            frameRate: this._parseFrameRate(stream.r_frame_rate),
            duration: parseFloat(stream.duration) || result.duration
          });
          
          // メインのビデオストリーム情報を設定
          if (result.streams.video.length === 1) {
            result.width = stream.width;
            result.height = stream.height;
            result.videoCodec = stream.codec_name;
          }
        }
        
        // オーディオストリーム
        if (stream.codec_type === 'audio') {
          result.streams.audio.push({
            index: stream.index,
            codec: stream.codec_name,
            channels: stream.channels,
            sampleRate: parseInt(stream.sample_rate) || 0,
            duration: parseFloat(stream.duration) || result.duration
          });
          
          // メインのオーディオコーデック情報を設定
          if (result.streams.audio.length === 1) {
            result.audioCodec = stream.codec_name;
          }
        }
      });
    }
    
    return result;
  }
  
  /**
   * フレームレート文字列をパース
   * @param {string} rateStr - フレームレート文字列 (e.g., '24000/1001')
   * @returns {number} - フレームレート数値
   * @private
   */
  _parseFrameRate(rateStr) {
    if (!rateStr) return 0;
    
    // 分数形式をパース
    const parts = rateStr.split('/');
    if (parts.length === 2) {
      const numerator = parseInt(parts[0]);
      const denominator = parseInt(parts[1]);
      
      if (denominator === 0) return 0;
      return numerator / denominator;
    }
    
    // 単一の数値の場合
    return parseFloat(rateStr) || 0;
  }
  
  /**
   * サムネイルを生成
   * @param {string} filePath - メディアファイルのパス
   * @param {Object} options - サムネイル生成オプション
   * @returns {Promise<Object>} - サムネイル情報
   */
  async generateThumbnail(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`ファイルが存在しません: ${filePath}`);
    }
    
    const {
      time = 0,
      width = 320,
      height = null,
      quality = 90,
      outputPath = null
    } = options;
    
    // 出力先の設定
    const thumbnailDir = this.getWorkDir('thumbnails');
    const outputFilePath = outputPath || path.join(
      thumbnailDir,
      `${path.basename(filePath, path.extname(filePath))}_${Date.now()}.jpg`
    );
    
    // フォルダが存在することを確認
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }
    
    console.log(`サムネイル生成開始: ${filePath} -> ${outputFilePath}`);
    
    // 引数の設定
    const args = [
      '-ss', formatTimeString(time),
      '-i', filePath,
      '-vframes', '1',
      '-q:v', String(Math.max(1, Math.min(31, 31 - quality / 3.3))),
      '-vf', `scale=${width}:${height === null ? -1 : height}`,
      '-f', 'image2',
      '-y', outputFilePath
    ];
    
    const taskId = uuidv4();
    
    try {
      // タスク作成と実行
      console.log(`サムネイルタスク作成: ${taskId} - ${args.join(' ')}`);
      await this.taskManager.createTask(args, {
        taskId,
        type: 'thumbnail',
        details: { filePath, time, outputPath: outputFilePath }
      });
      
      // タスクが完了するまで待機（重要）
      const waitForCompletion = async () => {
        let task;
        let retries = 0;
        const maxRetries = 30; // 最大30回（30秒）試行
        
        while (retries < maxRetries) {
          task = this.taskManager.getTaskStatus(taskId);
          
          if (task.status === 'completed') {
            break;
          } else if (task.status === 'error') {
            throw new Error(`サムネイル生成に失敗しました: ${task.error}`);
          }
          
          // 100ms待機してから再チェック
          await new Promise(resolve => setTimeout(resolve, 100));
          retries++;
        }
        
        if (retries >= maxRetries) {
          throw new Error('サムネイル生成がタイムアウトしました');
        }
        
        return task;
      };
      
      // タスク完了を待機
      await waitForCompletion();
      
      // ファイルの存在を確認
      if (!fs.existsSync(outputFilePath)) {
        throw new Error(`生成されたサムネイルファイルが見つかりません: ${outputFilePath}`);
      }
      
      console.log(`サムネイル生成完了: ${outputFilePath}`);
      
      return {
        success: true,
        path: outputFilePath,
        time,
        width,
        height
      };
    } catch (error) {
      console.error('サムネイル生成エラー:', error);
      throw error;
    }
  }
  
  /**
   * 波形データを生成
   * @param {string} filePath - メディアファイルのパス
   * @param {Object} options - 波形生成オプション
   * @returns {Promise<Object>} - 波形データ情報
   */
  async generateWaveform(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`ファイルが存在しません: ${filePath}`);
    }
    
    const {
      samples = 100,
      channel = 0,
      mediaId,
      outputPath = null
    } = options;
    
    // 出力先の設定
    const waveformDir = this.getWorkDir('waveform');
    const outputFilePath = outputPath || path.join(
      waveformDir,
      `${mediaId || path.basename(filePath, path.extname(filePath))}_${Date.now()}.json`
    );
    
    // 引数の設定
    const args = [
      '-i', filePath,
      '-filter_complex', `showwavespic=s=${samples}x128:scale=lin:colors=blue|blue:filter=peak:split_channels=1`,
      '-f', 'apng',
      '-y', path.join(this.getWorkDir('temp'), `${Date.now()}_wave.png`)
    ];
    
    const taskId = uuidv4();
    
    try {
      await this.taskManager.createTask(args, {
        taskId,
        type: 'waveform',
        details: { filePath, mediaId, outputPath: outputFilePath }
      });
      
      // タスク情報を取得
      const task = this.taskManager.getTaskStatus(taskId);
      
      if (task.status === 'error') {
        throw new Error(`波形データ生成に失敗しました: ${task.error}`);
      }
      
      // 波形データを抽出して解析
      const waveformData = this._parseWaveformOutput(task.stderr, samples);
      
      // 波形データをJSONとして保存
      fs.writeFileSync(outputFilePath, JSON.stringify(waveformData));
      
      return {
        success: true,
        path: outputFilePath,
        samples,
        channel,
        data: waveformData
      };
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * FFmpeg出力から波形データを抽出
   * @param {string} output - FFmpeg出力
   * @param {number} samples - サンプル数
   * @returns {Array<number>} - 波形データの配列
   * @private
   */
  _parseWaveformOutput(output, samples) {
    // 波形データの正規表現
    const waveformRegex = /lavfi\.showwavespic\.0\.0\.1\s*=\s*([\d.]+)/g;
    
    // 全ての一致を抽出
    const data = [];
    let match;
    
    while ((match = waveformRegex.exec(output)) !== null) {
      data.push(parseFloat(match[1]));
    }
    
    // データが見つからない場合、ダミーデータを返す
    if (data.length === 0) {
      return Array(samples).fill(0);
    }
    
    return data;
  }
  
  /**
   * メディアファイルをトリム
   * @param {string} filePath - メディアファイルのパス
   * @param {Object} options - トリムオプション
   * @returns {Promise<Object>} - トリム結果情報
   */
  async trimMedia(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`ファイルが存在しません: ${filePath}`);
    }
    
    const {
      startTime = 0,
      endTime = null,
      outputPath = null,
      format = 'mp4',
      preserveCodecs = true
    } = options;
    
    // 出力先の設定
    const tempDir = this.getWorkDir('temp');
    const outputFilePath = outputPath || path.join(
      tempDir,
      `${path.basename(filePath, path.extname(filePath))}_trimmed_${Date.now()}.${format}`
    );
    
    // コマンドライン引数の設定
    const args = [
      '-ss', formatTimeString(startTime)
    ];
    
    // 終了時間が指定されている場合
    if (endTime !== null) {
      args.push('-to', formatTimeString(endTime));
    }
    
    // 入力ファイルの指定
    args.push('-i', filePath);
    
    // コーデックのコピー設定
    if (preserveCodecs) {
      args.push('-c', 'copy');
    }
    
    // その他の出力設定
    args.push(
      '-avoid_negative_ts', '1',
      '-y', outputFilePath
    );
    
    const taskId = uuidv4();
    
    try {
      await this.taskManager.createTask(args, {
        taskId,
        type: 'trim',
        details: { 
          filePath, 
          startTime, 
          endTime, 
          outputPath: outputFilePath 
        }
      });
      
      // タスク情報を取得
      const task = this.taskManager.getTaskStatus(taskId);
      
      if (task.status === 'error') {
        throw new Error(`メディアトリムに失敗しました: ${task.error}`);
      }
      
      return {
        success: true,
        path: outputFilePath,
        startTime,
        endTime: endTime || null,
        duration: endTime ? (endTime - startTime) : null
      };
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * タスクのステータスを取得
   * @param {string} taskId - タスクID
   * @returns {Object|null} - タスク情報
   */
  getTaskStatus(taskId) {
    return this.taskManager.getTaskStatus(taskId);
  }
  
  /**
   * タスクをキャンセル
   * @param {string} taskId - タスクID
   * @returns {Promise<boolean>} - キャンセル結果
   */
  async cancelTask(taskId) {
    return this.taskManager.cancelTask(taskId);
  }
  
  /**
   * 全てのタスクをキャンセル
   * @returns {Promise<Array>} - キャンセル結果の配列
   */
  async cancelAllTasks() {
    return this.taskManager.cancelAllTasks();
  }
  
  /**
   * 実行中のタスク数を取得
   * @returns {number} - 実行中のタスク数
   */
  getActiveTaskCount() {
    return this.taskManager.getActiveTaskCount();
  }
  
  /**
   * すべてのタスク情報を取得
   * @returns {Array<Object>} - タスク情報の配列
   */
  getAllTasks() {
    return this.taskManager.getAllTasks();
  }
}

module.exports = FFmpegServiceCore;
