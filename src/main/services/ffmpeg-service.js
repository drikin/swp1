/**
 * FFmpegサービス
 * FFmpegを使用した処理を共通化するためのサービス
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const os = require('os');

class FFmpegService {
  constructor() {
    this.events = new EventEmitter();
    this.processes = new Map(); // タスクIDとFFmpegプロセスのマッピング
    
    // 新しい実装に移行するための内部インスタンス
    const { FFmpegServiceCore } = require('./ffmpeg');
    this._coreService = new FFmpegServiceCore();
    
    // イベント転送を設定
    this._forwardEvents();
    
    // 作業ディレクトリを初期化
    this.baseWorkDir = this._coreService.directories.base;
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
