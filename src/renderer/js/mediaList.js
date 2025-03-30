// mediaList.js - メディアリストの管理モジュール

// MediaListモジュール
const MediaList = {
  // メディアファイルを追加
  async addMediaFiles(filePaths) {
    // 読み込み中のファイル情報を一時保存する配列
    const mediaItemsToAdd = [];

    for (const filePath of filePaths) {
      try {
        // タスク追加
        window.AppState.addTask();
        
        // ファイル情報を取得
        const mediaInfo = await window.api.getMediaInfo(filePath);
        
        // ファイル名を取得
        const fileName = filePath.split(/[\\/]/).pop();
        
        // ファイルタイプ（拡張子）を取得
        const fileType = fileName.split('.').pop().toLowerCase();
        
        // 定義済みのサポート拡張子リストを使用して動画か画像かを判定
        const isVideo = window.SUPPORTED_EXTENSIONS.video.includes(fileType);
        const isImage = window.SUPPORTED_EXTENSIONS.image.includes(fileType);
        
        // 新しいメディアアイテムを作成
        const mediaItem = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          path: filePath,
          name: fileName,
          type: isVideo ? 'video' : (isImage ? 'image' : 'unknown'),
          duration: 0, // 後で設定
          width: 0,    // 後で設定
          height: 0,   // 後で設定
          waveform: null, // 波形データ（後で生成）
          creationTime: mediaInfo.creationTime || Date.now() // 撮影日時または現在時刻
        };
        
        // メディア情報からデータを抽出
        if (mediaInfo.success) {
          // 動画情報を解析
          const durationMatch = mediaInfo.info.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
          if (durationMatch) {
            const hours = parseInt(durationMatch[1]);
            const minutes = parseInt(durationMatch[2]);
            const seconds = parseFloat(durationMatch[3]);
            mediaItem.duration = hours * 3600 + minutes * 60 + seconds;
          }
          
          // 解像度情報を解析
          const resolutionMatch = mediaInfo.info.match(/(\d+)x(\d+)/);
          if (resolutionMatch) {
            mediaItem.width = parseInt(resolutionMatch[1]);
            mediaItem.height = parseInt(resolutionMatch[2]);
          }
        }
        
        // 画像の場合、デフォルトの持続時間を5秒に設定
        if (mediaItem.type === 'image') {
          mediaItem.duration = 5.0;
        }
        
        // 一時配列に追加
        mediaItemsToAdd.push(mediaItem);
        
        // タスク完了
        window.AppState.completeTask();
        
      } catch (error) {
        console.error(`Error adding media file ${filePath}:`, error);
        window.AppState.completeTask();
      }
    }

    // 撮影日時でファイルをソート
    mediaItemsToAdd.sort((a, b) => a.creationTime - b.creationTime);

    // ソートしたメディアアイテムを一括で追加
    for (const mediaItem of mediaItemsToAdd) {
      // メディアアイテムを状態に追加
      window.AppState.mediaItems.push(mediaItem);
      
      // UIにメディアアイテムを追加
      this.renderMediaItem(mediaItem);
      
      // 波形データを生成（動画/音声の場合のみ）
      if (mediaItem.type === 'video') {
        try {
          // タスク追加（波形データ生成用）
          window.AppState.addTask();
          
          const waveformData = await window.api.generateWaveform(mediaItem.path);
          if (waveformData.success) {
            mediaItem.waveform = waveformData.waveform;
            // 波形データがあれば波形UIを更新
            if (window.AppState.currentItemIndex >= 0 && 
                window.AppState.mediaItems[window.AppState.currentItemIndex].id === mediaItem.id) {
              window.WaveformModule.drawWaveform(waveformData.waveform);
            }
          }
          
          // タスク完了
          window.AppState.completeTask();
        } catch (error) {
          console.error('Failed to generate waveform:', error);
          window.AppState.completeTask();
        }
      }
    }
    
    // 状態を更新
    window.AppState.updateState({ mediaItems: window.AppState.mediaItems });
  },
  
  // メディアアイテムのUIレンダリング
  renderMediaItem(mediaItem) {
    const mediaList = document.getElementById('media-list');
    
    // メディアアイテム要素を作成
    const mediaItemElement = document.createElement('div');
    mediaItemElement.className = 'media-item';
    mediaItemElement.dataset.id = mediaItem.id;
    
    // サムネイル部分
    const thumbnailElement = document.createElement('div');
    thumbnailElement.className = 'media-item-thumbnail';
    
    // タイプに応じたアイコンまたはサムネイル（仮実装）
    if (mediaItem.type === 'video') {
      thumbnailElement.textContent = '🎬';
    } else if (mediaItem.type === 'image') {
      thumbnailElement.textContent = '🖼️';
    } else {
      thumbnailElement.textContent = '📄';
    }
    
    // 情報部分
    const infoElement = document.createElement('div');
    infoElement.className = 'media-item-info';
    
    // タイトル
    const titleElement = document.createElement('div');
    titleElement.className = 'media-item-title';
    titleElement.textContent = mediaItem.name;
    
    // 詳細情報
    const detailsElement = document.createElement('div');
    detailsElement.className = 'media-item-details';
    
    // 時間とサイズ情報
    let details = '';
    if (mediaItem.duration) {
      const minutes = Math.floor(mediaItem.duration / 60);
      const seconds = Math.floor(mediaItem.duration % 60);
      details += `${minutes}:${seconds.toString().padStart(2, '0')} `;
    }
    if (mediaItem.width && mediaItem.height) {
      details += `${mediaItem.width}x${mediaItem.height}`;
    }
    detailsElement.textContent = details;
    
    // 要素を組み立て
    infoElement.appendChild(titleElement);
    infoElement.appendChild(detailsElement);
    mediaItemElement.appendChild(thumbnailElement);
    mediaItemElement.appendChild(infoElement);
    
    // クリックイベントを設定
    mediaItemElement.addEventListener('click', () => {
      // 選択状態を更新
      this.selectMediaItem(mediaItem);
    });
    
    // リストに追加
    mediaList.appendChild(mediaItemElement);
  },
  
  // メディアアイテムを選択
  selectMediaItem(mediaItem) {
    // 現在のインデックスを取得
    const index = window.AppState.mediaItems.findIndex(item => item.id === mediaItem.id);
    if (index < 0) return;
    
    // UIの選択状態を更新
    const mediaItems = document.querySelectorAll('.media-item');
    mediaItems.forEach(item => item.classList.remove('selected'));
    
    const selectedItem = document.querySelector(`.media-item[data-id="${mediaItem.id}"]`);
    if (selectedItem) {
      selectedItem.classList.add('selected');
    }
    
    // 状態を更新
    window.AppState.updateState({ currentItemIndex: index });
    
    // プレーヤーに動画を読み込み
    const videoPlayer = document.getElementById('video-player');
    videoPlayer.src = mediaItem.type === 'video' ? `file://${mediaItem.path}` : '';
    
    // 波形を表示（波形データがあれば）
    if (mediaItem.waveform) {
      window.WaveformModule.drawWaveform(mediaItem.waveform);
    } else {
      // 波形データがなければキャンバスをクリア
      const canvas = document.getElementById('waveform-canvas');
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  },
  
  // メディアをタイムラインに追加
  addToTimeline(mediaItem) {
    if (!mediaItem) return;
    
    // タイムラインに追加するロジックを実装
    window.TimelineModule.addClip(mediaItem);
  }
};

// グローバルスコープで公開
window.MediaList = MediaList; 