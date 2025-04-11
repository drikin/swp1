/**
 * タスク管理システム
 * タスクの作成・実行・監視を担当するクラス
 */
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class TaskManager {
  constructor(registry) {
    this.registry = registry;
    this.tasks = new Map(); // タスクIDからタスクインスタンスへのマップ
    this.mainWindow = null; // メインウィンドウの参照
    this.eventEmitter = new EventEmitter();
    
    // タスクキュー
    this.taskQueue = [];
    this.concurrentTasks = 0;
    this.maxConcurrentTasks = 3; // 同時に実行するタスクの最大数
    this.processing = false;
    
    // 依存関係管理
    this.taskDependencies = new Map(); // タスクIDから依存タスクIDリストへのマップ
    this.taskChildren = new Map(); // タスクIDから子タスクIDリストへのマップ
    
    // リトライ設定
    this.maxRetries = 3; // 最大リトライ回数
    this.retryDelays = [1000, 5000, 15000]; // リトライ間隔（ミリ秒）
    this.taskRetryCount = new Map(); // タスクIDからリトライ回数へのマップ

    // 優先度キュー
    this.priorityLevels = {
      HIGH: 0,
      NORMAL: 1,
      LOW: 2
    };
    
    // タスク状態の自動保存設定
    this.storageDir = path.join(app.getPath('userData'), 'tasks');
    this.storageFile = path.join(this.storageDir, 'task-state.json');
    this.autoSaveInterval = 30000; // 30秒ごと
    this.autoSaveTimer = null;
    
    // ストレージディレクトリの確認
    this._ensureStorageDir();
    
    // 前回のタスク状態を読み込み
    this._loadTasks();
    
    // 自動保存を開始
    this._startAutoSave();
  }

  /**
   * メインウィンドウの参照を設定
   * @param {BrowserWindow} window - Electronのウィンドウオブジェクト
   */
  setMainWindow(window) {
    this.mainWindow = window;
  }

  /**
   * 新しいタスクを作成
   * @param {object} params - タスク作成パラメータ
   * @param {string} params.type - タスクタイプ
   * @param {string} params.mediaPath - メディアパス
   * @param {string[]} [params.dependsOn] - 依存するタスクIDの配列
   * @param {string} [params.priority] - タスク優先度（HIGH/NORMAL/LOW）
   * @param {object} params.options - その他のオプション
   * @returns {string} - 作成されたタスクのID
   */
  createTask(params) {
    const { type, dependsOn = [], priority = 'NORMAL', ...taskParams } = params;
    
    // タイプの存在確認
    if (!this.registry.hasTaskType(type)) {
      throw new Error(`未登録のタスク種類です: ${type}`);
    }

    // 優先度の検証
    if (!Object.keys(this.priorityLevels).includes(priority)) {
      console.warn(`無効な優先度指定: ${priority}, デフォルト'NORMAL'を使用します`);
      taskParams.priority = 'NORMAL';
    } else {
      taskParams.priority = priority;
    }
    
    // タスク作成
    const task = this.registry.createTask(type, taskParams);
    this.tasks.set(task.id, task);
    
    // リトライカウンタ初期化
    this.taskRetryCount.set(task.id, 0);
    
    // 依存関係の設定
    if (dependsOn && dependsOn.length > 0) {
      this.taskDependencies.set(task.id, [...dependsOn]);
      
      // 子タスク関係を更新
      dependsOn.forEach(parentId => {
        if (!this.taskChildren.has(parentId)) {
          this.taskChildren.set(parentId, []);
        }
        this.taskChildren.get(parentId).push(task.id);
      });
      
      // 依存タスクが全て完了しているか確認
      const canRun = this._checkDependencies(task.id);
      if (!canRun) {
        // 依存タスクが未完了なら、タスクはpending状態を維持
        console.log(`タスク ${task.id} は依存関係が解決するまで待機します`);
      }
    }
    
    // イベントリスナー設定
    task.on('progress', (progress, details) => {
      this.emitTasksUpdated();
    });
    
    task.on('completed', (task) => {
      this._processTaskCompletion(task);
      this.emitTasksUpdated();
    });
    
    task.on('failed', (task, error) => {
      console.error(`タスク失敗 [${task.id}]: ${error}`);
      
      // リトライ処理
      const retryCount = this.taskRetryCount.get(task.id) || 0;
      if (retryCount < this.maxRetries) {
        const nextRetry = retryCount + 1;
        const delay = this.retryDelays[retryCount] || 30000; // デフォルト30秒
        
        console.log(`タスク [${task.id}] を ${delay}ms 後にリトライします (${nextRetry}/${this.maxRetries})`);
        
        this.taskRetryCount.set(task.id, nextRetry);
        task.status = 'retry_pending';
        
        setTimeout(() => {
          if (this.tasks.has(task.id) && task.status === 'retry_pending') {
            console.log(`タスク [${task.id}] リトライを開始します`);
            task.status = 'pending';
            this.taskQueue.push(task.id);
            
            // キュー処理を開始
            if (!this.processing) {
              this._processQueue();
            }
          }
        }, delay);
      } else {
        console.error(`タスク [${task.id}] は最大リトライ回数(${this.maxRetries})に達しました`);
      }
      
      this.emitTasksUpdated();
    });
    
    task.on('cancelled', () => {
      this.emitTasksUpdated();

      // 依存していた子タスクをキャンセル
      if (this.taskChildren.has(task.id)) {
        const children = this.taskChildren.get(task.id);
        children.forEach(childId => {
          const childTask = this.tasks.get(childId);
          if (childTask && (childTask.status === 'pending' || childTask.status === 'retry_pending')) {
            console.log(`依存タスクのキャンセルにより子タスク [${childId}] をキャンセルします`);
            this.cancelTask(childId);
          }
        });
      }
    });
    
    // キューに追加（依存関係がない場合のみ）
    if (!dependsOn || dependsOn.length === 0 || this._checkDependencies(task.id)) {
      this._addToQueue(task.id, priority);
    }
    
    // イベント発行
    this.emitTasksUpdated();
    this.eventEmitter.emit('task-created', task);
    
    return task.id;
  }

  /**
   * 優先度に基づいてタスクをキューに追加
   * @param {string} taskId - タスクID
   * @param {string} priority - 優先度
   * @private
   */
  _addToQueue(taskId, priority = 'NORMAL') {
    const priorityLevel = this.priorityLevels[priority] !== undefined 
      ? this.priorityLevels[priority] 
      : this.priorityLevels.NORMAL;
    
    // 適切な位置を見つけてキューに挿入
    let inserted = false;
    for (let i = 0; i < this.taskQueue.length; i++) {
      const queuedTaskId = this.taskQueue[i];
      const queuedTask = this.tasks.get(queuedTaskId);
      
      if (!queuedTask) continue;
      
      const queuedPriority = queuedTask.priority || 'NORMAL';
      const queuedLevel = this.priorityLevels[queuedPriority] !== undefined 
        ? this.priorityLevels[queuedPriority] 
        : this.priorityLevels.NORMAL;
      
      if (priorityLevel < queuedLevel) {
        // より優先度が高いので、この位置に挿入
        this.taskQueue.splice(i, 0, taskId);
        inserted = true;
        break;
      }
    }
    
    // 優先度が低いか同じなら、末尾に追加
    if (!inserted) {
      this.taskQueue.push(taskId);
    }
    
    // キュー処理を開始
    if (!this.processing) {
      this._processQueue();
    }
  }

  /**
   * タスクの依存関係を確認
   * @param {string} taskId - 確認するタスクのID
   * @returns {boolean} 実行可能ならtrue
   * @private
   */
  _checkDependencies(taskId) {
    if (!this.taskDependencies.has(taskId)) {
      return true; // 依存関係なし
    }
    
    const dependencies = this.taskDependencies.get(taskId);
    
    // 全ての依存タスクが完了しているか確認
    for (const depId of dependencies) {
      const depTask = this.tasks.get(depId);
      
      if (!depTask || depTask.status !== 'completed') {
        return false; // 未完了の依存タスクあり
      }
    }
    
    return true; // 全ての依存タスクが完了
  }

  /**
   * タスクキューの処理
   * @private
   */
  async _processQueue() {
    if (this.processing) return;
    
    this.processing = true;
    
    try {
      // キューにタスクがあり、同時実行数に余裕がある限り処理
      while (this.taskQueue.length > 0 && this.concurrentTasks < this.maxConcurrentTasks) {
        const taskId = this.taskQueue.shift();
        const task = this.tasks.get(taskId);
        
        if (!task) continue;
        
        // 依存関係をチェック
        if (!this._checkDependencies(taskId)) {
          // 依存タスクが未完了の場合は後ろに戻す
          console.log(`タスク [${taskId}] の依存関係が未解決、キューの最後尾に移動します`);
          this.taskQueue.push(taskId);
          continue;
        }
        
        // 同時実行数のカウントを増やす
        this.concurrentTasks++;
        
        // 非同期でタスク実行
        this._executeTask(taskId).finally(() => {
          // 実行完了後、同時実行数のカウントを減らす
          this.concurrentTasks--;
          
          // キューが空でなければ再度処理を試みる
          if (this.taskQueue.length > 0) {
            this._processQueue();
          }
        });
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * 単一タスクの実行
   * @param {string} taskId - 実行するタスクのID
   * @private
   */
  async _executeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    console.log(`タスク実行開始 [${taskId}] タイプ:${task.type}`);
    
    // タスク開始
    task.start();
    this.emitTasksUpdated();
    
    try {
      // タスク実行
      const result = await task.execute();
      console.log(`タスク実行完了 [${taskId}]`);
      return result;
    } catch (error) {
      console.error(`タスク実行エラー [${taskId}]:`, error);
      task.fail(error);
      return null;
    }
  }

  /**
   * タスク完了時の処理
   * @param {BaseTask} task - 完了したタスク
   * @private
   */
  _processTaskCompletion(task) {
    console.log(`タスク完了処理 [${task.id}]`);
    
    // 依存していた子タスクを実行可能にする
    if (this.taskChildren.has(task.id)) {
      const children = this.taskChildren.get(task.id);
      
      children.forEach(childId => {
        const childTask = this.tasks.get(childId);
        if (!childTask) return;
        
        // 子タスクの依存関係を確認
        if (this._checkDependencies(childId) && childTask.status === 'pending') {
          console.log(`依存タスク完了により子タスク [${childId}] を実行キューに追加します`);
          const priority = childTask.priority || 'NORMAL';
          this._addToQueue(childId, priority);
        }
      });
    }
    
    // タスク結果処理
    try {
      this.registry.handleTaskResult(task);
    } catch (error) {
      console.error(`タスク結果処理エラー [${task.id}]:`, error);
    }
  }

  /**
   * ID指定でタスクを取得
   * @param {string} taskId - タスクID
   * @returns {BaseTask|undefined} - タスクインスタンス
   */
  getTaskById(taskId) {
    return this.tasks.get(taskId);
  }

  /**
   * すべてのタスクを取得
   * @returns {BaseTask[]} - タスクの配列
   */
  getTasks() {
    return Array.from(this.tasks.values());
  }

  /**
   * すべてのタスクを取得 (getTasks()のエイリアス)
   * @returns {BaseTask[]} - タスクの配列
   */
  getAllTasks() {
    return this.getTasks();
  }

  /**
   * メディアパスに関連するタスクを検索
   * @param {string} mediaPath - メディアのパス
   * @param {string|null} type - タスクタイプ（省略可）
   * @returns {BaseTask[]} - 該当するタスクの配列
   */
  getTasksByMedia(mediaPath, type = null) {
    return this.getTasks().filter(task => {
      if (task.mediaPath !== mediaPath) return false;
      if (type && task.type !== type) return false;
      return true;
    });
  }

  /**
   * 特定の種類のタスクを検索
   * @param {string} type - タスクタイプ
   * @returns {BaseTask[]} - 該当するタスクの配列
   */
  getTasksByType(type) {
    return this.getTasks().filter(task => task.type === type);
  }

  /**
   * タスクのキャンセル
   * @param {string} taskId - キャンセルするタスクのID
   * @returns {object} - 処理結果
   */
  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { 
        success: false, 
        error: 'タスクが見つかりません' 
      };
    }
    
    // キューから削除（処理前の場合）
    const queueIndex = this.taskQueue.indexOf(taskId);
    if (queueIndex >= 0) {
      this.taskQueue.splice(queueIndex, 1);
      task.status = 'cancelled';
      task.events.emit('cancelled', task);
      
      console.log(`キュー内のタスク [${taskId}] をキャンセルしました`);
      
      return {
        success: true,
        message: 'タスクをキャンセルしました'
      };
    }
    
    // 処理中ならタスク自体のキャンセル処理を呼び出す
    if (task.status === 'processing') {
      const cancelled = task.cancel();
      
      if (cancelled) {
        console.log(`実行中のタスク [${taskId}] をキャンセルしました`);
        return {
          success: true,
          message: 'タスクをキャンセルしました'
        };
      } else {
        return {
          success: false,
          error: 'タスクのキャンセルに失敗しました'
        };
      }
    }
    
    // 既に完了・失敗・キャンセル済みの場合
    return {
      success: false,
      error: `タスクは既に ${task.status} 状態です`
    };
  }

  /**
   * タスクを強制的に完了状態にする
   * メインプロセス再起動時などに使用
   * @param {string} taskId - タスクID
   * @param {object} updates - 更新するプロパティ
   * @returns {boolean} - 成功したらtrue
   */
  forceCompleteTask(taskId, updates = {}) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    
    // タスクを完了状態に更新
    Object.assign(task, {
      status: 'completed',
      progress: 100, 
      endTime: Date.now(),
      ...updates
    });
    
    // タスク完了イベント発行
    this.emitTasksUpdated();
    
    return true;
  }

  /**
   * 一括タスク作成処理
   * 複数の関連タスクを一度に作成し、依存関係を設定します
   * @param {object[]} taskConfigs - タスク設定オブジェクトの配列
   * @returns {string[]} - 作成されたタスクIDの配列
   */
  createTaskBatch(taskConfigs) {
    if (!Array.isArray(taskConfigs) || taskConfigs.length === 0) {
      throw new Error('有効なタスク設定が指定されていません');
    }
    
    // 作成したタスクIDを記録
    const createdTasks = [];
    const idMapping = new Map(); // 設定時の仮IDから実際のタスクIDへのマッピング
    
    // 第1パス: タスクを作成し、実際のIDを取得
    taskConfigs.forEach((config, index) => {
      const { id: tempId, dependsOn, ...taskParams } = config;
      
      // タスク作成（依存関係は次のパスで設定）
      const actualId = this.createTask({
        ...taskParams,
        dependsOn: [] // 一時的に空の依存関係
      });
      
      // マッピングを保存
      if (tempId) {
        idMapping.set(tempId, actualId);
      } else {
        idMapping.set(`temp_${index}`, actualId);
      }
      
      createdTasks.push(actualId);
    });
    
    // 第2パス: 依存関係を設定
    taskConfigs.forEach((config, index) => {
      const { id: tempId, dependsOn } = config;
      
      if (!dependsOn || !Array.isArray(dependsOn) || dependsOn.length === 0) {
        return; // 依存関係なし
      }
      
      // 現在のタスクの実際のIDを取得
      const currentId = idMapping.get(tempId || `temp_${index}`);
      if (!currentId) return;
      
      // 依存関係のIDを実際のIDに変換
      const actualDependencies = dependsOn
        .map(depId => idMapping.get(depId))
        .filter(id => id); // undefined/nullを除外
      
      if (actualDependencies.length === 0) return;
      
      // 依存関係を設定
      this.taskDependencies.set(currentId, actualDependencies);
      
      // 子タスク関係を更新
      actualDependencies.forEach(parentId => {
        if (!this.taskChildren.has(parentId)) {
          this.taskChildren.set(parentId, []);
        }
        this.taskChildren.get(parentId).push(currentId);
      });
      
      // 依存タスクが全て完了しているか確認し、完了していれば実行キューに追加
      if (this._checkDependencies(currentId)) {
        const task = this.tasks.get(currentId);
        if (task && task.status === 'pending') {
          const priority = task.priority || 'NORMAL';
          this._addToQueue(currentId, priority);
        }
      }
    });
    
    // イベント発行
    this.emitTasksUpdated();
    
    return createdTasks;
  }

  /**
   * 更新イベントの発行
   */
  emitTasksUpdated() {
    const tasks = this.getTasks();
    
    // タスクデータをシリアライズ可能な形式に変換
    const serializedTasks = tasks.map(t => t.toJSON());
    
    // タスク概要データを作成
    const taskSummary = {
      tasks: serializedTasks,
      activeTaskCount: tasks.filter(t => 
        t.status === 'pending' || t.status === 'processing' || t.status === 'retry_pending'
      ).length
    };
    
    // メインウィンドウにイベント送信
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.webContents.send('tasks-updated', taskSummary);
      } catch (error) {
        console.error('タスク更新イベント送信エラー:', error);
      }
    }
    
    // イベントエミッターでも発行（シリアライズ済みデータを使用）
    this.eventEmitter.emit('tasks-updated', taskSummary);
    
    return this;
  }

  /**
   * ストレージディレクトリ確認
   * @private
   */
  _ensureStorageDir() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (error) {
      console.error('ストレージディレクトリ作成エラー:', error);
    }
  }

  /**
   * タスク状態の保存
   * @private
   */
  async _saveTasks() {
    try {
      const tasksToSave = this.getTasks()
        .filter(t => t.status === 'completed')
        .map(t => t.toJSON());
      
      fs.writeFileSync(
        this.storageFile, 
        JSON.stringify(tasksToSave, null, 2), 
        'utf8'
      );
      
      console.log(`${tasksToSave.length} 件のタスク状態を保存しました`);
    } catch (error) {
      console.error('タスク状態の保存に失敗:', error);
    }
  }

  /**
   * タスク状態の読み込み
   * @private
   */
  async _loadTasks() {
    try {
      if (!fs.existsSync(this.storageFile)) {
        return;
      }
      
      const data = fs.readFileSync(this.storageFile, 'utf8');
      const savedTasks = JSON.parse(data);
      
      if (Array.isArray(savedTasks) && savedTasks.length > 0) {
        // 保存されたタスクをメモリに復元
        savedTasks.forEach(taskData => {
          if (this.registry.hasTaskType(taskData.type)) {
            try {
              const task = this.registry.createTask(taskData.type, taskData);
              Object.assign(task, taskData);
              this.tasks.set(task.id, task);
            } catch (err) {
              console.warn(`タスク復元エラー (${taskData.id}):`, err);
            }
          }
        });
        
        console.log(`${savedTasks.length} 件のタスクを読み込みました`);
        this.emitTasksUpdated();
      }
    } catch (error) {
      console.error('タスク状態の読み込みに失敗:', error);
    }
  }

  /**
   * 自動保存を開始
   * @private
   */
  _startAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setInterval(() => {
      this._saveTasks();
    }, this.autoSaveInterval);
  }

  /**
   * アプリケーション終了時の全クリーンアップ処理
   * 実行中のすべてのタスクを終了し、状態を保存する
   * @returns {Promise<void>}
   */
  async cleanupAll() {
    console.log('タスクマネージャーの終了処理を開始...');
    
    // 自動保存タイマーを停止
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    
    // 実行中のタスクをすべてキャンセル
    const runningTasks = this.getTasks().filter(task => 
      task.status === 'processing' || task.status === 'pending' || task.status === 'retry_pending'
    );
    
    console.log(`${runningTasks.length}件の実行中タスクを終了します`);
    
    const cancelPromises = runningTasks.map(task => {
      return this.cancelTask(task.id).catch(err => {
        console.error(`タスク ${task.id} のキャンセル中にエラー:`, err);
      });
    });
    
    // すべてのキャンセル処理が終わるまで待機
    if (cancelPromises.length > 0) {
      await Promise.allSettled(cancelPromises);
    }
    
    // 状態を保存
    await this._saveTasks();
    
    console.log('タスクマネージャーの終了処理が完了しました');
    return;
  }

  /**
   * 古いタスクをクリア
   * @param {number} maxAgeInDays - 保持する最大日数
   * @returns {number} - クリーンアップしたタスク数
   */
  cleanupOldTasks(maxAgeInDays = 7) {
    const now = Date.now();
    const maxAgeMs = maxAgeInDays * 24 * 60 * 60 * 1000;
    let cleanedCount = 0;
    
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === 'completed' || task.status === 'error' || task.status === 'cancelled') {
        if (task.endTime && (now - task.endTime) > maxAgeMs) {
          this.tasks.delete(taskId);
          cleanedCount++;
        }
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`${cleanedCount} 件の古いタスクをクリーンアップしました`);
      this.emitTasksUpdated();
      this._saveTasks();
    }
    
    return cleanedCount;
  }
}

module.exports = TaskManager;
