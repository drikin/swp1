/**
 * media-operations.js
 * メディア操作関連の機能を提供
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { getFFmpegService, utils } = require('../services/ffmpeg/index');
const { runFFprobeCommand } = utils;
const ffmpegService = getFFmpegService();

/**
 * メディア情報を取得
 * @param {string} filePath メディアファイルのパス
 * @returns {Promise<Object>} メディア情報
 */
async function getMediaInfo(filePath) {
  try {
    // FFprobeでメディア情報を取得
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ];
    
    const result = await runFFprobeCommand(args);
    
    if (!result.success) {
      throw new Error(`メディア情報取得エラー: ${result.stderr || 'Unknown error'}`);
    }
    
    const { data } = result;
    
    // ビデオストリームとオーディオストリームを取得
    const videoStream = data.streams.find(stream => stream.codec_type === 'video');
    const audioStream = data.streams.find(stream => stream.codec_type === 'audio');
    
    // フレームレートを安全に計算（evalを使わない）
    const calculateFrameRate = (rateStr) => {
      if (!rateStr) return null;
      const parts = rateStr.split('/');
      if (parts.length !== 2) return null;
      const num = parseInt(parts[0], 10);
      const den = parseInt(parts[1], 10);
      return den === 0 ? null : num / den;
    };
    
    // メディア情報を整形
    const mediaInfo = {
      path: filePath,
      name: path.basename(filePath),
      format: data.format.format_name,
      duration: parseFloat(data.format.duration),
      size: parseInt(data.format.size, 10),
      bitrate: parseInt(data.format.bit_rate, 10),
      video: videoStream ? {
        codec: videoStream.codec_name,
        width: parseInt(videoStream.width, 10),
        height: parseInt(videoStream.height, 10),
        frameRate: calculateFrameRate(videoStream.r_frame_rate),
        bitrate: videoStream.bit_rate ? parseInt(videoStream.bit_rate, 10) : null
      } : null,
      audio: audioStream ? {
        codec: audioStream.codec_name,
        channels: audioStream.channels,
        sampleRate: parseInt(audioStream.sample_rate, 10),
        bitrate: audioStream.bit_rate ? parseInt(audioStream.bit_rate, 10) : null
      } : null
    };
    
    return {
      success: true,
      ...mediaInfo  // mediaInfoの内容を直接トップレベルに展開
    };
  } catch (error) {
    console.error('メディア情報取得エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * サムネイルを生成する関数
 * @param {Object|string} pathOrParams ファイルパスまたはパラメータオブジェクト
 * @param {string} [fileId] ファイルID
 * @returns {Promise<Object>} 生成結果
 */
async function generateThumbnail(pathOrParams, fileId) {
  try {
    // パラメータの準備
    const params = typeof pathOrParams === 'string'
      ? { filePath: pathOrParams }
      : pathOrParams;
    
    const {
      filePath,
      timestamp = 0,
      width = 320,
      height = 180,
      quality = 90
    } = params;
    
    // ファイルIDの生成（指定がない場合）
    const id = fileId || path.basename(filePath, path.extname(filePath));
    
    // 作業ディレクトリの取得
    const thumbnailDir = path.join(os.homedir(), 'Super Watarec', 'thumbnails');
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }
    
    // 出力ファイルパス
    const outputPath = path.join(thumbnailDir, `${id}_${timestamp}_${Date.now()}.jpg`);
    
    // FFmpegコマンドの引数作成
    const ffmpegArgs = [
      '-ss', `${timestamp}`,
      '-i', filePath,
      '-vf', `scale=${width}:${height}`,
      '-vframes', '1',
      '-q:v', `${Math.round(31 - (quality * 0.31))}`,
      '-f', 'image2',
      '-y', outputPath
    ];
    
    // FFmpegサービスを使用してサムネイル生成を開始
    const taskResult = await ffmpegService.processFFmpeg(ffmpegArgs);
    
    // タスクステータスの監視を開始
    let isCompleted = false;
    let taskStatus = null;
    
    while (!isCompleted) {
      // 500ms待機
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // タスクステータスの取得
      taskStatus = await ffmpegService.getTaskStatus(taskResult.taskId);
      
      if (taskStatus.status === 'completed') {
        isCompleted = true;
      } else if (taskStatus.status === 'failed' || taskStatus.status === 'error') {
        throw new Error(`サムネイル生成エラー: ${taskStatus.stderr || 'Unknown error'}`);
      }
    }
    
    console.log('サムネイル生成完了:', outputPath);
    
    // 結果を返す
    return {
      success: true,
      thumbnailPath: outputPath,
      timestamp: timestamp,
      width: width,
      height: height
    };
  } catch (error) {
    console.error('サムネイル生成エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 波形データを生成する関数
 * @param {string} filePath メディアファイルのパス
 * @param {string} [outputPath] 出力ファイルパス（オプション）
 * @returns {Promise<Object>} 生成結果
 */
async function generateWaveform(filePath, outputPath) {
  try {
    // 作業ディレクトリの取得
    const workDir = path.join(os.homedir(), 'Super Watarec');
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }
    
    // 出力ファイルパスの設定
    const fileId = path.basename(filePath, path.extname(filePath));
    const waveformPath = outputPath || path.join(workDir, `${fileId}_waveform_${Date.now()}.json`);
    
    // FFmpegコマンドの引数作成
    const ffmpegArgs = [
      '-i', filePath,
      '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
      '-f', 'null',
      '-'
    ];
    
    // FFmpegサービスを使用して波形データ生成を開始
    const taskResult = await ffmpegService.processFFmpeg(ffmpegArgs);
    
    // タスクステータスの監視を開始
    let isCompleted = false;
    let taskStatus = null;
    
    while (!isCompleted) {
      // 500ms待機
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // タスクステータスの取得
      taskStatus = await ffmpegService.getTaskStatus(taskResult.taskId);
      
      if (taskStatus.status === 'completed') {
        isCompleted = true;
      } else if (taskStatus.status === 'failed' || taskStatus.status === 'error') {
        throw new Error(`波形データ生成エラー: ${taskStatus.stderr || 'Unknown error'}`);
      }
    }
    
    // 波形データの抽出と解析
    const waveformData = parseWaveformData(taskStatus.stderr);
    
    // 結果をJSONファイルに保存
    fs.writeFileSync(waveformPath, JSON.stringify(waveformData, null, 2));
    
    console.log('波形データ生成完了:', waveformPath);
    
    // 結果を返す
    return {
      success: true,
      waveformPath: waveformPath,
      waveformData: waveformData
    };
  } catch (error) {
    console.error('波形データ生成エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 波形データを解析する内部関数
 * @private
 * @param {string} output FFmpegの出力テキスト
 * @returns {Array} 波形データの配列
 */
function parseWaveformData(output) {
  // より効率的な一回のスキャンでレベルを抽出
  const regex = /lavfi\.astats\.Overall\.RMS_level=([+-]?\d+\.?\d*)/g;
  const levels = [];
  let match;
  
  while ((match = regex.exec(output)) !== null) {
    const level = parseFloat(match[1]);
    
    // dB値を0-1の範囲に正規化（一般的なオーディオの範囲を考慮）
    // -60dB～0dBの範囲を想定
    const normalizedLevel = Math.max(0, Math.min(1, (level + 60) / 60));
    levels.push(normalizedLevel);
  }
  
  // サンプル数が多すぎる場合、間引きを行う
  if (levels.length > 1000) {
    const factor = Math.ceil(levels.length / 1000);
    return levels.filter((_, i) => i % factor === 0);
  }
  
  return levels;
}

module.exports = {
  getMediaInfo,
  generateThumbnail,
  generateWaveform
};
