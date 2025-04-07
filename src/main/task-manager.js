/**
 * タスク管理システム
 * バックグラウンドでのFFmpegタスクやその他の非同期処理を管理し、
 * ステータスや進捗情報をレンダラープロセスに通知する
 */

const { EventEmitter } = require('events');
const { app } = require('electron');
const path = require('path');

// タスク管理クラス
class TaskManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map(); // タスク情報を格納するMap
    this.taskCounter = 0;   // タスクIDのカウンター
    
    // タスクの標準的な削除期間（ms）- 完了またはエラーから24時間後
    this.taskCleanupInterval = 1000 * 60 * 60 * 24;
    
    // 定期的なクリーンアップを設定（1時間ごと）
    this.cleanupInterval = setInterval(() => this.cleanupTasks(), 1000 * 60 * 60);
    
    // アプリ終了時にクリーンアップを実行
    app.on('will-quit', () => {
      clearInterval(this.cleanupInterval);
    });
  }
  
  /**
   * 新しいタスクを作成する
   * @param {Object} options タスクオプション
   * @param {string} options.type タスクの種類（waveform, loudness, thumbnailなど）
   * @param {string} [options.fileId] 関連するファイルID
   * @param {string} [options.fileName] ファイル名（表示用）
   * @param {boolean} [options.cancellable=true] キャンセル可能かどうか
   * @param {string} [options.details] 追加詳細情報
   * @returns {string} 作成されたタスクのID
   */
  createTask(options) {
    const taskId = `task_${Date.now()}_${this.taskCounter++}`;
    
    const newTask = {
      id: taskId,
      type: options.type,
      status: 'pending',
      progress: 0,
      startTime: Date.now(),
      fileId: options.fileId || null,
      fileName: options.fileName || null,
      cancellable: options.cancellable !== false,
      details: options.details || null,
      cleanupTime: null // クリーンアップ時間（null = クリーンアップ不要）
    };
    
    this.tasks.set(taskId, newTask);
    this.emitTasksUpdated();
    
    console.log(`タスク作成: [${taskId}] 種類: ${options.type}`);
    return taskId;
  }
  
  /**
   * タスクの状態を更新する
   * @param {string} taskId タスクID
   * @param {Object} updates 更新内容
   * @param {string} [updates.status] 新しい状態
   * @param {number} [updates.progress] 進捗率（0-100）
   * @param {string} [updates.error] エラーメッセージ
   * @param {string} [updates.details] 詳細情報
   * @returns {boolean} 更新が成功したかどうか
   */
  updateTask(taskId, updates) {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`存在しないタスク [${taskId}] の更新が試みられました`);
      return false;
    }
    
    // 状態が変更された場合の特別処理
    if (updates.status && updates.status !== task.status) {
      if (updates.status === 'completed' || updates.status === 'error' || updates.status === 'cancelled') {
        task.endTime = Date.now();
        // 完了したタスクは24時間後に削除
        task.cleanupTime = Date.now() + this.taskCleanupInterval;
      }
    }
    
    // オブジェクトを更新
    Object.assign(task, updates);
    
    // タスク更新イベントを発行
    this.emitTasksUpdated();
    
    console.log(`タスク更新: [${taskId}] ${updates.status ? '状態: ' + updates.status : ''} ${updates.progress !== undefined ? '進捗: ' + updates.progress + '%' : ''}`);
    return true;
  }
  
  /**
   * タスクをキャンセルする
   * @param {string} taskId タスクID
   * @returns {Object} 結果と潜在的なエラー
   */
  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`存在しないタスク [${taskId}] のキャンセルが試みられました`);
      return { success: false, error: 'タスクが見つかりません' };
    }
    
    if (!task.cancellable) {
      return { success: false, error: 'このタスクはキャンセルできません' };
    }
    
    if (task.status !== 'pending' && task.status !== 'processing') {
      return { success: false, error: 'このタスクは既に終了しています' };
    }
    
    // タスクをキャンセル状態に更新
    this.updateTask(taskId, { 
      status: 'cancelled',
      endTime: Date.now(),
      cleanupTime: Date.now() + this.taskCleanupInterval
    });
    
    // ここでFFmpegサービスへのキャンセルリクエストなど、外部リソースのクリーンアップも行う
    // タスクの種類に応じた特別なキャンセル処理
    this.emit('task-cancel-requested', taskId, task.type);
    
    console.log(`タスクキャンセル: [${taskId}]`);
    return { success: true };
  }
  
  /**
   * すべてのタスクを取得する
   * @returns {Array} タスク情報の配列（最新のものから順に）
   */
  getAllTasks() {
    const taskList = Array.from(this.tasks.values());
    
    // 開始時間の降順でソート（最新のものが先頭）
    return taskList.sort((a, b) => {
      // 実行中のタスクを常に上位に
      const aActive = a.status === 'pending' || a.status === 'processing';
      const bActive = b.status === 'pending' || b.status === 'processing';
      
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      
      // 同じステータスグループ内では開始時間で降順ソート
      return b.startTime - a.startTime;
    });
  }
  
  /**
   * タスクの情報を取得する
   * @param {string} taskId タスクID
   * @returns {Object|null} タスク情報、または存在しない場合はnull
   */
  getTaskById(taskId) {
    return this.tasks.get(taskId) || null;
  }
  
  /**
   * レンダラープロセスに送信するためのタスク状態サマリーを生成する
   * @returns {Object} タスク状態サマリー
   */
  getTasksSummary() {
    const tasks = this.getAllTasks();
    
    // アクティブなタスク数をカウント
    const activeTaskCount = tasks.filter(
      task => task.status === 'pending' || task.status === 'processing'
    ).length;
    
    // 全体の進捗率を計算
    const activeTasks = tasks.filter(
      task => task.status === 'pending' || task.status === 'processing'
    );
    
    let overallProgress = 0;
    if (activeTasks.length > 0) {
      // アクティブなタスクの平均進捗率
      overallProgress = activeTasks.reduce((sum, task) => sum + task.progress, 0) / activeTasks.length;
    } else if (tasks.length > 0 && tasks.some(task => task.status === 'completed')) {
      // アクティブなタスクがなく、少なくとも1つ完了しているなら100%
      overallProgress = 100;
    }
    
    return {
      tasks,
      activeTaskCount,
      overallProgress
    };
  }
  
  /**
   * タスク一覧の更新イベントを発行する
   */
  emitTasksUpdated() {
    this.emit('tasks-updated', this.getTasksSummary());
  }
  
  /**
   * 古いタスクをクリーンアップする
   */
  cleanupTasks() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.cleanupTime && now > task.cleanupTime) {
        this.tasks.delete(taskId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`クリーンアップ: ${cleanedCount}個の古いタスクを削除しました`);
      this.emitTasksUpdated();
    }
  }
}

// タスクマネージャーのシングルトンインスタンスをエクスポート
const taskManager = new TaskManager();
module.exports = taskManager;
