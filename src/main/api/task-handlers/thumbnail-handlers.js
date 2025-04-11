/**
 * サムネイル生成タスク専用のハンドラー
 */

const fs = require('fs');
const path = require('path');
const { registerHandler } = require('../../ipc-registry');

/**
 * サムネイル関連のハンドラーを登録
 * @param {Electron.IpcMain} ipcMain - Electron IPC Mainオブジェクト
 * @param {TaskManager} taskManager - タスク管理インスタンス
 */
function register(ipcMain, taskManager) {
  // サムネイル生成ハンドラー
  registerHandler(ipcMain, 'generate-thumbnail', async (event, params) => {
    console.log('generate-thumbnailハンドラが呼び出されました');
    try {
      // パラメーターの検証と正規化
      let mediaPath = null;
      let fileId = null;
      let options = {};
      
      if (typeof params === 'string') {
        mediaPath = params;
      } else if (typeof params === 'object' && params !== null) {
        // 新しい形式: { path: string, fileId: string, ... }
        // または： { filePath: string, ... }
        mediaPath = params.path || params.filePath || params.mediaPath;
        fileId = params.fileId;
        options = params;
      } else {
        return { 
          success: false, 
          error: '無効なパラメータ形式です' 
        };
      }
      
      if (!mediaPath) {
        return { 
          success: false, 
          error: 'メディアパスが指定されていません' 
        };
      }
      
      const timePosition = options.timePosition || 0;
      
      console.log(`サムネイル生成リクエスト: ${mediaPath}, 時間位置: ${timePosition}`);
      
      // 既存タスクを検索
      const tasks = taskManager.getTasksByMedia(mediaPath, 'thumbnail');
      
      // 既に完了しているタスクで同じ時間位置のものを探す
      const completedTask = tasks.find(t => 
        t.status === 'completed' && 
        Math.abs(t.timePosition - timePosition) < 0.5
      );
      
      if (completedTask) {
        console.log('既存のサムネイルタスクを返します:', completedTask.id);
        
        // ファイルの存在確認
        if (completedTask.data && completedTask.data.filePath && fs.existsSync(completedTask.data.filePath)) {
          console.log('既存サムネイルファイルは存在します:', completedTask.data.filePath);
          return { 
            success: true,
            taskId: completedTask.id,
            filePath: completedTask.data.filePath,
            status: 'completed'
          };
        }
      }
      
      // 進行中のタスクがあれば待機するよう伝える
      const pendingTask = tasks.find(t => 
        (t.status === 'processing' || t.status === 'pending') &&
        Math.abs(t.timePosition - timePosition) < 0.5
      );
      
      if (pendingTask) {
        console.log('進行中のサムネイルタスクを返します:', pendingTask.id);
        return { 
          success: true,
          taskId: pendingTask.id,
          status: pendingTask.status,
          pending: true
        };
      }
      
      // メディアファイルが存在するかのチェックを追加
      const mediaFileExists = fs.existsSync(mediaPath);
      console.log(`メディアファイル存在確認: ${mediaPath} - ${mediaFileExists ? '存在します' : '存在しません'}`);
      
      if (!mediaFileExists) {
        console.error(`メディアファイルが存在しません: ${mediaPath}`);
        return { 
          success: false, 
          error: 'メディアファイルが存在しません' 
        };
      }
      
      // サムネイルの出力先を確認
      const homeDir = require('os').homedir();
      const outputDir = path.join(homeDir, 'Super Watarec', 'thumbnails');
      
      // 出力ディレクトリの存在確認
      if (!fs.existsSync(outputDir)) {
        console.log(`サムネイル出力ディレクトリを作成します: ${outputDir}`);
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // 新しいタスクを作成
      const taskParams = {
        type: 'thumbnail',
        mediaPath,
        fileId, // メディアIDを追加
        timePosition: options.timePosition || 0,
        thumbnailWidth: options.width || 320,
        thumbnailHeight: options.height || -1
      };
      
      console.log('新しいサムネイルタスクを作成します:', taskParams);
      const taskId = taskManager.createTask(taskParams);
      
      console.log('新しいサムネイルタスクを作成しました:', taskId);
      
      // 重要：タスクを確実に即時実行
      const task = taskManager.getTaskById(taskId);
      if (!task) {
        console.error('作成したタスクが見つかりません:', taskId);
        return { 
          success: false, 
          error: '作成したタスクが見つかりません' 
        };
      }
      
      console.log('サムネイルタスクを実行します:', taskId);
      
      // 同期的にタスクを実行開始
      try {
        // タスクがキューに追加されるようにステータスをpendingに設定
        if (task && task.status === 'created') {
          // タスクを実行可能状態に設定し、キューに追加されるようにする
          task.setPending();
          console.log(`サムネイルタスク ${taskId} を実行キューに追加しました`);
          
          // タスクマネージャーにタスク更新を通知
          taskManager.emitTasksUpdated();
        } else {
          console.log(`サムネイルタスク ${taskId} はすでに実行中または完了しています。状態: ${task ? task.status : '不明'}`);
        }
        
        console.log('サムネイルタスク実行を開始しました:', taskId);
      } catch (execError) {
        console.error('サムネイルタスク実行開始エラー:', execError);
        return { 
          success: false, 
          error: `タスク実行エラー: ${execError.message}`,
          taskId 
        };
      }
      
      // タスクIDを返す（ペンディング状態を明示）
      return { 
        success: true,
        taskId,
        status: 'pending',
        pending: true 
      };
    } catch (error) {
      console.error('サムネイル生成エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });
}

module.exports = {
  register
};
