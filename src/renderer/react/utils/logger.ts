/**
 * アプリケーションロガーユーティリティ
 * 環境に応じたログ出力レベルとフォーマットを提供します
 */

// ログレベルの定義
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

// 現在の環境のログレベル (開発モードではDEBUG、それ以外ではINFO)
const currentLevel = (process.env.NODE_ENV === 'development' || 
                      window.location.search.includes('debug=true')) 
  ? LogLevel.DEBUG 
  : LogLevel.INFO;

// カラー設定（コンソール出力用）
const colors = {
  debug: '#7986cb', // インディゴ
  info: '#4caf50',  // グリーン
  warn: '#ff9800',  // オレンジ
  error: '#f44336', // レッド
};

// タイムスタンプの生成
const timestamp = () => {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
};

// メインのロガーオブジェクト
export const Logger = {
  /**
   * デバッグレベルのログを出力
   * 主に開発中のみ使用
   */
  debug: (module: string, message: string, data?: any) => {
    if (currentLevel <= LogLevel.DEBUG) {
      console.log(
        `%c[DEBUG] ${timestamp()} [${module}]`, 
        `color: ${colors.debug}; font-weight: bold`, 
        message, 
        data !== undefined ? data : ''
      );
    }
  },

  /**
   * 情報レベルのログを出力
   * 一般的な情報やステータスを表示
   */
  info: (module: string, message: string, data?: any) => {
    if (currentLevel <= LogLevel.INFO) {
      console.log(
        `%c[INFO] ${timestamp()} [${module}]`, 
        `color: ${colors.info}; font-weight: bold`, 
        message, 
        data !== undefined ? data : ''
      );
    }
  },

  /**
   * 警告レベルのログを出力
   * エラーではないが注意が必要な状況を表示
   */
  warn: (module: string, message: string, data?: any) => {
    if (currentLevel <= LogLevel.WARN) {
      console.warn(
        `%c[WARN] ${timestamp()} [${module}]`, 
        `color: ${colors.warn}; font-weight: bold`, 
        message, 
        data !== undefined ? data : ''
      );
    }
  },

  /**
   * エラーレベルのログを出力
   * アプリケーションが正常に動作しない問題を表示
   */
  error: (module: string, message: string, error?: any) => {
    if (currentLevel <= LogLevel.ERROR) {
      console.error(
        `%c[ERROR] ${timestamp()} [${module}]`, 
        `color: ${colors.error}; font-weight: bold`, 
        message, 
        error
      );
    }
  },
};

// デフォルトエクスポート
export default Logger;
