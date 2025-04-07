/**
 * タスク関連のAPIハンドラ
 * IPCメインプロセスとレンダープロセス間の通信を処理
 */

/**
 * タスク関連のAPIハンドラを登録
 * @param {Electron.IpcMain} ipcMain - Electron IPC Mainオブジェクト
 * @param {TaskManager} taskManager - タスク管理インスタンス
 */
function registerTaskAPI(ipcMain, taskManager) {
  // タスク種類の一覧取得
  ipcMain.handle('get-task-types', async () => {
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

  // 波形データ取得（既存API互換）
  ipcMain.handle('get-waveform-data', async (event, taskId) => {
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
      
      // 互換性のために古い形式に変換
      return {
        success: true,
        waveform: task.data.waveform,
        duration: task.data.duration
      };
    } catch (error) {
      console.error('波形データ取得エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // ラウドネス測定（既存API互換）
  ipcMain.handle('measure-loudness', async (event, mediaPath) => {
    try {
      if (!mediaPath) {
        return { success: false, error: 'メディアパスが指定されていません' };
      }
      
      // 既存のラウドネスタスクを探す
      const tasks = taskManager.getTasksByMedia(mediaPath, 'loudness');
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
        type: 'loudness',
        mediaPath
      });
      
      return { 
        success: true, 
        taskId, 
        status: 'pending' 
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
    try {
      if (!mediaPath) {
        return { success: false, error: 'メディアパスが指定されていません' };
      }
      
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

  // サムネイル生成（既存API互換）
  ipcMain.handle('generate-thumbnail', async (event, mediaPath, options = {}) => {
    try {
      if (!mediaPath) {
        return { success: false, error: 'メディアパスが指定されていません' };
      }
      
      const timePosition = options.timePosition || 0;
      
      // 既存のサムネイルタスクを探す（同じ時間位置）
      const tasks = taskManager.getTasksByMedia(mediaPath, 'thumbnail');
      const existingTask = tasks.find(t => 
        (t.status === 'completed' || t.status === 'processing' || t.status === 'pending') &&
        t.timePosition === timePosition
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
        type: 'thumbnail',
        mediaPath,
        timePosition: options.timePosition || 0,
        size: options.size || '320x240'
      });
      
      return { 
        success: true, 
        taskId, 
        status: 'pending' 
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
