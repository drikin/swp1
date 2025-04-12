/**
 * 書き出しパイプラインの基底ステップクラス
 * 各処理ステップはこのクラスを継承して実装する
 */
class ExportStep {
  /**
   * @param {Object} options - ステップのオプション
   * @param {string} options.name - ステップ名
   */
  constructor(options = {}) {
    this.name = options.name || this.constructor.name;
  }

  /**
   * ステップを実行する
   * @param {ExportContext} context - ステップ間で共有するコンテキスト
   * @param {function} progressCallback - 進捗報告用コールバック (progress, details) => void
   * @returns {Promise<ExportContext>} - 更新されたコンテキスト
   */
  async execute(context, progressCallback) {
    throw new Error('サブクラスで実装する必要があります');
  }

  /**
   * このステップが現在のコンテキストで実行可能かどうかを判定
   * @param {ExportContext} context - 実行コンテキスト
   * @returns {boolean} 実行可能かどうか
   */
  canExecute(context) {
    return true;
  }

  /**
   * ステップをキャンセルする
   * @returns {Promise<void>}
   */
  async cancel() {
    // サブクラスでオーバーライド可能
  }
}

module.exports = ExportStep;
