// export.js - 動画書き出しモジュール

// ExportModuleの定義
const ExportModule = {
  // 解像度設定のマッピング
  resolutionMap: {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '2k': { width: 2560, height: 1440 },
    '4k': { width: 3840, height: 2160 }
  },
  
  // 書き出しダイアログを表示
  showExportDialog() {
    // 現在のところ、HTMLにUIは組み込まれているので、
    // 設定値を取得して書き出し処理を開始します
    this.startExport();
  },
  
  // 書き出し処理を開始
  async startExport() {
    // 処理中の表示を更新
    window.AppState.addTask();
    document.getElementById('export-btn').disabled = true;
    document.getElementById('status-message').textContent = '書き出し準備中...';
    
    try {
      // 設定値を取得
      const resolution = document.getElementById('resolution').value;
      const fps = document.getElementById('fps').value;
      const codec = document.getElementById('codec').value;
      
      // タイムラインアイテムのチェック
      if (window.AppState.timelineItems.length === 0) {
        throw new Error('タイムラインにクリップがありません');
      }
      
      // 出力ファイルパスを選択（ここではダミー実装）
      // 本来はipcMainでダイアログを開いて選択させる
      const outputPath = `/tmp/output_${Date.now()}.mp4`;
      
      // 書き出し設定
      const exportSettings = {
        resolution: this.resolutionMap[resolution] || this.resolutionMap['1080p'],
        fps: parseInt(fps, 10) || 30,
        codec: codec || 'h264',
        outputPath: outputPath
      };
      
      console.log('Export settings:', exportSettings);
      
      // タイムラインアイテムを処理
      await this.processTimelineItems(exportSettings);
      
      // 完了メッセージ
      document.getElementById('status-message').textContent = '書き出し完了: ' + outputPath;
      
    } catch (error) {
      console.error('Export error:', error);
      document.getElementById('status-message').textContent = `書き出しエラー: ${error.message}`;
    } finally {
      // タスク完了
      window.AppState.completeTask();
      document.getElementById('export-btn').disabled = false;
    }
  },
  
  // タイムラインアイテムを処理（ダミー実装）
  async processTimelineItems(settings) {
    // 実際の実装では、ここでFFmpegを使って処理
    // 1. 各クリップを個別に処理
    // 2. 中間ファイルを生成
    // 3. 最終的に結合
    
    // 処理完了までのシミュレーション
    return new Promise(resolve => {
      document.getElementById('status-message').textContent = '書き出し中...（実装予定）';
      setTimeout(() => {
        console.log('Export completed (dummy implementation)');
        resolve();
      }, 2000);
    });
  },
  
  // 実際の書き出し処理（将来実装）
  async exportVideo(settings) {
    // メインプロセスにエクスポート要求を送信
    try {
      const result = await window.api.exportVideo({
        items: window.AppState.timelineItems,
        settings: settings
      });
      
      return result;
    } catch (error) {
      throw new Error('動画書き出しに失敗しました: ' + error.message);
    }
  }
};

// グローバルスコープで公開
window.ExportModule = ExportModule; 