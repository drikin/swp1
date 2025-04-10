/**
 * ffmpeg-service-manager.js
 * FFmpegサービスプロセスを管理するためのクラス
 */
const { spawn, exec } = require('child_process');
const axios = require('axios');
const path = require('path');
const { app } = require('electron');
const { EventEmitter } = require('events');

// FFmpegサービスのデフォルト設定
const DEFAULT_PORT = 3001;
const HEALTH_CHECK_INTERVAL = 5000; // 5秒ごとにヘルスチェック
const SERVICE_START_TIMEOUT = 10000; // 10秒のサービス起動タイムアウト

/**
 * FFmpegサービスマネージャークラス
 */
class FFmpegServiceManager extends EventEmitter {
  constructor(options = {}) {
    super(); // EventEmitterのコンストラクタを呼び出し
    this.port = options.port || DEFAULT_PORT;
    this.serviceProcess = null;
    this.isRunning = false;
    this.baseUrl = `http://localhost:${this.port}`;
    this.healthCheckInterval = null;
    this.onReadyCallbacks = [];
    this.pendingRequests = [];
    this.startPromise = null;
    this.activeTaskIds = new Set(); // アクティブなタスクIDを追跡
    
    // サービス起動コマンドのパス
    this.servicePath = path.join(__dirname, 'services', 'ffmpeg-service.js');
    
    // ログファイルパス
    this.logPath = path.join(app.getPath('userData'), 'ffmpeg-service.log');
    
    console.log('FFmpegサービスマネージャーを初期化しました');
    console.log('サービスパス:', this.servicePath);
  }
  
  /**
   * サービスを起動
   */
  start() {
    // 既に起動処理中であれば、同じPromiseを返す
    if (this.startPromise) {
      return this.startPromise;
    }
    
    this.startPromise = new Promise(async (resolve, reject) => {
      try {
        // 既存のプロセスを強制終了（常に実行して確実にサービスを再起動）
        try {
          console.log('既存のプロセスを確実に終了してからサービスを起動します');
          await this.killAllFFmpegProcesses().catch(err => {
            console.warn('既存のFFmpegプロセス終了中にエラー:', err);
          });
        } catch (err) {
          console.warn('既存のFFmpegプロセス終了中にエラー:', err);
        }
        
        // サービスが既に実行中かチェック
        if (this.isRunning) {
          console.log('FFmpegサービスは既に実行中と判断されていましたが、確実に再起動します');
          this.isRunning = false;
          this._stopHealthCheck();
          this.serviceProcess = null;
        }
        
        // 環境変数の設定
        const env = {
          ...process.env,
          FFMPEG_SERVICE_PORT: this.port
        };
        
        // Node.jsプロセスとしてサービスを起動
        this.serviceProcess = spawn('node', [this.servicePath], {
          env,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        // 標準出力とエラー出力を処理
        this.serviceProcess.stdout.on('data', (data) => {
          console.log('FFmpegサービス stdout:', data.toString().trim());
        });
        
        this.serviceProcess.stderr.on('data', (data) => {
          console.error('FFmpegサービス stderr:', data.toString().trim());
        });
        
        // プロセス終了時の処理
        this.serviceProcess.on('close', (code) => {
          console.log(`FFmpegサービスプロセスが終了しました (コード: ${code})`);
          this.isRunning = false;
          this._stopHealthCheck();
          this.serviceProcess = null;
        });
        
        this.serviceProcess.on('error', (err) => {
          console.error('FFmpegサービスプロセスエラー:', err);
          reject(err);
        });
        
        // サービスの準備ができるまで待機
        let startTime = Date.now();
        let isReady = false;
        
        console.log('FFmpegサービスの準備ができるまで待機中...');
        while (!isReady && (Date.now() - startTime) < SERVICE_START_TIMEOUT) {
          try {
            await new Promise(r => setTimeout(r, 500)); // 500ms待機
            await this._healthCheck();
            isReady = true;
            console.log('FFmpegサービスが応答可能になりました');
          } catch (err) {
            // まだ準備ができていない、待機継続
          }
        }
        
        if (!isReady) {
          throw new Error('FFmpegサービスの起動がタイムアウトしました');
        }
        
        console.log('FFmpegサービスが正常に起動しました');
        this.isRunning = true;
        this._startHealthCheck();
        
        // 保留中のリクエストを処理
        this._processPendingRequests();
        
        // 準備完了コールバックを実行
        this._notifyReady();
        
        resolve(true);
      } catch (error) {
        console.error('FFmpegサービス起動エラー:', error);
        this.isRunning = false;
        this.serviceProcess = null;
        this.startPromise = null;
        reject(error);
      }
    });
    
    return this.startPromise;
  }
  
  /**
   * サービスを停止
   */
  stop() {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('FFmpegサービスを停止します...');
        
        // 実行中のすべてのタスクをキャンセル
        if (this.activeTaskIds.size > 0) {
          console.log(`実行中の${this.activeTaskIds.size}個のタスクをキャンセルします...`);
          
          const cancelPromises = Array.from(this.activeTaskIds).map(taskId => {
            return this.cancelTask(taskId).catch(err => {
              console.warn(`タスク[${taskId}]のキャンセルに失敗しました:`, err);
              return null;
            });
          });
          
          await Promise.allSettled(cancelPromises);
          console.log('すべてのタスクのキャンセル処理が完了しました');
        }
        
        // APIを使用してサービスを正常に停止
        if (this.isRunning) {
          try {
            await axios.post(`${this.baseUrl}/shutdown`);
            console.log('サービスへの停止リクエストを送信しました');
          } catch (err) {
            console.warn('サービスへの停止リクエスト送信に失敗しました:', err.message);
          }
        }
        
        // サービスプロセスが存在する場合は強制終了
        if (this.serviceProcess) {
          console.log('FFmpegサービスプロセスを強制終了します');
          
          try {
            // プロセスグループ全体を終了（子プロセスも含む）
            if (process.platform === 'win32') {
              // Windowsの場合
              exec(`taskkill /F /T /PID ${this.serviceProcess.pid}`);
            } else {
              // macOS/Linuxの場合
              process.kill(-this.serviceProcess.pid, 'SIGKILL');
            }
          } catch (err) {
            console.warn('プロセスの強制終了に失敗:', err);
          }
          
          this.serviceProcess = null;
        }
        
        // 残存するFFmpegプロセスをすべて強制終了
        await this.killAllFFmpegProcesses();
        
        // ヘルスチェックを停止
        this._stopHealthCheck();
        
        this.isRunning = false;
        this.startPromise = null;
        this.activeTaskIds.clear();
        
        console.log('FFmpegサービスの停止処理が完了しました');
        resolve();
      } catch (error) {
        console.error('FFmpegサービス停止エラー:', error);
        this.isRunning = false;
        this.startPromise = null;
        reject(error);
      }
    });
  }
  
  /**
   * システム上のすべてのFFmpegプロセスを強制終了
   */
  killAllFFmpegProcesses() {
    return new Promise((resolve) => {
      console.log('システム上のすべてのFFmpegプロセスを検索して強制終了します...');
      
      // OSに応じたコマンドを選択
      let command;
      if (process.platform === 'win32') {
        // Windowsの場合
        command = 'tasklist /FI "IMAGENAME eq ffmpeg.exe" /FO CSV | findstr /r "^\"ffmpeg.exe"';
      } else {
        // macOS/Linuxの場合
        command = 'ps aux | grep "[f]fmpeg" | awk \'{print $2}\'';
      }
      
      // プロセスを検索
      exec(command, (error, stdout) => {
        if (error) {
          console.warn('FFmpegプロセスの検索に失敗:', error);
          resolve();
          return;
        }
        
        const pidList = stdout.trim().split('\n').filter(line => line.length > 0);
        
        if (pidList.length === 0) {
          console.log('実行中のFFmpegプロセスは見つかりませんでした');
          resolve();
          return;
        }
        
        console.log(`${pidList.length}個のFFmpegプロセスを強制終了します:`, pidList);
        
        // 各プロセスを強制終了
        const killPromises = pidList.map(pid => {
          return new Promise((killResolve) => {
            // PIDの前処理（Windowsの場合CSVフォーマットから抽出）
            let processId = pid;
            if (process.platform === 'win32' && pid.includes(',')) {
              processId = pid.split(',')[1].replace(/"/g, '').trim();
            }
            
            const killCmd = process.platform === 'win32' 
              ? `taskkill /F /T /PID ${processId}` 
              : `kill -9 ${processId}`;
            
            exec(killCmd, (err) => {
              if (err) {
                console.warn(`PID ${processId} の終了に失敗:`, err);
              } else {
                console.log(`PID ${processId} のFFmpegプロセスを終了しました`);
              }
              killResolve();
            });
          });
        });
        
        // すべてのkill処理が完了するのを待つ
        Promise.all(killPromises).then(() => {
          console.log('すべてのFFmpegプロセスの強制終了処理が完了しました');
          resolve();
        });
      });
    });
  }

  /**
   * FFmpegタスクを実行
   */
  processFFmpeg(args, options = {}) {
    const executeRequest = async () => {
      try {
        // リクエストボディの作成
        const requestBody = {
          taskId: `task_${Date.now()}_${Math.floor(Math.random() * 10000)}`, // タスクIDを生成
          args: args
        };
        
        if (options.outputFormat) {
          requestBody.outputFormat = options.outputFormat;
        }
        
        if (options.timeout) {
          requestBody.timeout = options.timeout;
        }
        
        // タスク実行リクエストを送信
        const response = await axios.post(`${this.baseUrl}/process`, requestBody);
        const taskId = response.data.taskId;
        
        // アクティブなタスクリストに追加
        if (taskId) {
          this.activeTaskIds.add(taskId);
        }
        
        // タスク進捗のポーリングを開始
        this._startTaskPolling(taskId);
        
        return response.data;
      } catch (error) {
        console.error('FFmpegタスク実行エラー:', error);
        throw error;
      }
    };
    
    // サービスが起動していない場合は起動
    if (!this.isRunning) {
      return this.start().then(() => executeRequest());
    }
    
    return executeRequest();
  }

  /**
   * タスク状態の取得
   */
  async getTaskStatus(taskId) {
    try {
      const response = await axios.get(`${this.baseUrl}/status/${taskId}`);
      return response.data;
    } catch (error) {
      console.error('FFmpegタスク状態取得エラー:', error);
      return { error: error.message };
    }
  }

  /**
   * サービス準備完了時のコールバック登録
   */
  onReady(callback) {
    if (this.isRunning) {
      // 既に準備完了してている場合は即時実行
      callback();
    } else {
      // 準備中の場合はコールバックリストに追加
      this.onReadyCallbacks.push(callback);
      
      // サービスがまだ起動していない場合は起動
      if (!this.serviceProcess && !this.startPromise) {
        this.start().catch(err => {
          console.error('サービス自動起動エラー:', err);
        });
      }
    }
  }

  /**
   * リクエストを一時保留 (サービス起動前)
   */
  addPendingRequest(requestFunc) {
    this.pendingRequests.push(requestFunc);
  }

  /**
   * 保留中のリクエストを処理
   */
  _processPendingRequests() {
    const requests = [...this.pendingRequests];
    this.pendingRequests = [];
    
    for (const requestFunc of requests) {
      try {
        requestFunc();
      } catch (error) {
        console.error('保留中リクエスト処理エラー:', error);
      }
    }
  }

  /**
   * 準備完了通知
   */
  _notifyReady() {
    const callbacks = [...this.onReadyCallbacks];
    this.onReadyCallbacks = [];
    
    for (const callback of callbacks) {
      try {
        callback();
      } catch (error) {
        console.error('準備完了コールバックエラー:', error);
      }
    }
  }

  /**
   * サービスのヘルスチェック
   */
  async _healthCheck() {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, { timeout: 2000 });
      return response.data.status === 'ok';
    } catch (error) {
      throw new Error('FFmpegサービスが応答していません');
    }
  }

  /**
   * 定期的なヘルスチェックを開始
   */
  _startHealthCheck() {
    this._stopHealthCheck(); // 既存のヘルスチェックを停止
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this._healthCheck();
      } catch (error) {
        console.error('FFmpegサービスヘルスチェックエラー:', error);
        
        // 再起動を試みる
        this.isRunning = false;
        this._stopHealthCheck();
        
        console.log('FFmpegサービスの再起動を試みます...');
        this.start().catch(err => {
          console.error('FFmpegサービス再起動エラー:', err);
        });
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  /**
   * ヘルスチェックを停止
   */
  _stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * タスクをキャンセル
   */
  cancelTask(taskId) {
    // アクティブタスクリストから削除
    this._removeFromActiveTaskList(taskId);

    return new Promise(async (resolve, reject) => {
      try {
        // サービスが起動していない場合はエラー
        if (!this.isRunning) {
          throw new Error('FFmpegサービスが実行されていません');
        }
        
        const response = await axios.post(`${this.baseUrl}/cancel/${taskId}`);
        
        // キャンセル成功時にイベントを発行
        if (response.data && response.data.success) {
          this.emit('task-cancelled', taskId, response.data);
        }
        
        resolve(response.data);
      } catch (error) {
        console.error('FFmpegタスクキャンセルエラー:', error);
        reject(error);
      }
    });
  }

  /**
   * アクティブタスクリストから削除する共通関数
   * @private
   */
  _removeFromActiveTaskList(taskId) {
    if (this.activeTaskIds.has(taskId)) {
      this.activeTaskIds.delete(taskId);
    }
  }

  /**
   * タスク進捗のポーリングを開始
   */
  _startTaskPolling(taskId) {
    const pollInterval = 1000; // 1秒ごとにポーリング
    let interval = null;
    let pollingCount = 0;
    const maxPollingCount = 120; // 2分で最大120回のポーリング（1秒ごと）
    
    console.log(`タスク[${taskId}]のポーリングを開始します`);
    
    const handleTaskCompletion = (status) => {
      clearInterval(interval);
      interval = null;
      this._removeFromActiveTaskList(taskId);
    };
    
    interval = setInterval(async () => {
      try {
        pollingCount++;
        
        // ポーリング回数の上限チェック
        if (pollingCount >= maxPollingCount) {
          console.warn(`タスク[${taskId}]のポーリングが${maxPollingCount}回を超えました。強制終了します`);
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
          
          // タスクを強制的にエラー状態に更新
          this.emit('task-error', taskId, {
            message: 'タスクがタイムアウトしました',
            details: 'ポーリング回数上限を超過したため強制終了'
          });
          
          this._removeFromActiveTaskList(taskId);
          return;
        }
        
        const status = await this.getTaskStatus(taskId);
        
        // 進捗イベントを発行
        if (status.progress !== undefined) {
          this.emit('task-progress', taskId, {
            percent: status.progress,
            details: status.details || null
          });
        }
        
        // タスク完了の場合
        if (status.status === 'completed') {
          console.log(`タスク[${taskId}]が完了しました。ポーリングを停止します。`);
          this.emit('task-completed', taskId, status.result || null);
          handleTaskCompletion(status);
        }
        
        // エラーの場合
        else if (status.status === 'error' || status.status === 'failed') {
          console.log(`タスク[${taskId}]でエラーが発生しました。ポーリングを停止します。`);
          this.emit('task-error', taskId, {
            message: status.error || 'タスクの実行中にエラーが発生しました',
            details: status.details || null
          });
          handleTaskCompletion(status);
        }
        
        // キャンセルの場合
        else if (status.status === 'cancelled') {
          console.log(`タスク[${taskId}]がキャンセルされました。ポーリングを停止します。`);
          this.emit('task-cancelled', taskId);
          handleTaskCompletion(status);
        }
      } catch (error) {
        console.error(`タスク[${taskId}]のポーリングエラー:`, error);
        // エラーが続く場合はポーリングを早めに停止
        pollingCount += 10; // エラーが起きた場合はカウントを増やして早くタイムアウトさせる
      }
    }, pollInterval);
    
    // 強制終了用のタイムアウト (5分)
    setTimeout(() => {
      if (interval) {
        console.warn(`タスク[${taskId}]のポーリングが5分の最大時間を超えました。強制終了します。`);
        clearInterval(interval);
        
        // タスクを強制的にエラー状態に更新
        this.emit('task-error', taskId, {
          message: 'タスクの監視がタイムアウトしました',
          details: '5分間の最大監視時間を超過したため強制終了しました'
        });
        
        this._removeFromActiveTaskList(taskId);
      }
    }, 5 * 60 * 1000);
  }
}

// シングルトンインスタンスをエクスポート
const serviceManager = new FFmpegServiceManager();
module.exports = serviceManager;
