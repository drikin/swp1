/**
 * ffmpeg-service-manager.js
 * FFmpegサービスプロセスを管理するためのクラス
 */
const { spawn } = require('child_process');
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
    
    // サービス起動コマンドのパス
    this.servicePath = path.join(__dirname, 'ffmpeg-service.js');
    
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
        // サービスが既に実行中かチェック
        if (this.isRunning) {
          console.log('FFmpegサービスは既に実行中です');
          resolve(true);
          return;
        }
        
        // サービスのヘルスチェックを試行
        try {
          await this._healthCheck();
          console.log('既存のFFmpegサービスが見つかりました、新しいプロセスは起動しません');
          this.isRunning = true;
          this._startHealthCheck();
          resolve(true);
          return;
        } catch (err) {
          // ヘルスチェックが失敗した場合は新しいプロセスを起動
          console.log('既存のFFmpegサービスが見つかりません、新しいプロセスを起動します');
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
        
        while (!isReady && (Date.now() - startTime) < SERVICE_START_TIMEOUT) {
          try {
            await new Promise(r => setTimeout(r, 500)); // 500ms待機
            await this._healthCheck();
            isReady = true;
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
    return new Promise((resolve) => {
      if (!this.isRunning || !this.serviceProcess) {
        console.log('FFmpegサービスは実行されていません');
        this.isRunning = false;
        resolve(true);
        return;
      }
      
      console.log('FFmpegサービスを停止しています...');
      this._stopHealthCheck();
      
      // Windowsでは異なる終了方法が必要
      if (process.platform === 'win32') {
        try {
          process.kill(this.serviceProcess.pid);
        } catch (err) {
          console.error('FFmpegサービス終了エラー:', err);
        }
      } else {
        // SIGTERMシグナルを送信
        try {
          process.kill(-this.serviceProcess.pid, 'SIGTERM');
        } catch (err) {
          console.error('FFmpegサービス終了エラー:', err);
        }
      }
      
      // プロセスの終了を待機
      let waitTimeout = setTimeout(() => {
        console.log('FFmpegサービス終了待機タイムアウト、強制終了します');
        try {
          process.kill(-this.serviceProcess.pid, 'SIGKILL');
        } catch (err) {
          console.error('FFmpegサービス強制終了エラー:', err);
        }
        this.isRunning = false;
        this.serviceProcess = null;
        resolve(true);
      }, 5000); // 5秒待機
      
      this.serviceProcess.on('close', () => {
        clearTimeout(waitTimeout);
        console.log('FFmpegサービスは正常に終了しました');
        this.isRunning = false;
        this.serviceProcess = null;
        resolve(true);
      });
    });
  }
  
  /**
   * FFmpegタスクを実行
   */
  async processFFmpeg(args, options = {}) {
    // サービス準備確認
    if (!this.isRunning) {
      try {
        await this.start();
      } catch (error) {
        return { error: 'FFmpegサービスの起動に失敗しました: ' + error.message };
      }
    }
    
    try {
      // タスクIDの生成
      const taskId = `task-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      
      // タスク作成イベントを発行
      this.emit('task-created', taskId, {
        ...options,
        command: args.join(' '),
        type: options.type || 'encode'
      });
      
      // FFmpegタスクリクエスト
      const response = await axios.post(`${this.baseUrl}/process`, {
        taskId,
        args,
        options
      });
      
      // タスク進捗を監視するためのポーリング
      this._startTaskPolling(taskId);
      
      return { taskId, ...response.data };
    } catch (error) {
      console.error('FFmpeg処理リクエストエラー:', error);
      return { error: error.message };
    }
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
      // 既に準備完了している場合は即時実行
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
  async cancelTask(taskId) {
    try {
      const response = await axios.post(`${this.baseUrl}/cancel/${taskId}`);
      
      // キャンセル成功時にイベントを発行
      if (response.data && response.data.success) {
        this.emit('task-cancelled', taskId, response.data);
      }
      
      return response.data;
    } catch (error) {
      console.error('FFmpegタスクキャンセルエラー:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * タスク進捗のポーリングを開始
   */
  _startTaskPolling(taskId) {
    const pollInterval = 1000; // 1秒ごとにポーリング
    let interval = setInterval(async () => {
      try {
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
          this.emit('task-completed', taskId, status.result || null);
          clearInterval(interval);
        }
        
        // エラーの場合
        else if (status.status === 'error') {
          this.emit('task-error', taskId, {
            message: status.error || 'タスクの実行中にエラーが発生しました',
            details: status.details || null
          });
          clearInterval(interval);
        }
        
        // キャンセルの場合
        else if (status.status === 'cancelled') {
          this.emit('task-cancelled', taskId);
          clearInterval(interval);
        }
      } catch (error) {
        console.error(`タスク[${taskId}]のポーリングエラー:`, error);
        // エラーが続くようならポーリング停止を検討
      }
    }, pollInterval);
    
    // 5分後に強制停止（無限ポーリングを避ける）
    setTimeout(() => {
      if (interval) {
        clearInterval(interval);
        console.log(`タスク[${taskId}]のポーリングがタイムアウトで停止されました`);
      }
    }, 5 * 60 * 1000);
  }
}

// シングルトンインスタンスをエクスポート
const serviceManager = new FFmpegServiceManager();
module.exports = serviceManager;
