/**
 * ラウドネス（音量）の正規化を行うステップクラス
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ExportStep = require('./ExportStep');
const { getFFmpegPath } = require('../../services/ffmpeg/utils');

class NormalizeLoudnessStep extends ExportStep {
  /**
   * @param {Object} options - オプション
   * @param {number} options.targetLoudness - 目標ラウドネス値（LUFS）デフォルトは-14 LUFS（YouTube推奨）
   */
  constructor(options = {}) {
    super({ name: 'loudness_normalization', ...options });
    this.targetLoudness = options.targetLoudness || -14; // YouTube推奨値
    this.ffmpegProcess = null;
  }
  
  /**
   * ラウドネス調整が必要かどうか判定
   * @param {ExportContext} context
   * @returns {boolean} 実行可能かどうか
   */
  canExecute(context) {
    // 一時的にすべてのファイルでラウドネス調整を有効化
    // ※本来はUIから個別にnormalizeLoudnessプロパティを設定すべき
    console.log('ラウドネス調整の実行判定...');
    console.log('グローバル設定:', context.settings.normalizeLoudness, context.settings.targetLoudness);
    
    // 一時的な対応: すべてのファイルでラウドネス調整を有効化
    context.mediaFiles.forEach(file => {
      if (typeof file === 'object') {
        file.normalizeLoudness = true;
      }
    });
    
    return context.mediaFiles.some(file => 
      typeof file === 'object' && file.normalizeLoudness === true
    );
  }
  
  /**
   * ラウドネス正規化処理を実行
   * @param {ExportContext} context - コンテキスト
   * @param {Function} progressCallback - 進捗コールバック
   * @returns {Promise<ExportContext>} - 更新されたコンテキスト
   */
  async execute(context, progressCallback) {
    console.log('ラウドネス正規化ステップ開始');
    progressCallback(0, { phase: 'loudness_init' });
    
    const normalizedFiles = [];
    const totalFiles = context.mediaFiles.length;
    let processedCount = 0;
    
    // 目標ラウドネス値を設定（コンテキストから取得するか、デフォルト値を使用）
    const targetLoudness = context.settings.targetLoudness || this.targetLoudness;
    console.log(`目標ラウドネス: ${targetLoudness} LUFS（YouTube推奨: -14 LUFS）`);
    
    for (let i = 0; i < totalFiles; i++) {
      const file = context.mediaFiles[i];
      
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
      
      // ラウドネス調整が個別に必要かどうかチェック
      const needsNormalization = typeof file === 'object' && file.normalizeLoudness === true;
      if (!needsNormalization) {
        console.log(`ファイル ${path.basename(filePath)} はラウドネス調整が不要なためスキップします`);
        normalizedFiles.push(file);
        processedCount++;
        continue;
      }
      
      // 出力ファイル名を設定
      const outputPath = path.join(context.tempDir, `normalized_${i}_${path.basename(filePath)}`);
      
      try {
        console.log(`ファイル ${path.basename(filePath)} のラウドネスを調整中...`);
        
        // まずファイルのラウドネスを測定
        const loudnessInfo = await this._analyzeLoudness(filePath);
        console.log(`ラウドネス測定結果:`, loudnessInfo);
        
        // 次にラウドネスを正規化
        await this._normalizeLoudness(filePath, outputPath, loudnessInfo, targetLoudness, progress => {
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
        
        // 正規化後のファイル情報を追加
        const normalizedFile = { 
          ...(typeof file === 'object' ? file : {}), 
          path: outputPath,
        };
        
        normalizedFiles.push(normalizedFile);
        context.addWorkingFile(outputPath, { 
          originalFile: filePath,
          type: 'normalized',
          originalLoudness: loudnessInfo.integrated,
          targetLoudness: targetLoudness
        });
        
        console.log(`ファイル ${path.basename(filePath)} のラウドネス調整が完了しました: ${outputPath}`);
      } catch (error) {
        console.error(`ファイル ${path.basename(filePath)} のラウドネス調整中にエラーが発生しました:`, error);
        throw error;
      }
      
      processedCount++;
    }
    
    // コンテキストを更新して次のステップへ
    context.mediaFiles = normalizedFiles;
    context.setMetadata('loudness_normalization', { 
      completed: true,
      timestamp: new Date().toISOString(),
      targetLoudness: targetLoudness
    });
    
    progressCallback(100, { phase: 'loudness_complete' });
    console.log('ラウドネス正規化ステップ完了');
    
    return context;
  }
  
  /**
   * ファイルのラウドネスを測定
   * @param {string} filePath - 入力ファイルパス
   * @returns {Promise<Object>} - ラウドネス情報
   * @private
   */
  async _analyzeLoudness(filePath) {
    return new Promise((resolve, reject) => {
      const ffmpegPath = getFFmpegPath();
      
      // FFmpegでラウドネス分析
      const args = [
        '-i', filePath,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
        '-f', 'null',
        '-'
      ];
      
      console.log(`ラウドネス測定コマンド: ${ffmpegPath} ${args.join(' ')}`);
      
      const process = spawn(ffmpegPath, args);
      
      let stderr = '';
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          // ラウドネス情報を抽出
          try {
            // JSONデータを抽出（stderr内の最後のJSONブロック）
            const jsonMatch = stderr.match(/\{[\s\S]*?\}(?!\s*[\},])/g);
            let loudnessData = null;
            
            if (jsonMatch && jsonMatch.length > 0) {
              // 最後のJSONブロックを使用
              const jsonStr = jsonMatch[jsonMatch.length - 1];
              loudnessData = JSON.parse(jsonStr);
              
              const result = {
                integrated: parseFloat(loudnessData.input_i || '-24'),
                truePeak: parseFloat(loudnessData.input_tp || '-1'),
                lra: parseFloat(loudnessData.input_lra || '0'),
                threshold: parseFloat(loudnessData.input_thresh || '-34'),
                raw: loudnessData
              };
              
              console.log(`ラウドネス分析結果: 統合ラウドネス=${result.integrated} LUFS, トゥルーピーク=${result.truePeak} dB`);
              resolve(result);
            } else {
              console.warn('ラウドネス分析結果からJSONデータを抽出できませんでした');
              // デフォルト値を使用
              resolve({
                integrated: -24,
                truePeak: -1,
                lra: 0,
                threshold: -34
              });
            }
          } catch (error) {
            console.error('ラウドネス分析結果の解析に失敗しました:', error);
            reject(error);
          }
        } else {
          console.error(`ラウドネス分析が終了コード ${code} で失敗しました`);
          reject(new Error(`ラウドネス分析プロセスが終了コード ${code} で終了しました`));
        }
      });
      
      process.on('error', (err) => {
        console.error('ラウドネス分析プロセスエラー:', err);
        reject(err);
      });
    });
  }
  
  /**
   * ラウドネスを正規化
   * @param {string} inputPath - 入力ファイルパス
   * @param {string} outputPath - 出力ファイルパス
   * @param {Object} loudnessInfo - ラウドネス測定情報
   * @param {number} targetLoudness - 目標ラウドネス値
   * @param {Function} progressCallback - 進捗コールバック
   * @returns {Promise<void>}
   * @private
   */
  async _normalizeLoudness(inputPath, outputPath, loudnessInfo, targetLoudness, progressCallback) {
    return new Promise((resolve, reject) => {
      const ffmpegPath = getFFmpegPath();
      
      // 調整量を計算 (現在のラウドネスと目標ラウドネスの差)
      const currentLoudness = loudnessInfo.integrated;
      const adjustmentDB = targetLoudness - currentLoudness;
      
      console.log(`ラウドネス調整量: ${adjustmentDB.toFixed(2)} dB（${currentLoudness.toFixed(2)} LUFS → ${targetLoudness.toFixed(2)} LUFS）`);
      
      // ラウドネス調整が必要ない場合 (差が±0.5dB以内)
      if (Math.abs(adjustmentDB) < 0.5) {
        console.log('ラウドネス調整量が小さいため、変更なしでコピーします');
        // 単純コピー
        const copyArgs = [
          '-y',
          '-i', inputPath,
          '-c', 'copy',
          outputPath
        ];
        
        this.ffmpegProcess = spawn(ffmpegPath, copyArgs);
        
        this.ffmpegProcess.on('close', (code) => {
          this.ffmpegProcess = null;
          if (code === 0) {
            console.log('ファイルコピーが完了しました');
            progressCallback(1);
            resolve();
          } else {
            reject(new Error(`ファイルコピーが終了コード ${code} で失敗しました`));
          }
        });
        
        return;
      }
      
      // FFmpegでラウドネス正規化
      // loudnormフィルタを2パス目で使用（測定値をもとに正規化）
      const args = [
        '-y',
        '-i', inputPath,
        '-af', `volume=${adjustmentDB}dB`,
        '-c:v', 'copy', // ビデオをそのままコピー
        '-c:a', 'aac', // 音声はAACにエンコード
        '-b:a', '192k', // 音声ビットレート
        outputPath
      ];
      
      console.log(`ラウドネス正規化コマンド: ${ffmpegPath} ${args.join(' ')}`);
      
      this.ffmpegProcess = spawn(ffmpegPath, args);
      
      // 標準出力をログに記録
      this.ffmpegProcess.stdout.on('data', (data) => {
        console.log(`FFmpeg stdout: ${data.toString()}`);
      });
      
      // 進捗情報を解析
      let duration = 0;
      this.ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        
        // 動画の総時間を取得
        const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1], 10);
          const minutes = parseInt(durationMatch[2], 10);
          const seconds = parseFloat(durationMatch[3]);
          duration = hours * 3600 + minutes * 60 + seconds;
        }
        
        // 進捗情報を解析して更新
        const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
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
        console.error('ラウドネス正規化プロセスエラー:', err);
        this.ffmpegProcess = null;
        reject(err);
      });
      
      // 完了ハンドリング
      this.ffmpegProcess.on('close', (code) => {
        this.ffmpegProcess = null;
        
        if (code === 0) {
          console.log('ラウドネス正規化処理が正常に完了しました');
          progressCallback(1);
          resolve();
        } else {
          const error = new Error(`ラウドネス正規化プロセスが終了コード ${code} で終了しました`);
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
        console.log('ラウドネス正規化プロセスがキャンセルされました');
      } catch (error) {
        console.error('ラウドネス正規化プロセスのキャンセルに失敗しました:', error);
      }
    }
  }
}

module.exports = NormalizeLoudnessStep;
