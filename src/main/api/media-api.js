/**
 * メディア関連のAPIハンドラ
 * メディアファイルに関する操作を提供します
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { registerHandler } = require('../ipc-registry');

/**
 * メディア関連のAPIハンドラを登録
 * @param {Electron.IpcMain} ipcMain - Electron IPC Mainオブジェクト
 */
function registerMediaAPI(ipcMain) {
  // ハンドラ登録のラッパー関数
  const safeRegisterHandler = (channel, handler) => {
    return registerHandler(ipcMain, channel, handler);
  };

  // メディアファイル情報の取得
  safeRegisterHandler('get-media-info', async (event, mediaPath) => {
    try {
      if (!mediaPath || !fs.existsSync(mediaPath)) {
        return { 
          success: false, 
          error: 'ファイルが存在しません' 
        };
      }
      
      // FFmpegを使用してメディア情報を取得
      const ffmpegPath = global.ffmpegPath;
      if (!ffmpegPath) {
        return { 
          success: false, 
          error: 'FFmpegのパスが設定されていません' 
        };
      }
      
      // FFprobeコマンド
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        mediaPath
      ];
      
      return new Promise((resolve, reject) => {
        const process = spawn(ffmpegPath.replace('ffmpeg', 'ffprobe'), args);
        
        let output = '';
        process.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        let errorOutput = '';
        process.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        process.on('error', (error) => {
          reject(error);
        });
        
        process.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`FFprobeプロセスが${code}で終了しました: ${errorOutput}`));
            return;
          }
          
          try {
            const mediaInfo = JSON.parse(output);
            
            // ビデオストリームとオーディオストリームを取得
            const videoStream = mediaInfo.streams.find(stream => stream.codec_type === 'video');
            const audioStream = mediaInfo.streams.find(stream => stream.codec_type === 'audio');
            
            // フレームレートを安全に計算（evalを使わない）
            const calculateFrameRate = (rateStr) => {
              if (!rateStr) return null;
              const parts = rateStr.split('/');
              if (parts.length !== 2) return null;
              const num = parseInt(parts[0], 10);
              const den = parseInt(parts[1], 10);
              return den === 0 ? null : num / den;
            };
            
            // ファイル情報を追加
            const stats = fs.statSync(mediaPath);
            
            // シンプルで直接的なレスポンス形式
            resolve({ 
              success: true,
              path: mediaPath,
              name: path.basename(mediaPath),
              format: mediaInfo.format.format_name,
              duration: parseFloat(mediaInfo.format.duration) || 0,
              size: stats.size,
              bitrate: parseInt(mediaInfo.format.bit_rate, 10) || 0,
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
            });
          } catch (error) {
            reject(error);
          }
        });
      });
    } catch (error) {
      console.error('メディア情報取得エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // メディアファイル一覧の取得
  safeRegisterHandler('get-media-list', async (event, directoryPath) => {
    try {
      if (!directoryPath || !fs.existsSync(directoryPath)) {
        return { 
          success: false, 
          error: 'ディレクトリが存在しません' 
        };
      }
      
      const files = fs.readdirSync(directoryPath);
      
      // メディアファイルのみをフィルタリング
      const mediaExtensions = ['.mp4', '.m4v', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.m4a', '.aac'];
      const mediaFiles = files
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return mediaExtensions.includes(ext);
        })
        .map(file => {
          const filePath = path.join(directoryPath, file);
          const stats = fs.statSync(filePath);
          
          return {
            path: filePath,
            name: file,
            size: stats.size,
            modified: stats.mtime
          };
        });
      
      return { 
        success: true, 
        mediaFiles 
      };
    } catch (error) {
      console.error('メディアリスト取得エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // メディアファイルの存在確認
  safeRegisterHandler('check-media-exists', async (event, mediaPath) => {
    try {
      const exists = fs.existsSync(mediaPath);
      return { success: true, exists };
    } catch (error) {
      console.error('メディア存在確認エラー:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });
}

module.exports = { registerMediaAPI };
