/**
 * FFmpegユーティリティ関数
 * 時間変換やディレクトリ管理などの共通機能を提供
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

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

module.exports = {
  initializeWorkDirectories,
  parseTimeString,
  formatTimeString,
  extractProgressInfo,
  getFFmpegPath
};
