/**
 * FFmpegサービス
 * FFmpegを使用した処理を共通化するためのサービス
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const os = require('os');
const express = require('express');
const cors = require('cors');

// デバッグ用ロギング
console.log('FFmpegサービス読み込み開始');

// ffmpgディレクトリの内容を確認
try {
  console.log('FFmpeg モジュールを検索中...');
  const ffmpegDir = path.join(__dirname, 'ffmpeg');
  const ffmpegFiles = fs.readdirSync(ffmpegDir);
  console.log('FFmpegディレクトリ内のファイル:', ffmpegFiles);
  
  // index.jsファイルの内容を確認
  const indexPath = path.join(ffmpegDir, 'index.js');
  if (fs.existsSync(indexPath)) {
    console.log('index.jsを読み込みます');
    try {
      const ffmpegModule = require('./ffmpeg/index');
      console.log('FFmpegモジュールのエクスポート:', Object.keys(ffmpegModule));
    } catch (importErr) {
      console.error('FFmpegモジュールのインポートエラー:', importErr);
    }
  }
} catch (err) {
  console.error('FFmpegディレクトリ読み込みエラー:', err);
}

class FFmpegService {
  constructor() {
    this.events = new EventEmitter();
    this.processes = new Map(); // タスクIDとFFmpegプロセスのマッピング
    
    try {
      // 新しい実装に移行するための内部インスタンス
      const ffmpegModule = require('./ffmpeg/index');
      console.log('FFmpegモジュールを正常に読み込みました');
      
      if (!ffmpegModule.FFmpegServiceCore) {
        throw new Error('FFmpegServiceCoreクラスが見つかりません');
      }
      
      const { FFmpegServiceCore } = ffmpegModule;
      this._coreService = new FFmpegServiceCore();
      
      // イベント転送を設定
      this._forwardEvents();
      
      // 作業ディレクトリを初期化
      this.baseWorkDir = this._coreService.directories.base;
      
      console.log('FFmpegServiceの初期化が完了しました');
    } catch (error) {
      console.error('FFmpegServiceの初期化エラー:', error);
      throw error; // エラーを再スロー
    }
  }

  /**
   * イベントの転送設定
   * @private
   */
  _forwardEvents() {
    this._coreService.on('progress', (taskId, task) => {
      this.events.emit('progress', taskId, task);
    });
    
    this._coreService.on('completed', (taskId, task) => {
      this.events.emit('completed', taskId, task);
    });
    
    this._coreService.on('error', (taskId, task) => {
      this.events.emit('error', taskId, task);
    });
    
    this._coreService.on('cancelled', (taskId, task) => {
      this.events.emit('cancelled', taskId, task);
    });
  }
  
  /**
   * 作業ディレクトリの初期化
   * @returns {string} - ベース作業ディレクトリのパス
   */
  _initializeWorkDirectories() {
    // 既存の実装は新しいコアサービスによって処理されるため、
    // 後方互換性のためにベースディレクトリを返すだけ
    return this.baseWorkDir;
  }
  
  /**
   * 特定のタイプの作業ディレクトリパスを取得
   * @param {string} type - ディレクトリタイプ ('waveform', 'thumbnails', 'temp', 'logs')
   * @returns {string} - 作業ディレクトリのパス
   */
  getWorkDir(type) {
    return this._coreService.getWorkDir(type);
  }

  /**
   * FFmpegのパスを取得
   * @returns {string} - FFmpegの実行パス
   * @throws {Error} - FFmpegのパスが設定されていない場合
   */
  _getFFmpegPath() {
    return this._coreService.utils.getFFmpegPath();
  }

  /**
   * 時間文字列をパース
   * @param {string} timeStr - hh:mm:ss.ms 形式の時間文字列
   * @returns {number} - 秒数
   */
  parseTimeString(timeStr) {
    return this._coreService.utils.parseTimeString(timeStr);
  }

  /**
   * 秒数を時間文字列に変換
   * @param {number} seconds - 秒数
   * @returns {string} - hh:mm:ss.ms 形式の時間文字列
   */
  formatTimeString(seconds) {
    return this._coreService.utils.formatTimeString(seconds);
  }

  /**
   * FFmpeg出力から進捗情報を抽出
   * @param {string} output - FFmpegの出力文字列
   * @returns {object|null} - 進捗情報またはnull
   */
  extractProgressInfo(output) {
    return this._coreService.utils.extractProgressInfo(output);
  }

  /**
   * メディアファイルの情報を取得
   * @param {string} filePath - メディアファイルのパス
   * @returns {Promise<Object>} - メディアファイルの情報
   */
  async getMediaInfo(filePath) {
    return this._coreService.getMediaInfo(filePath);
  }

  /**
   * サムネイルを生成
   * @param {string} filePath - メディアファイルのパス
   * @param {Object} options - サムネイル生成オプション
   * @returns {Promise<Object>} - サムネイル情報
   */
  async generateThumbnail(filePath, options = {}) {
    return this._coreService.generateThumbnail(filePath, options);
  }

  /**
   * 波形データを生成
   * @param {string} filePath - メディアファイルのパス
   * @param {Object} options - 波形生成オプション
   * @returns {Promise<Object>} - 波形データ情報
   */
  async generateWaveform(filePath, options = {}) {
    return this._coreService.generateWaveform(filePath, options);
  }

  /**
   * メディアファイルをトリム
   * @param {string} filePath - メディアファイルのパス
   * @param {Object} options - トリムオプション
   * @returns {Promise<Object>} - トリム結果情報
   */
  async trimMedia(filePath, options = {}) {
    return this._coreService.trimMedia(filePath, options);
  }

  /**
   * タスクのステータスを取得
   * @param {string} taskId - タスクID
   * @returns {Object|null} - タスク情報
   */
  getTaskStatus(taskId) {
    return this._coreService.getTaskStatus(taskId);
  }

  /**
   * タスクをキャンセル
   * @param {string} taskId - タスクID
   * @returns {Promise<boolean>} - キャンセル結果
   */
  async cancelTask(taskId) {
    return this._coreService.cancelTask(taskId);
  }

  /**
   * 全てのタスクをキャンセル
   * @returns {Promise<Array>} - キャンセル結果の配列
   */
  async cancelAllTasks() {
    return this._coreService.cancelAllTasks();
  }

  /**
   * 実行中のタスク数を取得
   * @returns {number} - 実行中のタスク数
   */
  getActiveTaskCount() {
    return this._coreService.getActiveTaskCount();
  }

  /**
   * すべてのタスク情報を取得
   * @returns {Array<Object>} - タスク情報の配列
   */
  getAllTasks() {
    return this._coreService.getAllTasks();
  }

  /**
   * イベントリスナーを登録
   * @param {string} event - イベント名
   * @param {Function} listener - リスナー関数
   */
  on(event, listener) {
    this.events.on(event, listener);
    return this;
  }

  /**
   * イベントリスナーを解除
   * @param {string} event - イベント名
   * @param {Function} listener - リスナー関数
   */
  off(event, listener) {
    this.events.off(event, listener);
    return this;
  }

  /**
   * イベントを発行
   * @param {string} event - イベント名
   * @param {...any} args - イベント引数
   */
  emit(event, ...args) {
    this.events.emit(event, ...args);
    return this;
  }
}

// FFmpegServiceのシングルトンインスタンス
let instance = null;

/**
 * FFmpegServiceのシングルトンインスタンスを取得
 * @returns {FFmpegService} - FFmpegServiceのインスタンス
 */
function getFFmpegService() {
  if (!instance) {
    instance = new FFmpegService();
  }
  return instance;
}

module.exports = getFFmpegService();
module.exports.FFmpegService = FFmpegService;

// スタンドアロンプロセスとして実行する場合のみサーバーを起動
if (require.main === module) {
  // Expressアプリケーションの初期化
  const app = express();
  const port = process.env.FFMPEG_SERVICE_PORT || 3001;
  
  // CORSを有効化
  app.use(cors());
  app.use(express.json());
  
  // サービスインスタンスの取得
  const ffmpegService = getFFmpegService();
  
  // ヘルスチェックエンドポイント
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  // FFmpegプロセス実行エンドポイント
  app.post('/process', async (req, res) => {
    try {
      const { taskId, args, outputFormat, timeout } = req.body;
      
      if (!args || !Array.isArray(args)) {
        return res.status(400).json({ error: '無効なパラメータです' });
      }
      
      // タスクの実行
      const task = await ffmpegService.taskManager.createTask({
        type: 'ffmpeg',
        args: args,
        outputFormat,
        timeout
      });
      
      res.json({ success: true, taskId: task.id });
    } catch (error) {
      console.error('プロセス実行エラー:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // タスク状態取得エンドポイント
  app.get('/status/:taskId', async (req, res) => {
    try {
      const taskId = req.params.taskId;
      const status = ffmpegService.getTaskStatus(taskId);
      
      if (!status) {
        return res.status(404).json({ error: 'タスクが見つかりません' });
      }
      
      res.json(status);
    } catch (error) {
      console.error('タスク状態取得エラー:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // タスクキャンセルエンドポイント
  app.post('/cancel/:taskId', async (req, res) => {
    try {
      const taskId = req.params.taskId;
      const result = await ffmpegService.cancelTask(taskId);
      
      res.json({ success: result });
    } catch (error) {
      console.error('タスクキャンセルエラー:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // サーバーシャットダウンエンドポイント
  app.post('/shutdown', async (req, res) => {
    console.log('シャットダウンリクエストを受信しました');
    
    try {
      // 実行中のすべてのタスクをキャンセル
      await ffmpegService.cancelAllTasks();
      
      // 応答を返す
      res.json({ success: true, message: 'サーバーをシャットダウンします' });
      
      // サーバーを少し遅れてシャットダウン
      setTimeout(() => {
        console.log('FFmpegサービスを終了します');
        process.exit(0);
      }, 500);
    } catch (error) {
      console.error('シャットダウンエラー:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // サーバーの起動
  const server = app.listen(port, () => {
    console.log(`FFmpegサービスがポート${port}で起動しました`);
  });
  
  // 例外ハンドリング
  process.on('uncaughtException', (error) => {
    console.error('予期しない例外が発生しました:', error);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('未処理のPromise拒否が発生しました:', reason);
  });
}
