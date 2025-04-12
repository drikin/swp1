/**
 * トリミング処理を行うステップクラス
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ExportStep = require('./ExportStep');
const { getFFmpegPath } = require('../../services/ffmpeg/utils');

class TrimStep extends ExportStep {
  /**
   * @param {Object} options - オプション
   */
  constructor(options = {}) {
    super({ name: 'trimming', ...options });
    this.ffmpegProcess = null;
  }
  
  /**
   * トリミングが必要かどうか判定
   * @param {ExportContext} context
   * @returns {boolean} 実行可能かどうか
   */
  canExecute(context) {
    // トリミングが必要なメディアファイルがあるか確認
    return context.mediaFiles.some(file => 
      (file.trimStart !== undefined && file.trimStart > 0) || 
      (file.trimEnd !== undefined && file.trimEnd > 0));
  }
  
  /**
   * トリミング処理を実行
   * @param {ExportContext} context - コンテキスト
   * @param {Function} progressCallback - 進捗コールバック
   * @returns {Promise<ExportContext>} - 更新されたコンテキスト
   */
  async execute(context, progressCallback) {
    console.log('トリミングステップ開始');
    progressCallback(0, { phase: 'trimming_init' });
    
    const trimmedFiles = [];
    const totalFiles = context.mediaFiles.length;
    let processedCount = 0;
    
    for (let i = 0; i < totalFiles; i++) {
      const file = context.mediaFiles[i];
      const fileIndex = i;
      
      progressCallback((processedCount / totalFiles) * 100, { 
        currentFile: i + 1, 
        totalFiles,
        fileName: path.basename(typeof file === 'string' ? file : (file.path || file.filePath || ''))
      });
      
      // ファイルパスを取得
      let filePath = '';
      if (typeof file === 'string') {
        filePath = file;
      } else if (typeof file === 'object' && file !== null) {
        filePath = file.path || file.filePath || '';
      }
      
      if (!filePath || !fs.existsSync(filePath)) {
        console.warn(`警告: ファイル[${i}]が存在しないか、パスが無効です`);
        continue;
      }
      
      // トリミングが必要ない場合は元のファイルを使用
      if ((file.trimStart === undefined || file.trimStart <= 0) && 
          (file.trimEnd === undefined || file.trimEnd <= 0)) {
        trimmedFiles.push(file);
        processedCount++;
        continue;
      }
      
      // 出力ファイル名を設定
      const outputPath = path.join(context.tempDir, `trimmed_${i}_${path.basename(filePath)}`);
      
      try {
        console.log(`ファイル ${path.basename(filePath)} をトリミング中...`);
        // FFmpegでトリミング処理を実行
        await this._trimFile(file, filePath, outputPath, progress => {
          // 単一ファイルの進捗を全体の進捗に変換
          const fileWeight = 1 / totalFiles;
          const overallProgress = ((processedCount * fileWeight) + (progress * fileWeight)) * 100;
          progressCallback(overallProgress, {
            currentFile: i + 1,
            totalFiles,
            fileProgress: progress,
            fileName: path.basename(filePath)
          });
        });
        
        // トリミング後のファイル情報を追加
        const trimmedFile = { 
          ...(typeof file === 'object' ? file : {}), 
          path: outputPath, 
          // トリミング情報はクリア（既に適用済み）
          trimStart: undefined,
          trimEnd: undefined
        };
        
        trimmedFiles.push(trimmedFile);
        context.addWorkingFile(outputPath, { 
          originalFile: filePath,
          type: 'trimmed',
          trimStart: file.trimStart,
          trimEnd: file.trimEnd
        });
        
        console.log(`ファイル ${path.basename(filePath)} のトリミングが完了しました: ${outputPath}`);
      } catch (error) {
        console.error(`ファイル ${path.basename(filePath)} のトリミング中にエラーが発生しました:`, error);
        throw error;
      }
      
      processedCount++;
    }
    
    // コンテキストを更新して次のステップへ
    context.mediaFiles = trimmedFiles;
    context.setMetadata('trimming', { 
      completed: true,
      timestamp: new Date().toISOString()
    });
    
    progressCallback(100, { phase: 'trimming_complete' });
    console.log('トリミングステップ完了');
    
    return context;
  }
  
  /**
   * 単一ファイルのトリミング処理
   * @param {Object|string} fileInfo - ファイル情報
   * @param {string} inputPath - 入力ファイルパス
   * @param {string} outputPath - 出力ファイルパス
   * @param {Function} progressCallback - 進捗コールバック
   * @returns {Promise<void>}
   * @private
   */
  async _trimFile(fileInfo, inputPath, outputPath, progressCallback) {
    return new Promise((resolve, reject) => {
      const trimStart = typeof fileInfo === 'object' ? fileInfo.trimStart : 0;
      const trimEnd = typeof fileInfo === 'object' ? fileInfo.trimEnd : 0;
      
      const ffmpegPath = getFFmpegPath();
      const args = ['-y']; // 出力ファイルを上書き
      
      // 開始位置の指定（秒）
      if (trimStart && trimStart > 0) {
        args.push('-ss', trimStart.toString());
      }
      
      // 入力ファイル
      args.push('-i', inputPath);
      
      // 継続時間の指定（秒）
      if (trimEnd && trimEnd > 0) {
        const duration = trimEnd - (trimStart || 0);
        if (duration > 0) {
          args.push('-t', duration.toString());
        }
      }
      
      // コーデックをコピー（トランスコードしない）
      args.push('-c', 'copy');
      
      // 出力ファイル
      args.push(outputPath);
      
      console.log(`FFmpeg トリミングコマンド: ${ffmpegPath} ${args.join(' ')}`);
      
      this.ffmpegProcess = spawn(ffmpegPath, args);
      
      // 標準出力をログに記録
      this.ffmpegProcess.stdout.on('data', (data) => {
        console.log(`FFmpeg stdout: ${data.toString()}`);
      });
      
      // 進捗情報を解析
      let duration = 0;
      this.ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        console.log(`FFmpeg stderr: ${output}`);
        
        // 動画の総時間を取得
        const durationMatch = output.match(/Duration: (\\d+):(\\d+):(\\d+\\.\\d+)/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1], 10);
          const minutes = parseInt(durationMatch[2], 10);
          const seconds = parseFloat(durationMatch[3]);
          duration = hours * 3600 + minutes * 60 + seconds;
        }
        
        // 進捗情報を解析して更新
        const timeMatch = output.match(/time=(\\d+):(\\d+):(\\d+\\.\\d+)/);
        if (timeMatch && duration > 0) {
          const hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          const seconds = parseFloat(timeMatch[3]);
          const currentTime = hours * 3600 + minutes * 60 + seconds;
          
          // 進捗率を計算
          const progress = Math.min(1, currentTime / duration);
          progressCallback(progress);
        }
      });
      
      // エラーハンドリング
      this.ffmpegProcess.on('error', (err) => {
        console.error('FFmpegプロセスエラー:', err);
        this.ffmpegProcess = null;
        reject(err);
      });
      
      // 完了ハンドリング
      this.ffmpegProcess.on('close', (code) => {
        this.ffmpegProcess = null;
        
        if (code === 0) {
          console.log('FFmpegトリミング処理が正常に完了しました');
          progressCallback(1);
          resolve();
        } else {
          const error = new Error(`FFmpegプロセスが終了コード ${code} で終了しました`);
          console.error(error.message);
          reject(error);
        }
      });
    });
  }
  
  /**
   * ステップをキャンセル
   * @returns {Promise<void>}
   */
  async cancel() {
    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.kill('SIGKILL');
        this.ffmpegProcess = null;
        console.log('トリミングプロセスがキャンセルされました');
      } catch (error) {
        console.error('トリミングプロセスのキャンセルに失敗しました:', error);
      }
    }
  }
}

module.exports = TrimStep;
