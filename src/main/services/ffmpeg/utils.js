/**
 * FFmpegユーティリティ関数
 * 時間変換やディレクトリ管理などの共通機能を提供
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

/**
 * 作業ディレクトリの初期化
 * @returns {Object} - 作業ディレクトリのパス情報
 */
function initializeWorkDirectories() {
  // ホームディレクトリを取得
  const homeDir = os.homedir();
  
  // ベースとなる作業ディレクトリを定義
  const baseDir = path.join(homeDir, 'Super Watarec');
  
  // 必要なサブディレクトリの定義
  const subDirs = [
    'waveform',   // 波形データ用
    'thumbnails', // サムネイル用
    'temp',       // その他の一時ファイル用
    'logs'        // ログファイル用
  ];
  
  // ベースディレクトリが存在しない場合は作成
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
    console.log(`作業ディレクトリを作成しました: ${baseDir}`);
  }
  
  // 各サブディレクトリが存在しない場合は作成
  const directories = { base: baseDir };
  for (const dir of subDirs) {
    const fullPath = path.join(baseDir, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`サブディレクトリを作成しました: ${fullPath}`);
    }
    directories[dir] = fullPath;
  }
  
  return directories;
}

/**
 * 時間文字列をパース
 * @param {string} timeStr - hh:mm:ss.ms 形式の時間文字列
 * @returns {number} - 秒数
 */
function parseTimeString(timeStr) {
  if (!timeStr) return 0;
  
  const match = timeStr.match(/(\d+):(\d+):(\d+\.\d+)/);
  if (match) {
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseFloat(match[3]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
}

/**
 * 秒数を時間文字列に変換
 * @param {number} seconds - 秒数
 * @returns {string} - hh:mm:ss.ms 形式の時間文字列
 */
function formatTimeString(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * FFmpeg出力から進捗情報を抽出
 * @param {string} output - FFmpegの出力文字列
 * @returns {object|null} - 進捗情報またはnull
 */
function extractProgressInfo(output) {
  let currentTime = 0;
  let duration = 0;
  let progress = 0;
  
  // 現在時間を抽出
  const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const seconds = parseFloat(timeMatch[3]);
    currentTime = hours * 3600 + minutes * 60 + seconds;
  } else {
    return null;
  }
  
  // 総時間を抽出
  const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  if (durationMatch) {
    const dHours = parseInt(durationMatch[1]);
    const dMinutes = parseInt(durationMatch[2]);
    const dSeconds = parseFloat(durationMatch[3]);
    duration = dHours * 3600 + dMinutes * 60 + dSeconds;
  }
  
  // 進捗率を計算
  if (duration > 0) {
    progress = Math.min(Math.round((currentTime / duration) * 100), 99);
  }
  
  return {
    currentTime,
    duration,
    progress,
    output
  };
}

/**
 * FFmpegのパスを取得
 * @returns {string} - FFmpegの実行パス
 * @throws {Error} - FFmpegのパスが設定されていない場合
 */
function getFFmpegPath() {
  const ffmpegPath = global.ffmpegPath;
  if (!ffmpegPath) {
    throw new Error('FFmpegのパスが設定されていません');
  }
  return ffmpegPath;
}

/**
 * FFmpegのバージョン情報を取得
 * @returns {string} - FFmpegのバージョン
 */
function getFFmpegVersion() {
  try {
    const { execSync } = require('child_process');
    const ffmpegPath = getFFmpegPath();
    
    // バージョン情報を取得（-version オプションで実行）
    const versionInfo = execSync(`${ffmpegPath} -version`).toString();
    const versionMatch = versionInfo.match(/version\s+([\d.]+)/i);
    
    return versionMatch ? versionMatch[1] : 'Unknown';
  } catch (error) {
    console.error('FFmpegバージョン取得エラー:', error);
    return 'N/A';
  }
}

/**
 * FFmpegコマンドを実行する関数
 * @param {string[]} args FFmpegコマンドの引数配列
 * @returns {Promise<Object>} 実行結果
 */
function runFFmpegCommand(args) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFFmpegPath();
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
    const ffmpegPath = getFFmpegPath();
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
    try {
      const hwaccelsResult = await runFFmpegCommand([
        '-hide_banner',
        '-loglevel', 'error',
        '-hwaccels'
      ]);
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
      try {
        const encodersResult = await runFFmpegCommand([
          '-hide_banner',
          '-loglevel', 'error',
          '-encoders'
        ]);
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
    return {
      h264: hasVideoToolbox,
      hevc: hasVideoToolbox,
      isHardwareAccelerated: hasVideoToolbox,
      supportedCodecs: hasVideoToolbox ? ['h264_videotoolbox', 'hevc_videotoolbox'] : [],
      hwaccelEngine: hasVideoToolbox ? 'videotoolbox' : null,
      detectionMethod: hasVideoToolbox ? 'composite' : 'none'
    };
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
  initializeWorkDirectories,
  parseTimeString,
  formatTimeString,
  extractProgressInfo,
  getFFmpegPath,
  getFFmpegVersion,
  runFFmpegCommand,
  runFFprobeCommand,
  checkVideoToolboxSupport
};
