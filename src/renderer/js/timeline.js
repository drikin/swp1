// timeline.js - タイムライン管理モジュール

// TimelineModuleの定義
const TimelineModule = {
  // タイムラインの設定
  settings: {
    pixelsPerSecond: 50, // 1秒あたりの表示ピクセル数
    minClipWidth: 30,    // クリップの最小幅（ピクセル）
    clipHeight: 40,      // クリップの高さ（ピクセル）
    clipGap: 2           // クリップ間のギャップ（ピクセル）
  },
  
  // タイムライン要素
  timelineElement: null,
  
  // 初期化メソッド
  initialize() {
    // タイムライン要素を取得
    this.timelineElement = document.getElementById('timeline');
    if (!this.timelineElement) return;
    
    // タイムラインのクリックイベント
    this.timelineElement.addEventListener('click', (event) => {
      // タイムライン上でのクリック位置を取得
      const rect = this.timelineElement.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      
      // クリック位置に応じて再生位置を変更（実装予定）
    });
    
    // ドラッグ&ドロップのサポート
    this.setupDragAndDrop();
  },
  
  // ドラッグ&ドロップのセットアップ
  setupDragAndDrop() {
    // メディアアイテムからのドラッグをサポート
    const mediaItems = document.querySelectorAll('.media-item');
    mediaItems.forEach(item => {
      item.setAttribute('draggable', true);
      
      item.addEventListener('dragstart', (event) => {
        const itemId = item.dataset.id;
        event.dataTransfer.setData('text/plain', itemId);
      });
    });
    
    // タイムラインでのドロップをサポート
    this.timelineElement.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    
    this.timelineElement.addEventListener('drop', (event) => {
      event.preventDefault();
      
      const itemId = event.dataTransfer.getData('text/plain');
      if (!itemId) return;
      
      // ドロップされたアイテムを検索
      const mediaItem = window.AppState.mediaItems.find(item => item.id === itemId);
      if (mediaItem) {
        this.addClip(mediaItem);
      }
    });
  },
  
  // タイムラインにクリップを追加
  addClip(mediaItem) {
    if (!mediaItem || !this.timelineElement) return;
    
    // 新しいクリップオブジェクトを作成
    const clipItem = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      mediaId: mediaItem.id,
      name: mediaItem.name,
      type: mediaItem.type,
      startTime: 0,                   // メディア内の開始時間
      endTime: mediaItem.duration,    // メディア内の終了時間
      duration: mediaItem.duration,   // クリップの持続時間
      timelinePosition: this.calculateNextPosition(), // タイムライン上の位置
      trimmed: false                  // トリムされたかどうか
    };
    
    // タイムラインアイテムリストに追加
    window.AppState.timelineItems.push(clipItem);
    window.AppState.updateState({ timelineItems: window.AppState.timelineItems });
    
    // UIにクリップを描画
    this.renderClip(clipItem);
  },
  
  // 次のクリップ位置を計算
  calculateNextPosition() {
    const items = window.AppState.timelineItems;
    if (items.length === 0) return 0;
    
    // 最後のクリップの終了位置を計算
    const lastItem = items[items.length - 1];
    return lastItem.timelinePosition + lastItem.duration;
  },
  
  // クリップをUIに描画
  renderClip(clipItem) {
    // クリップ要素を作成
    const clipElement = document.createElement('div');
    clipElement.className = 'timeline-clip';
    clipElement.dataset.id = clipItem.id;
    
    // クリップの位置とサイズを設定
    const left = clipItem.timelinePosition * this.settings.pixelsPerSecond;
    const width = Math.max(clipItem.duration * this.settings.pixelsPerSecond, this.settings.minClipWidth);
    
    clipElement.style.left = `${left}px`;
    clipElement.style.width = `${width}px`;
    clipElement.style.height = `${this.settings.clipHeight}px`;
    
    // クリップのタイプに応じた背景色
    if (clipItem.type === 'video') {
      clipElement.style.backgroundColor = '#3498db';
    } else if (clipItem.type === 'image') {
      clipElement.style.backgroundColor = '#9b59b6';
    } else {
      clipElement.style.backgroundColor = '#95a5a6';
    }
    
    // クリップ名のラベル
    const clipLabel = document.createElement('div');
    clipLabel.className = 'clip-label';
    clipLabel.textContent = clipItem.name;
    clipElement.appendChild(clipLabel);
    
    // トリムされたクリップの表示
    if (clipItem.trimmed) {
      clipElement.classList.add('trimmed');
    }
    
    // クリップをクリックしたときのイベント
    clipElement.addEventListener('click', (event) => {
      event.stopPropagation();
      this.selectClip(clipItem);
    });
    
    // クリップを右クリックしたときのイベント（コンテキストメニュー）
    clipElement.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      // コンテキストメニューを表示（将来的に実装）
    });
    
    // ドラッグ操作の設定（将来的に実装）
    
    // タイムラインに追加
    this.timelineElement.appendChild(clipElement);
    
    // タイムラインの表示幅を調整
    this.updateTimelineWidth();
  },
  
  // タイムラインの幅を更新
  updateTimelineWidth() {
    const items = window.AppState.timelineItems;
    if (items.length === 0) return;
    
    // 最後のクリップの終了位置を計算
    const lastItem = items[items.length - 1];
    const endPosition = (lastItem.timelinePosition + lastItem.duration) * this.settings.pixelsPerSecond + 100; // 余白を追加
    
    this.timelineElement.style.width = `${endPosition}px`;
  },
  
  // クリップを選択
  selectClip(clipItem) {
    // 選択されたクリップの対応するメディアアイテムを検索
    const mediaItem = window.AppState.mediaItems.find(item => item.id === clipItem.mediaId);
    if (!mediaItem) return;
    
    // メディアアイテムを選択状態にする
    window.MediaList.selectMediaItem(mediaItem);
    
    // トリム範囲を設定（クリップの開始・終了時間）
    window.AppState.updateState({
      trimInPoint: clipItem.startTime,
      trimOutPoint: clipItem.endTime
    });
    
    // 波形のトリムマーカーを更新
    window.WaveformModule.updateTrimMarkers();
  },
  
  // トリム適用
  applyTrim(inPoint, outPoint) {
    const currentIndex = window.AppState.currentItemIndex;
    if (currentIndex < 0 || !window.AppState.mediaItems[currentIndex]) return;
    
    const mediaItem = window.AppState.mediaItems[currentIndex];
    
    // 対応するタイムラインクリップを検索
    const clipIndex = window.AppState.timelineItems.findIndex(clip => clip.mediaId === mediaItem.id);
    if (clipIndex < 0) {
      // タイムラインにクリップがなければ新規作成
      const newClip = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        mediaId: mediaItem.id,
        name: mediaItem.name,
        type: mediaItem.type,
        startTime: inPoint,
        endTime: outPoint,
        duration: outPoint - inPoint,
        timelinePosition: this.calculateNextPosition(),
        trimmed: true
      };
      
      window.AppState.timelineItems.push(newClip);
      window.AppState.updateState({ timelineItems: window.AppState.timelineItems });
      
      // UIに新しいクリップを描画
      this.renderClip(newClip);
    } else {
      // 既存のクリップを更新
      const clipItem = window.AppState.timelineItems[clipIndex];
      clipItem.startTime = inPoint;
      clipItem.endTime = outPoint;
      clipItem.duration = outPoint - inPoint;
      clipItem.trimmed = true;
      
      window.AppState.updateState({ timelineItems: window.AppState.timelineItems });
      
      // UIを更新（該当クリップを削除して再描画）
      const clipElement = this.timelineElement.querySelector(`.timeline-clip[data-id="${clipItem.id}"]`);
      if (clipElement) {
        clipElement.remove();
      }
      this.renderClip(clipItem);
    }
  },
  
  // タイムラインをクリア
  clearTimeline() {
    if (!this.timelineElement) return;
    
    // すべてのクリップ要素を削除
    while (this.timelineElement.firstChild) {
      this.timelineElement.removeChild(this.timelineElement.firstChild);
    }
    
    // タイムラインアイテムをクリア
    window.AppState.updateState({ timelineItems: [] });
  }
};

// DOMが読み込まれたら初期化
document.addEventListener('DOMContentLoaded', () => {
  TimelineModule.initialize();
});

// グローバルスコープで公開
window.TimelineModule = TimelineModule; 