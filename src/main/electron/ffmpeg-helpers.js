/**
 * ffmpeg-helpers.js
 * FFmpeg関連のユーティリティ関数を提供
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * FFmpegコマンドを実行する関数
 * @param {string[]} args FFmpegコマンドの引数配列
 * @returns {Promise<Object>} 実行結果
 */
function runFFmpegCommand(args) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = global.ffmpegPath;
    console.log('Running FFmpeg command:', `${ffmpegPath} ${args.join(' ')}`);
    
    const ffmpegProcess = spawn(ffmpegPath, args);
    let stdoutData = '';
    let stderrData = '';
    
    ffmpegProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    ffmpegProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      // FFmpeg は進捗情報も stderr に出力するため、ここでエラーとしては扱わない
    });
    
    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true, 
          stdout: stdoutData,
          stderr: stderrData
        });
      } else {
        reject({
          success: false,
          code,
          stdout: stdoutData,
          stderr: stderrData,
          error: `FFmpeg process exited with code ${code}`
        });
      }
    });
    
    ffmpegProcess.on('error', (err) => {
      reject({
        success: false,
        error: err.message
      });
    });
  });
}

/**
 * FFprobeコマンドを実行する関数（メタデータ取得用）
 * @param {string[]} args FFprobeコマンドの引数配列
 * @returns {Promise<Object>} 実行結果
 */
function runFFprobeCommand(args) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = global.ffmpegPath;
    const ffprobePath = ffmpegPath.replace('ffmpeg', 'ffprobe');
    
    console.log('Running FFprobe command:', `${ffprobePath} ${args.join(' ')}`);
    
    const ffprobeProcess = spawn(ffprobePath, args);
    let stdoutData = '';
    let stderrData = '';
    
    ffprobeProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    ffprobeProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    ffprobeProcess.on('close', (code) => {
      if (code === 0) {
        try {
          // FFprobeの出力がJSON形式の場合はパース
          const isJson = args.includes('-print_format') && args.includes('json');
          const result = isJson ? JSON.parse(stdoutData) : stdoutData;
          
          resolve({
            success: true,
            data: result,
            stdout: stdoutData,
            stderr: stderrData
          });
        } catch (error) {
          reject({
            success: false,
            error: `Failed to parse FFprobe output: ${error.message}`,
            stdout: stdoutData,
            stderr: stderrData
          });
        }
      } else {
        reject({
          success: false,
          code,
          stdout: stdoutData,
          stderr: stderrData,
          error: `FFprobe process exited with code ${code}`
        });
      }
    });
    
    ffprobeProcess.on('error', (err) => {
      reject({
        success: false,
        error: err.message
      });
    });
  });
}

/**
 * HWアクセラレーション（VideoToolbox）のサポート状況を確認
 * @returns {Promise<Object>} ハードウェアアクセラレーションのサポート情報
 */
async function checkVideoToolboxSupport() {
  try {
    let hasVideoToolbox = false;
    
    // 方法1: -hwaccelsで確認
    const hwaccelsArgs = [
      '-hide_banner',
      '-loglevel', 'error',
      '-hwaccels'
    ];
    
    let hwaccelsResult = null;
    try {
      hwaccelsResult = await runFFmpegCommand(hwaccelsArgs);
      const hwaccelList = hwaccelsResult.stdout.split('\n').map(line => line.trim()).filter(Boolean);
      
      if (hwaccelList.includes('videotoolbox')) {
        console.log('VideoToolbox対応を-hwaccelsで確認しました');
        hasVideoToolbox = true;
      }
    } catch (error) {
      console.warn('-hwaccelsでの確認に失敗:', error);
    }
    
    // 方法2: エンコーダー一覧で確認（VideoToolboxが見つからない場合）
    if (!hasVideoToolbox) {
      const encodersArgs = [
        '-hide_banner',
        '-loglevel', 'error',
        '-encoders'
      ];
      
      let encodersResult = null;
      try {
        encodersResult = await runFFmpegCommand(encodersArgs);
        const encodersList = encodersResult.stdout;
        
        if (encodersList.includes('h264_videotoolbox') || encodersList.includes('hevc_videotoolbox')) {
          console.log('VideoToolbox対応をエンコーダー一覧で確認しました');
          hasVideoToolbox = true;
        }
      } catch (error) {
        console.warn('エンコーダー一覧での確認に失敗:', error);
      }
    }
    
    // 方法3: OSによる判定（最終手段）
    const isMac = process.platform === 'darwin';
    if (!hasVideoToolbox && isMac) {
      // macOSなら基本的にVideoToolboxが使える
      console.log('OS検出によりmacOSを検出、VideoToolboxが利用可能と仮定します');
      hasVideoToolbox = true;
    }
    
    // 結果を返す
    const hwaccelSupport = {
      h264: hasVideoToolbox,
      hevc: hasVideoToolbox,
      isHardwareAccelerated: hasVideoToolbox,
      supportedCodecs: hasVideoToolbox ? ['h264_videotoolbox', 'hevc_videotoolbox'] : [],
      hwaccelEngine: hasVideoToolbox ? 'videotoolbox' : null,
      detectionMethod: hasVideoToolbox ? 
        (hwaccelsResult?.stdout?.includes('videotoolbox') ? 'hwaccels' : 
         (encodersResult?.stdout?.includes('videotoolbox') ? 'encoders' : 'os-detection')) : 'none'
    };
    
    console.log('VideoToolbox対応状況（複合検出）:', hwaccelSupport);
    return hwaccelSupport;
  } catch (error) {
    console.warn('ハードウェアエンコード対応確認エラー:', error);
    // macOSのデフォルト値
    const isMac = process.platform === 'darwin';
    return { 
      h264: isMac, 
      hevc: isMac, 
      isHardwareAccelerated: isMac,
      supportedCodecs: isMac ? ['h264_videotoolbox', 'hevc_videotoolbox'] : [],
      hwaccelEngine: isMac ? 'videotoolbox' : null,
      detectionMethod: 'fallback'
    };
  }
}

module.exports = {
  runFFmpegCommand,
  runFFprobeCommand,
  checkVideoToolboxSupport
};
