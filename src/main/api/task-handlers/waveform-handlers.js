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
  console.log('波形データハンドラー登録開始...');
  
  // 波形データ生成ハンドラー
  registerHandler(ipcMain, 'generate-waveform', async (event, mediaPath) => {
    console.log('generate-waveformハンドラが呼び出されました', { mediaPath });
    try {
      if (!mediaPath) {
        console.error('波形生成エラー: メディアパスが指定されていません');
        return { 
          success: false, 
          error: 'メディアパスが指定されていません' 
        };
      }
      
      // すでに波形を生成するタスクが存在するかチェック
      const tasks = taskManager.getTasksByMedia(mediaPath, 'waveform');
      console.log(`${mediaPath} に関連する波形タスク:`, tasks.map(t => ({ id: t.id, status: t.status })));
      
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
        console.log(`波形タスク ${taskId} をpending状態に設定`);
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
    console.log('get-waveform-dataハンドラが呼び出されました', { taskId });
    try {
      if (!taskId) {
        console.error('波形データ取得エラー: タスクIDが指定されていません');
        return {
          success: false,
          error: 'タスクIDが指定されていません'
        };
      }

      const task = taskManager.getTaskById(taskId);
      
      if (!task) {
        console.error(`波形データ取得エラー: タスクID ${taskId} のタスクが見つかりません`);
        return { 
          success: false, 
          error: 'タスクが見つかりません' 
        };
      }
      
      console.log(`波形タスク ${taskId} の状態: ${task.status}`);
      
      if (task.status !== 'completed') {
        console.error(`波形データ取得エラー: タスク ${taskId} はまだ完了していません (現在の状態: ${task.status})`);
        return { 
          success: false, 
          error: `タスクはまだ完了していません (現在の状態: ${task.status})` 
        };
      }
      
      let waveformData = null;
      let duration = 0;
      
      // タスク結果からfilePath情報を取得
      const taskResult = task.getResult();
      const baseDir = taskManager.getBaseDir();
      const waveformDir = path.join(baseDir, 'waveform');
      const waveformPath = taskResult && taskResult.filePath ? taskResult.filePath : null;
      
      console.log(`波形データファイルパス: ${waveformPath || '利用不可'}`);
      
      // 1. ファイルパスが存在すればファイルから読み込む
      if (waveformPath && fs.existsSync(waveformPath)) {
        try {
          const fileContent = fs.readFileSync(waveformPath, 'utf8');
          const fileData = JSON.parse(fileContent);
          console.log(`波形データをファイルから読み込みました: ${waveformPath}`);
          
          if (fileData) {
            if (Array.isArray(fileData)) {
              // ケース1: データそのものが配列
              waveformData = fileData;
              console.log(`波形データ（配列）: ${waveformData.length}ポイント`);
            } 
            else if (fileData.waveform && Array.isArray(fileData.waveform)) {
              // ケース2: {waveform: []}
              waveformData = fileData.waveform;
              duration = fileData.duration || 0;
              console.log(`波形データ（waveformプロパティ）: ${waveformData.length}ポイント, 長さ: ${duration}秒`);
            }
            else if (fileData.data && Array.isArray(fileData.data)) {
              // ケース3: {data: []}
              waveformData = fileData.data;
              duration = fileData.duration || 0;
              console.log(`波形データ（dataプロパティ）: ${waveformData.length}ポイント, 長さ: ${duration}秒`);
            }
            else {
              // データ形式が不明な場合は、最初の配列を探す
              for (const key in fileData) {
                if (Array.isArray(fileData[key]) && fileData[key].length > 0) {
                  waveformData = fileData[key];
                  console.log(`波形データ（${key}プロパティから抽出）: ${waveformData.length}ポイント`);
                  break;
                }
              }
            }
          }
        } catch (error) {
          console.error('波形データファイル読み込みエラー:', error);
        }
      }
      
      // 2. ファイルからデータを取得できなかった場合、タスク結果から直接取得
      if (!waveformData && taskResult) {
        console.log('タスク結果から波形データを取得します');
        
        if (Array.isArray(taskResult)) {
          // ケース1: データそのものが配列
          waveformData = taskResult;
          console.log(`タスク結果から波形データ（配列）: ${waveformData.length}ポイント`);
        }
        else if (Array.isArray(taskResult.data)) {
          // ケース2: taskResult.dataが配列
          waveformData = taskResult.data;
          console.log(`タスク結果から波形データ（data配列）: ${waveformData.length}ポイント`);
        }
        else if (taskResult.waveform && Array.isArray(taskResult.waveform)) {
          // ケース3: taskResult.waveformが配列
          waveformData = taskResult.waveform;
          duration = taskResult.duration || 0;
          console.log(`タスク結果から波形データ（waveform配列）: ${waveformData.length}ポイント, 長さ: ${duration}秒`);
        }
        else if (taskResult.data && taskResult.data.waveform && Array.isArray(taskResult.data.waveform)) {
          // ケース4: taskResult.data.waveformが配列
          waveformData = taskResult.data.waveform;
          duration = taskResult.data.duration || 0;
          console.log(`タスク結果から波形データ（data.waveform配列）: ${waveformData.length}ポイント, 長さ: ${duration}秒`);
        }
        else {
          console.log('波形データが標準形式で見つかりません。データのプロパティを探索します:');
          // データのプロパティを再帰的に探索して配列を見つける
          const findArrayProperty = (obj, prefix = '') => {
            if (!obj || typeof obj !== 'object') return null;
            
            for (const key in obj) {
              const path = prefix ? `${prefix}.${key}` : key;
              if (Array.isArray(obj[key]) && obj[key].length > 0) {
                console.log(`配列プロパティを発見: ${path} (${obj[key].length}項目)`);
                return obj[key];
              } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                const result = findArrayProperty(obj[key], path);
                if (result) return result;
              }
            }
            return null;
          };
          
          waveformData = findArrayProperty(taskResult);
          
          if (waveformData) {
            console.log(`波形データをプロパティ探索から取得: ${waveformData.length}ポイント`);
          } else {
            console.error('利用可能な波形データが見つかりません:', {
              hasTaskResult: !!taskResult,
              taskResultType: typeof taskResult,
              properties: Object.keys(taskResult || {})
            });
          }
        }
      }
      
      // 波形データが見つからなかった場合はエラー
      if (!waveformData || !Array.isArray(waveformData) || waveformData.length === 0) {
        console.error('有効な波形データが見つかりません');
        return { 
          success: false, 
          error: '有効な波形データが見つかりません'
        };
      }
      
      // データが数値配列であることを確認
      waveformData = waveformData.map(v => Number(v));
      
      console.log(`波形データを返します (${waveformData.length}ポイント, 長さ: ${duration}秒)`);
      
      // 一貫したレスポンス形式を返す
      return {
        success: true,
        taskId: task.id,
        data: {
          waveform: waveformData,
          duration: duration
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
  
  console.log('波形データハンドラー登録完了');
}

module.exports = {
  register
};
