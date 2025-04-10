/**
 * ipc-registry.js
 * IPCハンドラーの一元管理を行うためのグローバルレジストリ
 */

// グローバルなハンドラー登録状態を追跡
const registeredHandlers = new Set();

/**
 * IPCハンドラーを安全に登録する関数
 * @param {Electron.IpcMain} ipcMain - Electron IPC Mainオブジェクト
 * @param {string} channel - ハンドラーのチャンネル名
 * @param {Function} handler - ハンドラー関数
 * @returns {boolean} - 登録が成功したかどうか
 */
function registerHandler(ipcMain, channel, handler) {
  // 既に登録済みの場合は何もしない
  if (registeredHandlers.has(channel)) {
    console.log(`${channel} ハンドラは既に登録されています`);
    return false;
  }

  try {
    // 念のため既存のハンドラーがあれば削除
    try {
      ipcMain.removeHandler(channel);
    } catch (error) {
      // 既存のハンドラーがない場合は何もしない
    }

    // 新しいハンドラーを登録
    ipcMain.handle(channel, handler);
    registeredHandlers.add(channel);
    console.log(`${channel} ハンドラを登録しました`);
    return true;
  } catch (error) {
    console.error(`${channel} ハンドラの登録に失敗しました:`, error);
    return false;
  }
}

/**
 * IPCハンドラーを削除する関数
 * @param {Electron.IpcMain} ipcMain - Electron IPC Mainオブジェクト
 * @param {string} channel - ハンドラーのチャンネル名
 */
function removeHandler(ipcMain, channel) {
  try {
    ipcMain.removeHandler(channel);
    registeredHandlers.delete(channel);
    console.log(`${channel} ハンドラを削除しました`);
  } catch (error) {
    console.error(`${channel} ハンドラの削除に失敗しました:`, error);
  }
}

/**
 * 現在登録されているすべてのハンドラーのリストを取得
 * @returns {Array<string>} - 登録済みハンドラーの配列
 */
function getRegisteredHandlers() {
  return Array.from(registeredHandlers);
}

module.exports = {
  registerHandler,
  removeHandler,
  getRegisteredHandlers
};
