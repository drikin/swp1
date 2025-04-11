/**
 * dialog-service.js
 * ファイル選択ダイアログ関連の機能を提供するサービス
 */
const { dialog, app } = require('electron');

// サポートされている拡張子
const SUPPORTED_EXTENSIONS = {
  video: ['mp4', 'mov', 'avi', 'webm', 'mkv', 'mts', 'm2ts', 'mpg', 'mpeg', 'hevc', 'h265', 'h264'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp']
};

class DialogService {
  constructor() {
    this.SUPPORTED_EXTENSIONS = SUPPORTED_EXTENSIONS;
  }

  /**
   * ファイル選択ダイアログを開く
   * @param {BrowserWindow} win ブラウザウィンドウインスタンス
   * @returns {Promise<string[]>} 選択されたファイルパスの配列
   */
  async openFileDialog(win) {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '動画ファイル', extensions: SUPPORTED_EXTENSIONS.video },
        { name: '画像ファイル', extensions: SUPPORTED_EXTENSIONS.image },
        { name: 'すべてのファイル', extensions: ['*'] }
      ]
    });
    
    return result.canceled ? [] : result.filePaths;
  }

  /**
   * ディレクトリ選択ダイアログを開く
   * @param {BrowserWindow} win ブラウザウィンドウインスタンス
   * @returns {Promise<string[]>} 選択されたディレクトリパスの配列
   */
  async openDirectoryDialog(win) {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    });
    
    return result.canceled ? [] : result.filePaths;
  }

  /**
   * デスクトップのパスを取得
   * @returns {string} デスクトップのパス
   */
  getDesktopPath() {
    return app.getPath('desktop');
  }
  
  /**
   * 一時ディレクトリを作成
   * @param {string} prefix 一時ディレクトリの接頭辞
   * @returns {string} 作成された一時ディレクトリのパス
   */
  createTempDir(prefix = 'swp-temp-') {
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    
    const tempDir = path.join(os.tmpdir(), `${prefix}${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    return tempDir;
  }
}

// シングルトンインスタンスの作成
const dialogService = new DialogService();

module.exports = dialogService;
