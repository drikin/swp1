/**
 * フックのエントリーポイント
 * 全てのカスタムフックをここからエクスポートすることで、インポートを簡素化します
 */

// 直接コンテキストフックをエクスポート（中間レイヤー削除）
export { useTasks } from '../contexts/TaskContext';
export { useMedia as useMediaFiles } from '../contexts/MediaContext';
export { useWaveform } from '../contexts/WaveformContext';
export { useThumbnail } from '../contexts/ThumbnailContext';

// キーボードショートカット関連フック
export { useKeyboardShortcuts } from './keyboard';

// ドラッグ＆ドロップ関連フック
export { useFileDragDrop } from './dragdrop';
