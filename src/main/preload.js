const { contextBridge, ipcRenderer } = require('electron');

// デバッグログ
console.log('Preload script executing...');

// CSP設定を変更するためのメタタグを追加
// データURLからの画像読み込みを許可する
document.addEventListener('DOMContentLoaded', () => {
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline';";
  document.head.appendChild(meta);
});

// APIを公開
try {
  // 許可するチャンネルリスト
  const validInvokeChannels = [
    'open-file-dialog',
    'open-directory-dialog',
    'get-desktop-path',
    'check-ffmpeg',
    'get-media-info',
    'generate-waveform',
    'export-combined-video'
  ];
  
  const validEventChannels = [
    'task-status',
    'progress-update',
    'export-progress', 
    'thumbnail-generated'
  ];
  
  // 統合されたAPIオブジェクトを作成
  contextBridge.exposeInMainWorld('api', {
    // 非同期通信用のメソッド
    invoke: (channel, ...args) => {
      // 許可されたチャンネルのみ通信を許可
      if (validInvokeChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      
      // 許可されていないチャンネルの場合はエラー
      throw new Error(`通信チャンネル "${channel}" は許可されていません`);
    },
    
    // イベントリスナー登録
    on: (channel, callback) => {
      // 許可されたチャンネルのみリスナー登録を許可
      if (validEventChannels.includes(channel)) {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on(channel, subscription);
        
        // 登録解除用の関数を返す
        return () => {
          ipcRenderer.removeListener(channel, subscription);
        };
      }
      
      // 許可されていないチャンネルの場合はエラー
      throw new Error(`イベントチャンネル "${channel}" は許可されていません`);
    },
    
    // イベントリスナー削除
    off: (channel, callback) => {
      // 許可されたチャンネルのみリスナー削除を許可
      if (validEventChannels.includes(channel)) {
        ipcRenderer.removeListener(channel, callback);
        return true;
      }
      
      // 許可されていないチャンネルの場合はエラー
      throw new Error(`イベントチャンネル "${channel}" は許可されていません`);
    },
    
    // FFmpeg関連関数
    checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
    getMediaInfo: (filePath) => ipcRenderer.invoke('get-media-info', filePath),
    generateWaveform: (filePath, outputPath) => ipcRenderer.invoke('generate-waveform', filePath, outputPath),
    exportCombinedVideo: (options) => ipcRenderer.invoke('export-combined-video', options),
    
    // ファイル操作関連
    openFileDialog: (paths) => ipcRenderer.invoke('open-file-dialog', paths),
    openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),
    getDesktopPath: () => ipcRenderer.invoke('get-desktop-path'),
  });
  
  console.log('API successfully exposed to renderer via contextBridge');
} catch (error) {
  console.error('Failed to expose API to renderer:', error);
}

// バージョン情報
contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron
}); 