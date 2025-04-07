/**
 * タスクレジストリ
 * 様々なタスクタイプを登録・管理するクラス
 */
class TaskRegistry {
  constructor() {
    this.taskTypes = new Map(); // タスクタイプの設定を保持
    this.taskFactories = new Map(); // タスク生成関数を保持
    this.taskResultHandlers = new Map(); // タスク結果処理関数を保持
  }

  /**
   * 新しいタスクタイプを登録
   * @param {string} typeName - タスクタイプの名前
   * @param {object} typeConfig - タスクタイプの設定
   * @param {Function} factory - タスクインスタンス生成関数
   * @param {Function} resultHandler - タスク結果処理関数（オプション）
   * @returns {TaskRegistry} - チェーン用にthisを返す
   */
  registerTaskType(typeName, typeConfig, factory, resultHandler = null) {
    this.taskTypes.set(typeName, typeConfig);
    this.taskFactories.set(typeName, factory);
    
    if (resultHandler) {
      this.taskResultHandlers.set(typeName, resultHandler);
    }
    
    console.log(`タスク種類「${typeName}」を登録しました`);
    return this;
  }

  /**
   * 登録済みのタスク種類かどうか確認
   * @param {string} typeName - タスクタイプ名
   * @returns {boolean} - 登録済みならtrue
   */
  hasTaskType(typeName) {
    return this.taskTypes.has(typeName);
  }

  /**
   * 登録済みタスク種類の一覧を取得
   * @returns {string[]} - タスクタイプ名の配列
   */
  getRegisteredTaskTypes() {
    return Array.from(this.taskTypes.keys());
  }

  /**
   * タスク種類の設定を取得
   * @param {string} typeName - タスクタイプ名
   * @returns {object|null} - タスクタイプの設定
   */
  getTaskTypeConfig(typeName) {
    return this.taskTypes.get(typeName);
  }

  /**
   * 指定タイプのタスクを生成
   * @param {string} typeName - タスクタイプ名
   * @param {object} params - タスク生成パラメータ
   * @returns {BaseTask} - 生成されたタスクインスタンス
   * @throws {Error} - 未登録タイプの場合
   */
  createTask(typeName, params) {
    if (!this.hasTaskType(typeName)) {
      throw new Error(`未登録のタスク種類です: ${typeName}`);
    }
    
    const factory = this.taskFactories.get(typeName);
    return factory(params);
  }

  /**
   * タスク結果を処理
   * @param {BaseTask} task - 処理対象のタスク
   * @returns {any} - 処理結果
   * @throws {Error} - 未登録タイプの場合
   */
  handleTaskResult(task) {
    if (!this.hasTaskType(task.type)) {
      throw new Error(`未登録のタスク種類です: ${task.type}`);
    }
    
    const handler = this.taskResultHandlers.get(task.type);
    if (!handler) {
      return task.data; // ハンドラがない場合はそのままデータを返す
    }
    
    return handler(task);
  }
}

module.exports = TaskRegistry;
