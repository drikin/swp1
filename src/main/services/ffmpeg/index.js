/**
 * FFmpegサービスモジュール
 * FFmpegを使用した処理機能を提供するモジュール
 */
const FFmpegServiceCore = require('./core');
const FFmpegTaskManager = require('./task-manager');
const utils = require('./utils');

// FFmpegServiceのシングルトンインスタンス
let instance = null;

/**
 * FFmpegServiceのシングルトンインスタンスを取得
 * @returns {FFmpegServiceCore} - FFmpegServiceのインスタンス
 */
function getFFmpegService() {
  if (!instance) {
    instance = new FFmpegServiceCore();
  }
  return instance;
}

// モジュールエクスポート
module.exports = {
  getFFmpegService,
  FFmpegServiceCore,
  FFmpegTaskManager,
  utils
};
