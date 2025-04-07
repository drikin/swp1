/**
 * ベースタスククラス
 * すべてのタスクタイプの基底クラスとして機能します
 */
const EventEmitter = require('events');

class BaseTask {
  constructor(params = {}) {
    this.id = params.id || `task_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    this.type = 'base';
    this.status = params.status || 'pending';
    this.progress = params.progress || 0;
    this.mediaPath = params.mediaPath || null;
    this.startTime = params.startTime || null;
    this.endTime = params.endTime || null;
    this.data = params.data || null;
    this.error = params.error || null;
    this.details = params.details || null;
    this.cancellable = true;
    this.events = new EventEmitter();
    
    // リトライ関連
    this.retryCount = params.retryCount || 0;
    this.maxRetries = params.maxRetries || 3;
    
    // 優先度設定
    this.priority = params.priority || 'NORMAL'; // 'HIGH', 'NORMAL', 'LOW'
    
    // メタデータ
    this.metadata = params.metadata || {};
    
    // 依存関係
    this.dependencies = params.dependencies || [];
    
    // ファイル名（表示用）
    this.fileName = params.fileName || this._extractFileName();
  }

  /**
   * メディアパスからファイル名を抽出
   * @private
   * @returns {string|null} ファイル名
   */
  _extractFileName() {
    if (!this.mediaPath) return null;
    
    try {
      const path = require('path');
      // mediaPathがオブジェクトの場合はpathプロパティを使用
      const filePath = typeof this.mediaPath === 'object' && this.mediaPath.path 
        ? this.mediaPath.path 
        : this.mediaPath;
        
      // ファイルパスが文字列であることを確認
      if (typeof filePath !== 'string') {
        console.warn('ファイルパスが文字列ではありません:', filePath);
        return String(filePath);
      }
        
      return path.basename(filePath);
    } catch (error) {
      console.error('ファイル名抽出エラー:', error);
      return null;
    }
  }

  /**
   * 進捗を更新
   * @param {number} progress - 0-100の進捗値
   * @param {object} details - 追加の詳細情報
   */
  updateProgress(progress, details = null) {
    this.progress = progress;
    if (details) {
      this.details = details;
    }
    this.events.emit('progress', this.progress, this.details);
    return this;
  }

  /**
   * タスク開始
   */
  start() {
    this.status = 'processing';
    this.startTime = Date.now();
    this.events.emit('started', this);
    return this;
  }

  /**
   * タスク完了
   * @param {any} data - タスク結果データ
   */
  complete(data) {
    this.status = 'completed';
    this.progress = 100;
    this.endTime = Date.now();
    this.data = data;
    this.events.emit('completed', this);
    return this;
  }

  /**
   * エラー発生
   * @param {Error|string} error - エラー情報
   */
  fail(error) {
    this.status = 'error';
    this.endTime = Date.now();
    this.error = error instanceof Error ? error.message : error;
    this.events.emit('failed', this, this.error);
    return this;
  }

  /**
   * リトライ準備
   * @param {number} retryCount - リトライ回数
   */
  prepareRetry(retryCount) {
    this.status = 'retry_pending';
    this.retryCount = retryCount;
    this.events.emit('retry_pending', this, retryCount);
    return this;
  }

  /**
   * タスクキャンセル
   * @returns {boolean} キャンセル成功の場合true
   */
  cancel() {
    if (!this.cancellable || 
        (this.status !== 'processing' && 
         this.status !== 'pending' && 
         this.status !== 'retry_pending')) {
      return false;
    }
    
    this.status = 'cancelled';
    this.endTime = Date.now();
    this.events.emit('cancelled', this);
    return true;
  }

  /**
   * タスクの一時停止
   * @returns {boolean} 一時停止成功の場合true
   */
  pause() {
    if (this.status !== 'processing') {
      return false;
    }
    
    this.status = 'paused';
    this.events.emit('paused', this);
    return true;
  }

  /**
   * 一時停止からの再開
   * @returns {boolean} 再開成功の場合true
   */
  resume() {
    if (this.status !== 'paused') {
      return false;
    }
    
    this.status = 'processing';
    this.events.emit('resumed', this);
    return true;
  }

  /**
   * メタデータの設定
   * @param {string} key - メタデータキー
   * @param {any} value - メタデータ値
   */
  setMetadata(key, value) {
    this.metadata[key] = value;
    return this;
  }

  /**
   * メタデータの取得
   * @param {string} key - メタデータキー
   * @param {any} defaultValue - デフォルト値
   * @returns {any} メタデータ値
   */
  getMetadata(key, defaultValue = null) {
    return key in this.metadata ? this.metadata[key] : defaultValue;
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

  /**
   * タスク実行メソッド（サブクラスでオーバーライド）
   * @returns {Promise<any>} 
   */
  async execute() {
    throw new Error('サブクラスで実装する必要があります');
  }

  /**
   * JSON変換用
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      progress: this.progress,
      mediaPath: this.mediaPath,
      fileName: this.fileName,
      startTime: this.startTime,
      endTime: this.endTime,
      error: this.error,
      details: this.details,
      cancellable: this.cancellable,
      priority: this.priority,
      retryCount: this.retryCount,
      dependencies: this.dependencies,
      metadata: this.metadata
    };
  }
}

module.exports = BaseTask;
