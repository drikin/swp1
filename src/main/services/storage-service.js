/**
 * ストレージサービス
 * データの永続化を担当するサービス
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const os = require('os');

class StorageService {
  constructor() {
    // アプリケーションデータディレクトリ
    this.appDataPath = app.getPath('userData');
    
    // 各種データディレクトリ
    this.tasksDir = path.join(this.appDataPath, 'tasks');
    this.settingsDir = path.join(this.appDataPath, 'settings');
    this.cacheDir = path.join(this.appDataPath, 'cache');
    
    // ディレクトリの初期化
    this._ensureDirectories();
  }

  /**
   * 必要なディレクトリを作成
   * @private
   */
  _ensureDirectories() {
    try {
      for (const dir of [this.tasksDir, this.settingsDir, this.cacheDir]) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
    } catch (error) {
      console.error('ディレクトリの作成に失敗しました:', error);
    }
  }

  /**
   * JSONデータを保存
   * @param {string} category - カテゴリ（tasks, settings など）
   * @param {string} key - 保存するキー
   * @param {object} data - 保存するデータ
   * @returns {boolean} - 成功したらtrue
   */
  saveJson(category, key, data) {
    try {
      const dirPath = this._getCategoryDir(category);
      const filePath = path.join(dirPath, `${key}.json`);
      
      // JSONに変換
      const jsonData = JSON.stringify(data, null, 2);
      
      // ファイルに保存
      fs.writeFileSync(filePath, jsonData, 'utf8');
      
      return true;
    } catch (error) {
      console.error(`JSONデータの保存に失敗 (${category}/${key}):`, error);
      return false;
    }
  }

  /**
   * JSONデータを読み込み
   * @param {string} category - カテゴリ（tasks, settings など）
   * @param {string} key - 読み込むキー
   * @param {object} defaultValue - データが存在しない場合のデフォルト値
   * @returns {object} - 読み込んだデータまたはデフォルト値
   */
  loadJson(category, key, defaultValue = null) {
    try {
      const dirPath = this._getCategoryDir(category);
      const filePath = path.join(dirPath, `${key}.json`);
      
      // ファイルが存在しない場合はデフォルト値を返す
      if (!fs.existsSync(filePath)) {
        return defaultValue;
      }
      
      // ファイルを読み込む
      const jsonData = fs.readFileSync(filePath, 'utf8');
      
      // JSONをパース
      return JSON.parse(jsonData);
    } catch (error) {
      console.error(`JSONデータの読み込みに失敗 (${category}/${key}):`, error);
      return defaultValue;
    }
  }

  /**
   * ファイルを保存
   * @param {string} category - カテゴリ（tasks, settings など）
   * @param {string} key - 保存するキー
   * @param {Buffer|string} data - 保存するデータ
   * @param {string} encoding - エンコーディング（デフォルトはバイナリ）
   * @returns {boolean} - 成功したらtrue
   */
  saveFile(category, key, data, encoding = null) {
    try {
      const dirPath = this._getCategoryDir(category);
      const filePath = path.join(dirPath, key);
      
      // ディレクトリの確認
      const fileDir = path.dirname(filePath);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }
      
      // ファイルに保存
      if (encoding) {
        fs.writeFileSync(filePath, data, encoding);
      } else {
        fs.writeFileSync(filePath, data);
      }
      
      return true;
    } catch (error) {
      console.error(`ファイルの保存に失敗 (${category}/${key}):`, error);
      return false;
    }
  }

  /**
   * ファイルを読み込み
   * @param {string} category - カテゴリ（tasks, settings など）
   * @param {string} key - 読み込むキー
   * @param {string} encoding - エンコーディング（省略時はバッファを返す）
   * @returns {Buffer|string|null} - 読み込んだデータまたはnull
   */
  loadFile(category, key, encoding = null) {
    try {
      const dirPath = this._getCategoryDir(category);
      const filePath = path.join(dirPath, key);
      
      // ファイルが存在しない場合はnullを返す
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      // ファイルを読み込む
      if (encoding) {
        return fs.readFileSync(filePath, encoding);
      } else {
        return fs.readFileSync(filePath);
      }
    } catch (error) {
      console.error(`ファイルの読み込みに失敗 (${category}/${key}):`, error);
      return null;
    }
  }

  /**
   * ファイルが存在するか確認
   * @param {string} category - カテゴリ（tasks, settings など）
   * @param {string} key - 確認するキー
   * @returns {boolean} - 存在すればtrue
   */
  exists(category, key) {
    try {
      const dirPath = this._getCategoryDir(category);
      const filePath = path.join(dirPath, key);
      return fs.existsSync(filePath);
    } catch (error) {
      console.error(`ファイル存在確認に失敗 (${category}/${key}):`, error);
      return false;
    }
  }

  /**
   * カテゴリに対応するディレクトリパスを取得
   * @param {string} category - カテゴリ名
   * @returns {string} - ディレクトリパス
   * @private
   */
  _getCategoryDir(category) {
    switch (category) {
      case 'tasks':
        return this.tasksDir;
      case 'settings':
        return this.settingsDir;
      case 'cache':
        return this.cacheDir;
      default:
        // カスタムカテゴリの場合はそのディレクトリを作成
        const customDir = path.join(this.appDataPath, category);
        if (!fs.existsSync(customDir)) {
          fs.mkdirSync(customDir, { recursive: true });
        }
        return customDir;
    }
  }

  /**
   * カテゴリ内のファイル一覧を取得
   * @param {string} category - カテゴリ（tasks, settings など）
   * @param {string} extension - フィルタする拡張子（省略可）
   * @returns {string[]} - ファイル名の配列
   */
  listFiles(category, extension = null) {
    try {
      const dirPath = this._getCategoryDir(category);
      
      if (!fs.existsSync(dirPath)) {
        return [];
      }
      
      let files = fs.readdirSync(dirPath);
      
      // 拡張子でフィルタ
      if (extension) {
        const ext = extension.startsWith('.') ? extension : `.${extension}`;
        files = files.filter(file => file.endsWith(ext));
      }
      
      return files;
    } catch (error) {
      console.error(`ファイル一覧の取得に失敗 (${category}):`, error);
      return [];
    }
  }

  /**
   * ファイルを削除
   * @param {string} category - カテゴリ（tasks, settings など）
   * @param {string} key - 削除するキー
   * @returns {boolean} - 成功したらtrue
   */
  removeFile(category, key) {
    try {
      const dirPath = this._getCategoryDir(category);
      const filePath = path.join(dirPath, key);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`ファイルの削除に失敗 (${category}/${key}):`, error);
      return false;
    }
  }

  /**
   * カテゴリ内のすべてのファイルを削除
   * @param {string} category - カテゴリ（tasks, settings など）
   * @returns {number} - 削除したファイル数
   */
  clearCategory(category) {
    try {
      const dirPath = this._getCategoryDir(category);
      
      if (!fs.existsSync(dirPath)) {
        return 0;
      }
      
      const files = fs.readdirSync(dirPath);
      let count = 0;
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile()) {
          fs.unlinkSync(filePath);
          count++;
        }
      }
      
      return count;
    } catch (error) {
      console.error(`カテゴリの削除に失敗 (${category}):`, error);
      return 0;
    }
  }

  /**
   * 作業ディレクトリを確保
   * @param {string} baseName ベースディレクトリ名
   * @param {Array<string>} subDirs 作成するサブディレクトリ名の配列
   * @returns {Object} 作成されたディレクトリのパス情報
   */
  ensureWorkDirectories(baseName = 'Super Watarec', subDirs = []) {
    const workDir = path.join(os.homedir(), baseName);
    
    // 作業ディレクトリを作成
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
      console.log('作業ディレクトリを作成しました:', workDir);
    }
    
    // サブディレクトリを作成
    const paths = { root: workDir };
    for (const dir of subDirs) {
      const dirPath = path.join(workDir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`${dir}ディレクトリを作成しました:`, dirPath);
      }
      paths[dir] = dirPath;
    }
    
    return paths;
  }
}

// シングルトンインスタンスの作成
const storageService = new StorageService();

module.exports = storageService;
