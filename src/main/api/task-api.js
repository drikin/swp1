/**
 * タスク関連のAPIハンドラ
 * IPCメインプロセスとレンダープロセス間の通信を処理
 */

const fs = require('fs');
const path = require('path');

// 共通のハンドラーレジストリをインポート
const { registerHandler } = require('../ipc-registry');

/**
 * タスク関連のAPIハンドラを登録
 * @param {Electron.IpcMain} ipcMain - Electron IPC Mainオブジェクト
 * @param {TaskManager} taskManager - タスク管理インスタンス
 */
function registerTaskAPI(ipcMain, taskManager) {
  console.log('タスクAPI登録開始...');
  // タスク種類の一覧取得
  ipcMain.handle('get-task-types', async () => {
    console.log('get-task-typesハンドラが呼び出されました');
    try {
      const types = taskManager.registry.getRegisteredTaskTypes();
      return {
        success: true,
        types: types.map(type => ({
          type,
          ...taskManager.registry.getTaskTypeConfig(type)
        }))
      };
    } catch (error) {
      console.error('タスク種類取得エラー:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // タスク作成
  ipcMain.handle('create-task', async (event, type, params = {}) => {
    console.log('create-taskハンドラが呼び出されました');
    try {
      // パラメータを正規化
      const taskParams = {
        type,
        ...params
      };
      
      const taskId = taskManager.createTask(taskParams);
      return { success: true, taskId };
    } catch (error) {
      console.error('タスク作成エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // 一括タスク作成
  ipcMain.handle('create-task-batch', async (event, taskConfigs) => {
    console.log('create-task-batchハンドラが呼び出されました');
    try {
      if (!Array.isArray(taskConfigs) || taskConfigs.length === 0) {
        throw new Error('有効なタスク設定が指定されていません');
      }
      
      const taskIds = taskManager.createTaskBatch(taskConfigs);
      return { 
        success: true, 
        taskIds,
        count: taskIds.length
      };
    } catch (error) {
      console.error('一括タスク作成エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // タスク状態取得
  ipcMain.handle('get-task-status', async (event, taskId) => {
    console.log('get-task-statusハンドラが呼び出されました');
    try {
      const task = taskManager.getTaskById(taskId);
      if (!task) {
        return { 
          success: false, 
          error: 'タスクが見つかりません' 
        };
      }
      
      return {
        success: true,
        task: task.toJSON()
      };
    } catch (error) {
      console.error('タスク状態取得エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // タスク結果取得
  ipcMain.handle('get-task-result', async (event, taskId) => {
    console.log('get-task-resultハンドラが呼び出されました');
    try {
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
          error: 'タスクはまだ完了していません',
          status: task.status
        };
      }
      
      return {
        success: true,
        taskId: task.id,
        type: task.type,
        data: task.data
      };
    } catch (error) {
      console.error('タスク結果取得エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // 複数タスクの状態一括取得
  ipcMain.handle('get-multiple-task-status', async (event, taskIds) => {
    console.log('get-multiple-task-statusハンドラが呼び出されました');
    try {
      if (!Array.isArray(taskIds)) {
        return {
          success: false,
          error: 'タスクIDの配列を指定してください'
        };
      }
      
      const tasks = taskIds
        .map(id => taskManager.getTaskById(id))
        .filter(task => task) // nullまたはundefinedを除外
        .map(task => task.toJSON());
      
      return {
        success: true,
        tasks,
        count: tasks.length
      };
    } catch (error) {
      console.error('複数タスク状態取得エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // メディアパスからタスク検索
  ipcMain.handle('find-tasks-by-media', async (event, mediaPath, type = null) => {
    console.log('find-tasks-by-mediaハンドラが呼び出されました');
    try {
      if (!mediaPath) {
        return {
          success: false,
          error: 'メディアパスが指定されていません'
        };
      }
      
      const tasks = taskManager.getTasksByMedia(mediaPath, type);
      
      return {
        success: true,
        tasks: tasks.map(t => t.toJSON())
      };
    } catch (error) {
      console.error('メディアタスク検索エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // タスクタイプによる検索
  ipcMain.handle('find-tasks-by-type', async (event, type) => {
    console.log('find-tasks-by-typeハンドラが呼び出されました');
    try {
      if (!type) {
        return {
          success: false,
          error: 'タスクタイプが指定されていません'
        };
      }
      
      const tasks = taskManager.getTasksByType(type);
      
      return {
        success: true,
        tasks: tasks.map(t => t.toJSON())
      };
    } catch (error) {
      console.error('タイプ検索エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // タスクキャンセル
  ipcMain.handle('cancel-task', async (event, taskId) => {
    console.log('cancel-taskハンドラが呼び出されました');
    try {
      if (!taskId) {
        return {
          success: false,
          error: 'タスクIDが指定されていません'
        };
      }
      
      const result = taskManager.cancelTask(taskId);
      return result;
    } catch (error) {
      console.error('タスクキャンセルエラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // 複数タスクのキャンセル
  ipcMain.handle('cancel-multiple-tasks', async (event, taskIds) => {
    console.log('cancel-multiple-tasksハンドラが呼び出されました');
    try {
      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return {
          success: false,
          error: 'キャンセルするタスクIDが指定されていません'
        };
      }
      
      const results = taskIds.map(id => {
        try {
          return {
            taskId: id,
            ...taskManager.cancelTask(id)
          };
        } catch (err) {
          return {
            taskId: id,
            success: false,
            error: err.message
          };
        }
      });
      
      const successCount = results.filter(r => r.success).length;
      
      return {
        success: true,
        results,
        successCount,
        totalCount: taskIds.length
      };
    } catch (error) {
      console.error('複数タスクキャンセルエラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // タスク一時停止
  ipcMain.handle('pause-task', async (event, taskId) => {
    console.log('pause-taskハンドラが呼び出されました');
    try {
      const task = taskManager.getTaskById(taskId);
      if (!task) {
        return { 
          success: false, 
          error: 'タスクが見つかりません' 
        };
      }
      
      if (task.pause()) {
        return { 
          success: true, 
          message: 'タスクを一時停止しました' 
        };
      } else {
        return { 
          success: false, 
          error: `タスクは現在 ${task.status} 状態のため一時停止できません` 
        };
      }
    } catch (error) {
      console.error('タスク一時停止エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // タスク再開
  ipcMain.handle('resume-task', async (event, taskId) => {
    console.log('resume-taskハンドラが呼び出されました');
    try {
      const task = taskManager.getTaskById(taskId);
      if (!task) {
        return { 
          success: false, 
          error: 'タスクが見つかりません' 
        };
      }
      
      if (task.resume()) {
        return { 
          success: true, 
          message: 'タスクを再開しました' 
        };
      } else {
        return { 
          success: false, 
          error: `タスクは現在 ${task.status} 状態のため再開できません` 
        };
      }
    } catch (error) {
      console.error('タスク再開エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // すべてのタスク取得
  ipcMain.handle('get-all-tasks', async () => {
    console.log('get-all-tasksハンドラが呼び出されました');
    try {
      const tasks = taskManager.getAllTasks();
      return {
        success: true,
        tasks: tasks.map(t => t.toJSON())
      };
    } catch (error) {
      console.error('全タスク取得エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // タスク依存関係の取得
  ipcMain.handle('get-task-dependencies', async (event, taskId) => {
    console.log('get-task-dependenciesハンドラが呼び出されました');
    try {
      if (!taskManager.taskDependencies.has(taskId)) {
        return {
          success: true,
          dependencies: []
        };
      }
      
      const dependencies = taskManager.taskDependencies.get(taskId)
        .map(depId => {
          const task = taskManager.getTaskById(depId);
          return task ? task.toJSON() : null;
        })
        .filter(t => t); // nullを除外
      
      return {
        success: true,
        dependencies
      };
    } catch (error) {
      console.error('依存関係取得エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // タスク子関係の取得
  ipcMain.handle('get-task-children', async (event, taskId) => {
    console.log('get-task-childrenハンドラが呼び出されました');
    try {
      if (!taskManager.taskChildren.has(taskId)) {
        return {
          success: true,
          children: []
        };
      }
      
      const children = taskManager.taskChildren.get(taskId)
        .map(childId => {
          const task = taskManager.getTaskById(childId);
          return task ? task.toJSON() : null;
        })
        .filter(t => t); // nullを除外
      
      return {
        success: true,
        children
      };
    } catch (error) {
      console.error('子タスク取得エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // 古いタスクをクリーンアップ
  ipcMain.handle('cleanup-old-tasks', async (event, maxAgeInDays = 7) => {
    console.log('cleanup-old-tasksハンドラが呼び出されました');
    try {
      const cleanedCount = taskManager.cleanupOldTasks(maxAgeInDays);
      return {
        success: true,
        cleanedCount
      };
    } catch (error) {
      console.error('タスククリーンアップエラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // メディアパスからタスクID取得（互換性維持用）
  ipcMain.handle('get-task-id-by-media-path', async (event, mediaPath, type) => {
    console.log('get-task-id-by-media-pathハンドラが呼び出されました');
    try {
      if (!mediaPath) {
        return { success: false, error: 'メディアパスが指定されていません' };
      }
      
      const tasks = taskManager.getTasksByMedia(mediaPath, type);
      
      // 完了済タスクを優先
      const completedTask = tasks.find(t => t.status === 'completed');
      if (completedTask) {
        return { 
          success: true, 
          taskId: completedTask.id, 
          status: completedTask.status 
        };
      }
      
      // 処理中タスクがあれば返す
      const processingTask = tasks.find(t => t.status === 'processing');
      if (processingTask) {
        return { 
          success: true, 
          taskId: processingTask.id, 
          status: processingTask.status 
        };
      }
      
      // 保留中タスクがあれば返す
      const pendingTask = tasks.find(t => t.status === 'pending');
      if (pendingTask) {
        return { 
          success: true, 
          taskId: pendingTask.id, 
          status: pendingTask.status 
        };
      }
      
      // リトライ待ちタスクがあれば返す
      const retryTask = tasks.find(t => t.status === 'retry_pending');
      if (retryTask) {
        return { 
          success: true, 
          taskId: retryTask.id, 
          status: retryTask.status 
        };
      }
      
      return { 
        success: false, 
        error: 'タスクが見つかりません' 
      };
    } catch (error) {
      console.error('タスクID検索エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // 波形データ取得（改良版）
  ipcMain.handle('get-waveform-data', async (event, taskId) => {
    console.log('get-waveform-dataハンドラが呼び出されました');
    console.log(`波形データ取得リクエスト受信 - タスクID: ${taskId}`);
    
    if (!taskId) {
      console.error('タスクIDが指定されていません');
      return { success: false, error: 'タスクIDが指定されていません' };
    }
    
    try {
      // タスク情報の取得
      const task = taskManager.getTaskById(taskId);
      if (!task) {
        console.error(`指定されたタスクが見つかりません: ${taskId}`);
        return { success: false, error: '指定されたタスクが見つかりません' };
      }
      
      console.log(`波形タスク情報: ${JSON.stringify(task)}`);
      
      // タスクが完了していない場合
      if (task.status !== 'completed') {
        console.log(`タスク [${taskId}] はまだ完了していません (status: ${task.status})`);
        return { 
          success: true, 
          taskId: task.id, 
          status: task.status,
          data: null 
        };
      }
      
      // 波形データファイルパスの取得
      const homeDir = require('os').homedir();
      const baseDir = path.join(homeDir, 'Super Watarec');
      const waveformDir = path.join(baseDir, 'waveform');
      const waveformPath = path.join(waveformDir, `waveform_task_${taskId}.json`);
      
      console.log(`波形データファイルの確認: ${waveformPath}`);
      
      // ファイルの存在確認
      if (!fs.existsSync(waveformPath)) {
        console.error(`波形データファイルが見つかりません: ${waveformPath}`);
        
        // タスク結果を直接使用
        console.log('タスク結果から波形データを取得します');
        
        // タスク結果からwaveformデータを取得
        const taskResult = task.result || {};
        console.log('タスク結果の完全構造:', JSON.stringify(taskResult, null, 2));
        
        // 波形データの存在をチェック (すべての可能な場所)
        let waveformData = null;
        let duration = 0;
        
        if (taskResult.data && taskResult.data.data && Array.isArray(taskResult.data.data.waveform)) {
          console.log('形式1: taskResult.data.data.waveform');
          waveformData = taskResult.data.data.waveform;
          duration = taskResult.data.duration || 0;
        } else if (taskResult.data && Array.isArray(taskResult.data.waveform)) {
          console.log('形式2: taskResult.data.waveform');
          waveformData = taskResult.data.waveform;
          duration = taskResult.data.duration || 0;
        } else if (Array.isArray(taskResult.waveform)) {
          console.log('形式3: taskResult.waveform');
          waveformData = taskResult.waveform;
          duration = taskResult.duration || 0;
        } else if (taskResult.data && taskResult.data.waveform && Array.isArray(taskResult.data.waveform)) {
          console.log('形式4: taskResult.data.waveform');
          waveformData = taskResult.data.waveform;
          duration = taskResult.data.duration || 0;
        } else if (taskResult.data && Array.isArray(taskResult.data)) {
          console.log('形式5: taskResult.data (array)');
          waveformData = taskResult.data;
          duration = taskResult.duration || 0;
        }
        
        if (waveformData && waveformData.length > 0) {
          console.log(`タスク結果から波形データを返します (${waveformData.length}ポイント)`);
          
          // レスポンス形式を明確に統一
          const response = {
            success: true,
            waveform: waveformData,  // 直接waveformプロパティとして設定
            duration: duration,
            data: {
              waveform: waveformData,
              duration: duration
            }
          };
          
          console.log('レスポンス形式:', JSON.stringify(response, null, 2));
          return response;
        }
        
        return { success: false, error: '波形データファイルが見つかりません' };
      }
      
      // JSONファイルの読み込み
      const fileContent = fs.readFileSync(waveformPath, 'utf8');
      const waveformData = JSON.parse(fileContent);
      
      console.log(`波形データを読み込みました: ${waveformPath} (${waveformData.waveform ? waveformData.waveform.length : 'なし'}ポイント)`);
      
      // レスポンス形式を明確に統一
      const response = {
        success: true,
        waveform: waveformData.waveform || [],  // 直接waveformプロパティとして設定
        duration: waveformData.duration || 0, 
        data: {
          waveform: waveformData.waveform || [],
          duration: waveformData.duration || 0
        }
      };
      
      console.log('返送する波形データ構造:', JSON.stringify(response, null, 2));
      return response;
    } catch (error) {
      console.error('波形データ取得エラー:', error);
      return { success: false, error: error.message };
    }
  });

  // ラウドネス測定（既存API互換）
  ipcMain.handle('measure-loudness', async (event, params) => {
    console.log('measure-loudnessハンドラが呼び出されました');
    try {
      // paramsが文字列の場合は従来の形式（ファイルパスのみ）として扱う
      let mediaPath, fileId;
      
      if (typeof params === 'string') {
        mediaPath = params;
      } else if (typeof params === 'object' && params !== null) {
        // 新しい形式: { filePath: string, fileId: string, ... }
        mediaPath = params.filePath;
        fileId = params.fileId;
      } else {
        return { success: false, error: '無効なパラメータ形式です' };
      }
      
      if (!mediaPath) {
        return { success: false, error: 'メディアパスが指定されていません' };
      }
      
      console.log('ラウドネス測定リクエスト:', { mediaPath, fileId });
      
      // 既存のラウドネスタスクを探す
      const tasks = taskManager.getTasksByMedia(mediaPath, 'loudness');
      
      // 完了済みタスクがあればその結果を返す
      const completedTask = tasks.find(t => t.status === 'completed');
      if (completedTask) {
        console.log('完了済みラウドネスタスクを返します:', completedTask.id);
        
        // タスクデータからファイルパスがあれば読み込む
        if (completedTask.data && completedTask.data.filePath && 
            fs.existsSync(completedTask.data.filePath)) {
          try {
            console.log('ラウドネス測定ファイルを読み込みます:', completedTask.data.filePath);
            const fileContent = fs.readFileSync(completedTask.data.filePath, 'utf8');
            const fileData = JSON.parse(fileContent);
            
            // ファイルデータとタスクデータを統合
            return {
              success: true,
              data: {
                integrated_loudness: fileData.integrated_loudness || 
                                     (fileData.raw ? parseFloat(fileData.raw.input_i) : 0),
                true_peak: fileData.true_peak || 
                          (fileData.raw ? parseFloat(fileData.raw.input_tp) : 0),
                range: fileData.lra || fileData.range || 
                      (fileData.raw ? parseFloat(fileData.raw.input_lra) : 0),
                threshold: fileData.threshold || 
                          (fileData.raw ? parseFloat(fileData.raw.input_thresh) : 0),
                filePath: completedTask.data.filePath,
                mediaId: fileId || path.basename(mediaPath)
              }
            };
          } catch (err) {
            console.error('ラウドネスファイル読み込みエラー:', err);
            // ファイル読み込みに失敗した場合はタスクデータを直接使用
          }
        }
        
        // タスクデータを直接返す
        return {
          success: true,
          data: completedTask.data
        };
      }
      
      // 処理中タスクがあれば待機するよう伝える
      const processingTask = tasks.find(t => 
        t.status === 'processing' || t.status === 'pending'
      );
      
      if (processingTask) {
        console.log('進行中のラウドネスタスクを返します:', processingTask.id);
        return { 
          success: true,
          taskId: processingTask.id, 
          status: processingTask.status,
          pending: true
        };
      }
      
      // 新しいタスクを作成
      const taskId = taskManager.createTask({
        type: 'loudness',
        mediaPath,
        fileId: fileId || path.basename(mediaPath)
      });
      
      console.log('新しいラウドネスタスクを作成しました:', taskId);
      
      return { 
        success: true, 
        taskId, 
        status: 'pending',
        pending: true
      };
    } catch (error) {
      console.error('ラウドネス測定エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // 波形生成（既存API互換）
  ipcMain.handle('generate-waveform', async (event, mediaPath) => {
    console.log('generate-waveformハンドラが呼び出されました');
    try {
      if (!mediaPath) {
        return { success: false, error: 'メディアパスが指定されていません' };
      }
      
      console.log('波形生成リクエスト:', mediaPath);
      
      // 既存の波形タスクを探す
      const tasks = taskManager.getTasksByMedia(mediaPath, 'waveform');
      const existingTask = tasks.find(t => 
        t.status === 'completed' || t.status === 'processing' || t.status === 'pending'
      );
      
      if (existingTask) {
        return { 
          success: true, 
          taskId: existingTask.id, 
          status: existingTask.status 
        };
      }
      
      // 新しいタスクを作成
      const taskId = taskManager.createTask({
        type: 'waveform',
        mediaPath
      });
      
      console.log('新しい波形タスクを作成しました:', taskId);
      
      return { 
        success: true, 
        taskId, 
        status: 'pending' 
      };
    } catch (error) {
      console.error('波形生成エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // サムネイル生成
  ipcMain.handle('generate-thumbnail', async (event, params) => {
    console.log('generate-thumbnailハンドラが呼び出されました');
    try {
      let mediaPath = null;
      let fileId = null;
      let options = {};
      
      if (typeof params === 'string') {
        mediaPath = params;
      } else if (typeof params === 'object' && params !== null) {
        // 新しい形式: { filePath: string, fileId: string, ... }
        mediaPath = params.path || params.filePath;
        fileId = params.fileId;
        options = params;
      } else {
        return { success: false, error: '無効なパラメータ形式です' };
      }
      
      if (!mediaPath) {
        return { success: false, error: 'メディアパスが指定されていません' };
      }
      
      // 詳細なデバッグログを追加
      console.log('サムネイル生成リクエスト詳細:', { 
        mediaPath, 
        fileId, 
        options,
        path: options.path,
        timePosition: options.timePosition || 0,
        width: options.width || 320,
        height: options.height || -1
      });
      
      const timePosition = options.timePosition || 0;
      
      // 既存のサムネイルタスクを探す（同じ時間位置）
      const tasks = taskManager.getTasksByMedia(mediaPath, 'thumbnail');
      console.log(`既存のサムネイルタスク検索結果: ${tasks.length}件`);
      
      const existingTask = tasks.find(t => 
        t.status === 'completed' && 
        Math.abs(t.timePosition - timePosition) < 0.5  // 0.5秒の誤差を許容
      );
      
      // 完了済みタスクがあればそのファイルパスを返す
      if (existingTask && existingTask.status === 'completed' && existingTask.data && existingTask.data.filePath) {
        console.log('既存のサムネイルを返します:', existingTask.data.filePath);
        
        // ファイルの存在確認
        if (fs.existsSync(existingTask.data.filePath)) {
          console.log('既存サムネイルファイルは存在します');
          return {
            success: true,
            taskId: existingTask.id,
            filePath: existingTask.data.filePath,
            status: 'completed'
          };
        } else {
          console.log('既存サムネイルファイルは存在しません。新しく生成します。');
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

module.exports = { registerTaskAPI };
