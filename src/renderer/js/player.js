// player.js - ビデオプレーヤーモジュール

// PlayerModuleの定義
const PlayerModule = {
  // ビデオ要素
  videoElement: null,
  
  // 現在のメディア情報
  currentMedia: null,
  
  // 初期化メソッド
  initialize() {
    // ビデオ要素を取得
    this.videoElement = document.getElementById('video-player');
    if (!this.videoElement) return;
    
    // イベントリスナーを設定
    this.setupEventListeners();
  },
  
  // イベントリスナーの設定
  setupEventListeners() {
    // メディアが読み込まれたとき
    this.videoElement.addEventListener('loadedmetadata', () => {
      console.log('Video loaded:', this.videoElement.duration);
    });
    
    // 再生が開始されたとき
    this.videoElement.addEventListener('play', () => {
      console.log('Video playback started');
    });
    
    // 一時停止されたとき
    this.videoElement.addEventListener('pause', () => {
      console.log('Video playback paused');
    });
    
    // 再生位置が変更されたとき
    this.videoElement.addEventListener('timeupdate', () => {
      // 現在の再生位置を波形表示に反映
      // WaveformModuleで処理しているため、ここでは不要
    });
    
    // 再生終了したとき
    this.videoElement.addEventListener('ended', () => {
      console.log('Video playback ended');
    });
    
    // エラーが発生したとき
    this.videoElement.addEventListener('error', (event) => {
      console.error('Video error:', event);
    });
  },
  
  // 動画を読み込む
  loadVideo(mediaItem) {
    if (!mediaItem || !this.videoElement) return;
    
    this.currentMedia = mediaItem;
    
    // ファイルパスをセット
    if (mediaItem.type === 'video') {
      this.videoElement.src = `file://${mediaItem.path}`;
      this.videoElement.style.display = 'block';
    } else {
      // 画像や他のメディアタイプの場合は別の処理（将来的に実装）
      this.videoElement.style.display = 'none';
    }
  },
  
  // 再生を開始
  play() {
    if (this.videoElement) {
      this.videoElement.play().catch(error => {
        console.error('Play error:', error);
      });
    }
  },
  
  // 一時停止
  pause() {
    if (this.videoElement) {
      this.videoElement.pause();
    }
  },
  
  // 停止（一時停止して先頭に戻る）
  stop() {
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.currentTime = 0;
    }
  },
  
  // 指定位置にシーク
  seek(timeInSeconds) {
    if (this.videoElement) {
      this.videoElement.currentTime = timeInSeconds;
    }
  },
  
  // トリム範囲のプレビュー再生
  playTrimRange(inPoint, outPoint) {
    if (!this.videoElement) return;
    
    // IN点に移動
    this.videoElement.currentTime = inPoint;
    
    // OUT点で停止するリスナーを設定
    const checkOutPoint = () => {
      if (this.videoElement.currentTime >= outPoint) {
        this.videoElement.pause();
        this.videoElement.removeEventListener('timeupdate', checkOutPoint);
      }
    };
    
    this.videoElement.addEventListener('timeupdate', checkOutPoint);
    
    // 再生開始
    this.videoElement.play().catch(error => {
      console.error('Trim preview play error:', error);
    });
  }
};

// DOMが読み込まれたら初期化
document.addEventListener('DOMContentLoaded', () => {
  PlayerModule.initialize();
});

// グローバルスコープで公開
window.PlayerModule = PlayerModule; 