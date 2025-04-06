/**
 * ffmpeg-service.js
 * FFmpegをマイクロサービスとして実行するための独立したプロセス
 */
const express = require('express');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.FFMPEG_SERVICE_PORT || 3001;

// FFmpegパスの設定
let ffmpegPath;
try {
  // システムのFFmpegパスを動的に取得
  const { execSync } = require('child_process');
  ffmpegPath = execSync('which ffmpeg').toString().trim();
  console.log('システムのFFmpegを使用します:', ffmpegPath);
} catch (error) {
  console.error('システムにFFmpegが見つかりません:', error);
  ffmpegPath = 'ffmpeg'; // 環境変数PATHから検索する
}

app.use(bodyParser.json({ limit: '50mb' }));

// FFmpegタスクのキューと状態管理
const taskQueue = new Map();

// サーバー起動状態のフラグ
let isServerReady = false;

/**
 * タスク実行キュー
 */
class TaskQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  // タスクをキューに追加
  addTask(task) {
    this.queue.push(task);
    this.processNext();
  }

  // 次のタスクを処理
  async processNext() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const task = this.queue.shift();
    
    try {
      await task();
    } catch (error) {
      console.error('タスク実行エラー:', error);
    }
    
    this.processing = false;
    this.processNext();
  }
}

const executionQueue = new TaskQueue();

/**
 * FFmpegタスク処理の実行
 */
function processFFmpegTask(taskId, args, options = {}) {
  return new Promise((resolve, reject) => {
    // タスク状態を「処理中」に更新
    taskQueue.set(taskId, { 
      status: 'processing', 
      progress: 0, 
      startTime: Date.now(),
      args
    });
    
    console.log(`[${taskId}] FFmpeg実行:`, args.join(' '));

    // 入力ファイルの継続時間を取得（進捗計算用）
    let totalDuration = options.duration || 0;
    
    const process = spawn(ffmpegPath, args);
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      
      // 標準出力の更新
      const currentTask = taskQueue.get(taskId);
      if (currentTask) {
        taskQueue.set(taskId, { 
          ...currentTask,
          stdout: stdout
        });
      }
    });
    
    process.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      
      // 継続時間情報の抽出（初回のみ）
      if (totalDuration === 0) {
        const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1], 10);
          const minutes = parseInt(durationMatch[2], 10);
          const seconds = parseFloat(durationMatch[3]);
          totalDuration = (hours * 3600) + (minutes * 60) + seconds;
          
          console.log(`[${taskId}] 検出された継続時間:`, totalDuration, '秒');
        }
      }
      
      // 進捗情報の抽出
      const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch && totalDuration > 0) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseFloat(timeMatch[3]);
        const currentTime = (hours * 3600) + (minutes * 60) + seconds;
        
        // 進捗率を計算（0-100）
        const progress = Math.min(Math.round((currentTime / totalDuration) * 100), 100);
        
        // タスク状態の更新
        const currentTask = taskQueue.get(taskId);
        if (currentTask) {
          taskQueue.set(taskId, { 
            ...currentTask,
            progress,
            currentTime,
            totalDuration,
            stderr: stderr,
            lastOutput: output
          });
        }
      }
    });
    
    process.on('close', (code) => {
      console.log(`[${taskId}] FFmpegプロセス終了コード:`, code);
      
      // 処理完了または失敗の状態更新
      const endTime = Date.now();
      const currentTask = taskQueue.get(taskId);
      
      if (currentTask) {
        const processingTime = endTime - currentTask.startTime;
        
        taskQueue.set(taskId, {
          ...currentTask,
          status: code === 0 ? 'completed' : 'failed',
          progress: code === 0 ? 100 : currentTask.progress || 0,
          stdout,
          stderr,
          exitCode: code,
          processingTime,
          endTime
        });
      }
      
      if (code === 0) {
        resolve({ success: true, stdout, stderr });
      } else {
        reject(new Error(`FFmpeg process exited with code ${code}: ${stderr}`));
      }
    });
    
    process.on('error', (err) => {
      console.error(`[${taskId}] FFmpegプロセスエラー:`, err);
      
      // エラー状態の更新
      const currentTask = taskQueue.get(taskId);
      if (currentTask) {
        taskQueue.set(taskId, {
          ...currentTask,
          status: 'error',
          error: err.message,
          stderr: stderr + '\n' + err.message
        });
      }
      
      reject(err);
    });
  });
}

/**
 * FFmpeg処理リクエスト受付API
 */
app.post('/process', (req, res) => {
  const { taskId, args, options } = req.body;
  
  if (!taskId || !args || !Array.isArray(args)) {
    return res.status(400).json({ 
      error: '無効なリクエスト形式です。taskIdとargsが必要です。' 
    });
  }
  
  // タスク登録と即時レスポンス
  taskQueue.set(taskId, { status: 'queued', progress: 0 });
  res.json({ taskId, status: 'accepted' });
  
  // 非同期でFFmpeg処理をキューに追加
  executionQueue.addTask(async () => {
    try {
      await processFFmpegTask(taskId, args, options);
    } catch (error) {
      console.error(`[${taskId}] タスク実行エラー:`, error);
      // エラー状態はprocessFFmpegTask内で設定済み
    }
  });
});

/**
 * タスク状態取得API
 */
app.get('/status/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = taskQueue.get(taskId);
  
  if (!task) {
    return res.status(404).json({ error: 'タスクが見つかりません' });
  }
  
  // 重いデータは返さない（stdout, stderrはサイズが大きくなる可能性がある）
  const { stdout, stderr, ...safeTask } = task;
  
  // 最後の出力の一部だけを返す（デバッグ用）
  if (stderr) {
    const lines = stderr.split('\n');
    safeTask.recentOutput = lines.slice(Math.max(0, lines.length - 5)).join('\n');
  }
  
  res.json(safeTask);
});

/**
 * タスクキャンセルAPI
 */
app.post('/cancel/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = taskQueue.get(taskId);
  
  if (!task) {
    return res.status(404).json({ error: 'タスクが見つかりません' });
  }
  
  // TODO: 実行中のFFmpegプロセスを終了させる実装
  // 現在の実装ではまだサポートされていません
  
  res.json({ taskId, status: 'cancel_requested' });
});

/**
 * サーバーのヘルスチェックAPI
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    uptime: process.uptime(),
    taskCount: taskQueue.size
  });
});

// サーバー起動
const server = app.listen(PORT, () => {
  console.log(`FFmpegサービスがポート${PORT}で起動しました`);
  isServerReady = true;
});

// プロセス終了時の処理
process.on('SIGTERM', () => {
  console.log('SIGTERMを受信、シャットダウンします...');
  server.close(() => {
    console.log('サーバーを正常に終了しました');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINTを受信、シャットダウンします...');
  server.close(() => {
    console.log('サーバーを正常に終了しました');
    process.exit(0);
  });
});

module.exports = {
  isServerReady
};
