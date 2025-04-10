/**
 * file-operations.js
 * ファイル操作関連の機能を提供
 */
const { dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// サポートされている拡張子
const SUPPORTED_EXTENSIONS = {
  video: ['mp4', 'mov', 'avi', 'webm', 'mkv', 'mts', 'm2ts', 'mpg', 'mpeg', 'hevc', 'h265', 'h264'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp']
};

/**
 * ファイル選択ダイアログを開く
 * @param {BrowserWindow} win ブラウザウィンドウインスタンス
 * @returns {Promise<string[]>} 選択されたファイルパスの配列
 */
async function openFileDialog(win) {
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
async function openDirectoryDialog(win) {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });
  
  return result.canceled ? [] : result.filePaths;
}

/**
 * 一時ディレクトリを作成
 * @param {string} prefix 一時ディレクトリの接頭辞
 * @returns {string} 作成された一時ディレクトリのパス
 */
function createTempDir(prefix = 'swp-temp-') {
  const tempDir = path.join(os.tmpdir(), `${prefix}${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * 作業ディレクトリを確保
 * @param {string} baseName ベースディレクトリ名
 * @param {Array<string>} subDirs 作成するサブディレクトリ名の配列
 * @returns {Object} 作成されたディレクトリのパス情報
 */
function ensureWorkDirectories(baseName = 'Super Watarec', subDirs = []) {
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

module.exports = {
  SUPPORTED_EXTENSIONS,
  openFileDialog,
  openDirectoryDialog,
  createTempDir,
  ensureWorkDirectories
};
