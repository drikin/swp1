/**
 * FFmpegタスク管理モジュール
 * FFmpegプロセスの管理と進捗追跡を担当
 */
const { spawn } = require('child_process');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const { extractProgressInfo, getFFmpegPath } = require('./utils');

class FFmpegTaskManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map(); // タスクID -> タスク情報のマップ
    this.processes = new Map(); // タスクID -> FFmpegプロセスのマップ
  }

  /**
   * 新しいFFmpegタスクを作成して実行
   * @param {string[]} args - FFmpegコマンドの引数配列
   * @param {Object} options - タスクオプション
   * @returns {Promise<Object>} - タスク情報
   */
  async createTask(args, options = {}) {
    // タスクID生成
    const taskId = options.taskId || uuidv4();
    
    // タスク情報を初期化
    const task = {
      id: taskId,
      type: options.type || 'ffmpeg',
      status: 'pending',
      args,
      startTime: Date.now(),
      progress: 0,
      stdout: '',
      stderr: '',
      details: options.details || {},
      options
    };
    
    // タスクをマップに保存
    this.tasks.set(taskId, task);
    
    try {
      // FFmpegプロセスを開始
      await this._startProcess(taskId, args);
      return { success: true, taskId };
    } catch (error) {
      // エラー時の処理
      task.status = 'error';
      task.error = error.message;
      this.tasks.set(taskId, task);
      throw error;
    }
  }

  /**
   * FFmpegプロセスを起動して監視
   * @param {string} taskId - タスクID
   * @param {string[]} args - FFmpegコマンドの引数配列
   * @returns {Promise<void>}
   * @private
   */
  async _startProcess(taskId, args) {
    // タスク情報を取得
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`タスク ${taskId} が見つかりません`);
    }
    
    // FFmpegのパスを取得
    const ffmpegPath = getFFmpegPath();
    
    // FFmpegプロセスを起動
    task.status = 'processing';
    this.tasks.set(taskId, task);
    
    // コマンドの詳細ログ出力
    console.log(`[FFmpegTaskManager] タスク ${taskId} 実行コマンド: ${ffmpegPath} ${args.join(' ')}`);
    
    return new Promise((resolve, reject) => {
      try {
        // FFmpegプロセスを作成して起動
        const process = spawn(ffmpegPath, args);
        this.processes.set(taskId, process);
        
        // 標準出力を処理
        process.stdout.on('data', (data) => {
          task.stdout += data.toString();
          this.tasks.set(taskId, task);
        });
        
        // 標準エラー出力を処理
        process.stderr.on('data', (data) => {
          const output = data.toString();
          task.stderr += output;
          
          // 進捗情報の抽出と更新
          const progressInfo = extractProgressInfo(output);
          if (progressInfo) {
            task.progress = progressInfo.progress;
            task.details.currentTime = progressInfo.currentTime;
            task.details.duration = progressInfo.duration;
            this.tasks.set(taskId, task);
            
            // 進捗イベントを発行
            this.emit('progress', taskId, task);
          }
        });
        
        // プロセスが終了したときの処理
        process.on('close', (code) => {
          // プロセスの参照を削除
          this.processes.delete(taskId);
          
          if (code === 0) {
            // 成功時の処理
            task.status = 'completed';
            task.progress = 100;
            task.endTime = Date.now();
            this.tasks.set(taskId, task);
            
            // 完了イベントを発行
            this.emit('completed', taskId, task);
            resolve();
          } else {
            // エラー時の処理
            task.status = 'error';
            task.error = `FFmpeg process exited with code ${code}`;
            task.endTime = Date.now();
            this.tasks.set(taskId, task);
            
            // エラーイベントを発行
            this.emit('error', taskId, task);
            reject(new Error(`FFmpeg process exited with code ${code}`));
          }
        });
        
        // プロセスエラー時の処理
        process.on('error', (err) => {
          task.status = 'error';
          task.error = err.message;
          task.endTime = Date.now();
          this.tasks.set(taskId, task);
          
          // プロセスの参照を削除
          this.processes.delete(taskId);
          
          // エラーイベントを発行
          this.emit('error', taskId, task);
          reject(err);
        });
        
      } catch (error) {
        // プロセス起動時のエラー処理
        task.status = 'error';
        task.error = error.message;
        task.endTime = Date.now();
        this.tasks.set(taskId, task);
        
        reject(error);
      }
    });
  }

  /**
   * タスクをキャンセル
   * @param {string} taskId - タスクID
   * @returns {Promise<boolean>} - キャンセル結果
   */
  async cancelTask(taskId) {
    // タスク情報を取得
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`タスク ${taskId} が見つかりません`);
    }
    
    // プロセスを取得
    const process = this.processes.get(taskId);
    if (!process) {
      return false; // プロセスが既に終了している場合
    }
    
    // プロセスを終了
    try {
      process.kill('SIGTERM');
      
      // タスク情報を更新
      task.status = 'cancelled';
      task.endTime = Date.now();
      this.tasks.set(taskId, task);
      
      // プロセスの参照を削除
      this.processes.delete(taskId);
      
      // キャンセルイベントを発行
      this.emit('cancelled', taskId, task);
      
      return true;
    } catch (error) {
      console.error(`タスク ${taskId} のキャンセル中にエラーが発生しました:`, error);
      return false;
    }
  }

  /**
   * タスクのステータスを取得
   * @param {string} taskId - タスクID
   * @returns {Object|null} - タスク情報
   */
  getTaskStatus(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    
    // 戻り値用にタスクオブジェクトをコピー
    return {
      id: task.id,
      type: task.type,
      status: task.status,
      progress: task.progress,
      error: task.error,
      details: task.details,
      startTime: task.startTime,
      endTime: task.endTime,
      stdout: task.stdout,
      stderr: task.stderr
    };
  }

  /**
   * 全てのアクティブなタスクをキャンセル
   * @returns {Promise<Array>} - キャンセル結果の配列
   */
  async cancelAllTasks() {
    const taskIds = Array.from(this.processes.keys());
    const results = [];
    
    for (const taskId of taskIds) {
      try {
        const result = await this.cancelTask(taskId);
        results.push({ taskId, success: result });
      } catch (error) {
        results.push({ taskId, success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * 実行中のタスク数を取得
   * @returns {number} - 実行中のタスク数
   */
  getActiveTaskCount() {
    return this.processes.size;
  }

  /**
   * すべてのタスク情報を取得
   * @returns {Array<Object>} - タスク情報の配列
   */
  getAllTasks() {
    return Array.from(this.tasks.values());
  }
}

module.exports = FFmpegTaskManager;
