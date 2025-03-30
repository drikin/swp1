const { contextBridge, ipcRenderer } = require('electron');

// デバッグログ
console.log('Preload script executing...');

// APIを公開
try {
  contextBridge.exposeInMainWorld('api', {
    // FFmpeg関連
    checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
    getMediaInfo: (filePath) => ipcRenderer.invoke('get-media-info', filePath),
    generateWaveform: (filePath, outputPath) => ipcRenderer.invoke('generate-waveform', filePath, outputPath),
    exportCombinedVideo: (options) => ipcRenderer.invoke('export-combined-video', options),
    
    // ファイル操作関連
    openFileDialog: (paths) => ipcRenderer.invoke('open-file-dialog', paths),
    openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),
    getDesktopPath: () => ipcRenderer.invoke('get-desktop-path'),
    
    // 通信関連
    on: (channel, callback) => {
      // 許可されたチャンネルのみ購読可能
      const validChannels = ['task-status', 'progress-update', 'export-progress'];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => callback(...args));
      }
    },
    off: (channel, callback) => {
      const validChannels = ['task-status', 'progress-update', 'export-progress'];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeListener(channel, callback);
      }
    }
  });
  console.log('API successfully exposed to renderer via contextBridge');
} catch (error) {
  console.error('Failed to expose API to renderer:', error);
} 