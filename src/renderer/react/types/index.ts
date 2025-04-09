/**
 * 型定義のエントリーポイント
 * すべての型定義をここからエクスポートして、一貫した型システムを提供します
 */

// すべての型をエクスポート
export * from './tasks';
export * from './media';
export * from './api';

// グローバル拡張の型宣言（global.d.tsの代わり）
declare global {
  // Windowオブジェクトの拡張
  interface Window {
    api: import('./api').ElectronAPI;
    versions: {
      node: () => string;
      chrome: () => string;
      electron: () => string;
    };
  }
}
