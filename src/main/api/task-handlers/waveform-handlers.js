/**
 * 波形データ生成・取得タスク専用のハンドラー
 */

const fs = require('fs');
const path = require('path');
const { registerHandler } = require('../../ipc-registry');

/**
 * 波形データ関連のハンドラーを登録
 * @param {Electron.IpcMain} ipcMain - Electron IPC Mainオブジェクト
 * @param {TaskManager} taskManager - タスク管理インスタンス
 */
function register(ipcMain, taskManager) {
  // 波形データ生成ハンドラー
  registerHandler(ipcMain, 'generate-waveform', async (event, mediaPath) => {
    console.log('generate-waveformハンドラが呼び出されました');
    try {
      if (!mediaPath) {
        return { 
          success: false, 
          error: 'メディアパスが指定されていません' 
        };
      }
      
      // すでに波形を生成するタスクが存在するかチェック
      const tasks = taskManager.getTasksByMedia(mediaPath, 'waveform');
      
      // 完了済みタスクがあれば再利用
      const completedTask = tasks.find(t => t.status === 'completed');
      if (completedTask) {
        console.log(`既存の波形タスクを再利用: ${completedTask.id}`);
        return { 
          success: true,
          taskId: completedTask.id
        };
      }
      
      // 処理中または保留中のタスクがあれば待機
      const pendingTask = tasks.find(t => 
        t.status === 'processing' || t.status === 'pending'
      );
      
      if (pendingTask) {
        console.log(`進行中の波形タスクを使用: ${pendingTask.id}`);
        return { 
          success: true,
          taskId: pendingTask.id
        };
      }
      
      // 新しいタスクを作成
      const taskParams = {
        type: 'waveform',
        mediaPath
      };
      
      const taskId = taskManager.createTask(taskParams);
      console.log(`新しい波形タスクを作成: ${taskId}`);
      
      // タスクをpendingに設定して実行キューに入れる
      const task = taskManager.getTaskById(taskId);
      if (task && task.status === 'created') {
        task.setPending();
        taskManager.emitTasksUpdated();
      }
      
      return { 
        success: true,
        taskId
      };
    } catch (error) {
      console.error('波形生成エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // 波形データ取得ハンドラー
  registerHandler(ipcMain, 'get-waveform-data', async (event, taskId) => {
    console.log('get-waveform-dataハンドラが呼び出されました');
    try {
      if (!taskId) {
        return {
          success: false,
          error: 'タスクIDが指定されていません'
        };
      }

      const task = taskManager.getTaskById(taskId);
      
      if (!task) {
        return { 
          success: false, 
          error: 'タスクが見つかりません' 
        };
      }
      
      if (task.status !== 'completed') {
        return { 
          success: false, 
          error: `タスクはまだ完了していません (現在の状態: ${task.status})` 
        };
      }
      
      // ファイルからの読み込みを試みる
      const homeDir = require('os').homedir();
      const baseDir = path.join(homeDir, 'Super Watarec');
      const waveformDir = path.join(baseDir, 'waveform');
      const waveformPath = path.join(waveformDir, `waveform_task_${taskId}.json`);
      
      // ファイルが存在しない場合はタスク結果から直接取得
      if (!fs.existsSync(waveformPath)) {
        console.log(`波形データファイルが見つかりません: ${waveformPath}`);
        
        // タスク結果からwaveformデータを取得
        const taskResult = task.getResult();
        
        let waveformData = null;
        
        // さまざまなデータ形式に対応
        if (taskResult.data && taskResult.data.data && Array.isArray(taskResult.data.data.waveform)) {
          waveformData = taskResult.data.data.waveform;
          
        } else if (taskResult.data && Array.isArray(taskResult.data.waveform)) {
          waveformData = taskResult.data.waveform;
          
        } else if (Array.isArray(taskResult.waveform)) {
          waveformData = taskResult.waveform;
          
        } else if (taskResult.data && taskResult.data.waveform && Array.isArray(taskResult.data.waveform)) {
          waveformData = taskResult.data.waveform;
          
        } else {
          waveformData = taskResult.data;
        }
        
        if (waveformData && waveformData.length > 0) {
          console.log(`タスク結果から波形データを返します (${waveformData.length}ポイント)`);
          return {
            success: true,
            taskId: task.id,
            data: {
              waveform: waveformData,
              duration: taskResult.data?.duration || 0
            }
          };
        }
        
        return { 
          success: false, 
          error: '波形データが見つかりません'
        };
      }
      
      // ファイルから波形データを読み込む
      const fileContent = fs.readFileSync(waveformPath, 'utf8');
      const waveformData = JSON.parse(fileContent);
      
      console.log(`波形データを読み込みました: ${waveformPath}`);
      
      return {
        success: true,
        taskId: task.id,
        data: {
          waveform: waveformData.waveform || [],
          duration: waveformData.duration || 0
        }
      };
      
    } catch (error) {
      console.error('波形データ取得エラー:', error);
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
