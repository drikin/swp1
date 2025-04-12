/**
 * 書き出しパイプラインのコンテキストクラス
 * 各ステップ間でデータを共有・伝播するために使用する
 */
class ExportContext {
  /**
   * @param {Object} params - コンテキストの初期化パラメータ
   * @param {Array} params.mediaFiles - メディアファイルの配列
   * @param {string} params.outputPath - 出力先パス
   * @param {Object} params.settings - 書き出し設定
   * @param {string} params.tempDir - 一時ディレクトリのパス
   */
  constructor(params = {}) {
    this.mediaFiles = params.mediaFiles || [];
    this.outputPath = params.outputPath || '';
    this.settings = params.settings || {};
    this.tempDir = params.tempDir || '';
    this.workingFiles = []; // 処理中の一時ファイル
    this.metadata = {}; // メタデータ（各ステップで追加可能）
    this.result = null; // 最終結果
  }

  /**
   * 中間ファイルを追加
   * @param {string} filePath - ファイルパス
   * @param {Object} metadata - 関連メタデータ
   * @returns {ExportContext} - チェーン用にthisを返す
   */
  addWorkingFile(filePath, metadata = {}) {
    this.workingFiles.push({
      path: filePath,
      metadata
    });
    return this;
  }

  /**
   * 直前のステップの出力ファイルを取得
   * @returns {Array} - 作業ファイル配列
   */
  getLatestWorkingFiles() {
    return this.workingFiles;
  }

  /**
   * コンテキストに情報を追加
   * @param {string} key - メタデータのキー
   * @param {any} value - メタデータの値
   * @returns {ExportContext} - チェーン用にthisを返す
   */
  setMetadata(key, value) {
    this.metadata[key] = value;
    return this;
  }

  /**
   * メタデータを取得
   * @param {string} key - メタデータのキー
   * @param {any} defaultValue - キーが存在しない場合のデフォルト値
   * @returns {any} - メタデータの値
   */
  getMetadata(key, defaultValue = null) {
    return this.metadata.hasOwnProperty(key) ? this.metadata[key] : defaultValue;
  }
}

module.exports = ExportContext;
