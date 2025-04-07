/**
 * メディア関連のAPIハンドラ
 * メディアファイルに関する操作を提供します
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * メディア関連のAPIハンドラを登録
 * @param {Electron.IpcMain} ipcMain - Electron IPC Mainオブジェクト
 */
function registerMediaAPI(ipcMain) {
  // ハンドラが既に登録されていないか確認するヘルパー関数
  const safeRegisterHandler = (channel, handler) => {
    try {
      // 既存のハンドラを上書きするため、一旦削除を試みる
      // 存在しない場合はエラーがスローされるが無視する
      try {
        ipcMain.removeHandler(channel);
        console.log(`既存の ${channel} ハンドラを削除しました`);
      } catch (error) {
        // ハンドラが存在しない場合のエラーは無視
      }
      
      // 新しいハンドラを登録
      ipcMain.handle(channel, handler);
      console.log(`${channel} ハンドラを登録しました`);
    } catch (error) {
      console.error(`${channel} ハンドラの登録に失敗しました:`, error);
    }
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
            
            // ファイル情報を追加
            const stats = fs.statSync(mediaPath);
            mediaInfo.file = {
              path: mediaPath,
              name: path.basename(mediaPath),
              size: stats.size,
              modified: stats.mtime
            };
            
            resolve({ 
              success: true, 
              mediaInfo 
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
