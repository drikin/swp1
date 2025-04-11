/**
 * タスクハンドラーファクトリー
 * 特定タスクタイプに関連するIPCハンドラーを登録するためのモジュール
 */

const thumbnailHandlers = require('./thumbnail-handlers');
const waveformHandlers = require('./waveform-handlers');

/**
 * 登録可能なすべてのタスクハンドラーの一覧
 */
const taskHandlers = {
  thumbnail: thumbnailHandlers,
  waveform: waveformHandlers,
  // 将来的に他のタスクタイプも追加可能
};

/**
 * タスクタイプに対応するハンドラーを取得
 * @param {string} taskType - タスクタイプ名
 * @returns {Object|null} - タスクハンドラーオブジェクトまたはnull
 */
function getTaskHandler(taskType) {
  return taskHandlers[taskType] || null;
}

/**
 * すべてのタスク固有ハンドラーを登録
 * @param {Electron.IpcMain} ipcMain - Electron IPC Mainオブジェクト
 * @param {TaskManager} taskManager - タスク管理インスタンス
 */
function registerAllTaskHandlers(ipcMain, taskManager) {
  console.log('タスク固有ハンドラー登録開始...');
  
  Object.keys(taskHandlers).forEach(taskType => {
    const handler = taskHandlers[taskType];
    if (handler && typeof handler.register === 'function') {
      console.log(`${taskType}タイプのハンドラーを登録します...`);
      handler.register(ipcMain, taskManager);
    }
  });
  
  console.log('タスク固有ハンドラー登録完了');
}

module.exports = {
  getTaskHandler,
  registerAllTaskHandlers
};
