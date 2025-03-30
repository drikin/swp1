// waveform.js - 波形表示モジュール

// WaveformModuleの定義
const WaveformModule = {
  // キャンバスコンテキスト
  canvas: null,
  ctx: null,
  
  // 波形データ
  waveformData: null,
  
  // 表示設定
  displaySettings: {
    color: '#3498db',
    backgroundColor: '#333',
    selectedColor: '#f39c12',
    trimInColor: '#2ecc71',
    trimOutColor: '#e74c3c',
    lineWidth: 1,
    padding: 10
  },
  
  // 初期化メソッド
  initialize() {
    // キャンバス要素を取得
    this.canvas = document.getElementById('waveform-canvas');
    if (!this.canvas) return;
    
    // コンテキストを取得
    this.ctx = this.canvas.getContext('2d');
    
    // キャンバスのサイズを設定
    this.resizeCanvas();
    
    // ウィンドウリサイズイベントを監視
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // 再生中の位置をハイライトするためのイベントリスナー
    const videoPlayer = document.getElementById('video-player');
    videoPlayer.addEventListener('timeupdate', () => {
      // 現在選択されているメディアアイテムがあり、波形データが存在する場合のみ
      if (window.AppState.currentItemIndex >= 0 && this.waveformData) {
        this.drawWaveform(this.waveformData);
        this.drawPlayhead(videoPlayer.currentTime, videoPlayer.duration);
      }
    });
    
    // キャンバス上でのクリックイベント
    this.canvas.addEventListener('click', (event) => {
      if (!window.AppState.mediaItems[window.AppState.currentItemIndex]) return;
      
      const videoPlayer = document.getElementById('video-player');
      if (!videoPlayer.duration) return;
      
      // クリック位置から時間を計算
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const timePosition = (x / this.canvas.width) * videoPlayer.duration;
      
      // 動画の再生位置を更新
      videoPlayer.currentTime = timePosition;
    });
  },
  
  // キャンバスのリサイズ
  resizeCanvas() {
    if (!this.canvas) return;
    
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
    
    // リサイズ後に波形を再描画
    if (this.waveformData) {
      this.drawWaveform(this.waveformData);
    }
  },
  
  // 波形を描画
  drawWaveform(waveformData) {
    if (!this.ctx || !waveformData || waveformData.length === 0) return;
    
    // データを保存
    this.waveformData = waveformData;
    
    // キャンバスをクリア
    this.ctx.fillStyle = this.displaySettings.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // 波形描画設定
    this.ctx.strokeStyle = this.displaySettings.color;
    this.ctx.lineWidth = this.displaySettings.lineWidth;
    
    // 波形を描画するためのスケーリング
    const width = this.canvas.width - this.displaySettings.padding * 2;
    const height = this.canvas.height - this.displaySettings.padding * 2;
    const step = Math.max(1, Math.floor(waveformData.length / width));
    const amplitude = height / 2;
    const center = this.canvas.height / 2;
    
    // 波形を描画
    this.ctx.beginPath();
    for (let i = 0; i < width; i++) {
      const dataIndex = Math.min(Math.floor(i * step), waveformData.length - 1);
      // 16ビット整数の範囲（-32768～32767）でスケーリング
      const value = (waveformData[dataIndex] / 32768.0) * amplitude;
      const x = i + this.displaySettings.padding;
      const y = center - value;
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.stroke();
    
    // IN点とOUT点を描画
    this.drawTrimMarkers();
  },
  
  // 再生位置を描画
  drawPlayhead(currentTime, duration) {
    if (!this.ctx || !duration) return;
    
    // 前回の描画をクリア（波形を再描画）
    this.drawWaveform(this.waveformData);
    
    // 再生位置を表す縦線を描画
    const position = (currentTime / duration) * (this.canvas.width - this.displaySettings.padding * 2) + this.displaySettings.padding;
    
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(position, 0);
    this.ctx.lineTo(position, this.canvas.height);
    this.ctx.stroke();
  },
  
  // トリムマーカーを描画
  drawTrimMarkers() {
    if (!this.ctx) return;
    
    const videoPlayer = document.getElementById('video-player');
    if (!videoPlayer.duration) return;
    
    const width = this.canvas.width - this.displaySettings.padding * 2;
    
    // IN点を描画
    if (window.AppState.trimInPoint !== null) {
      const inPosition = (window.AppState.trimInPoint / videoPlayer.duration) * width + this.displaySettings.padding;
      
      this.ctx.strokeStyle = this.displaySettings.trimInColor;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(inPosition, 0);
      this.ctx.lineTo(inPosition, this.canvas.height);
      this.ctx.stroke();
      
      // ラベルを描画
      this.ctx.fillStyle = this.displaySettings.trimInColor;
      this.ctx.font = '12px sans-serif';
      this.ctx.fillText('IN', inPosition + 4, 14);
    }
    
    // OUT点を描画
    if (window.AppState.trimOutPoint !== null) {
      const outPosition = (window.AppState.trimOutPoint / videoPlayer.duration) * width + this.displaySettings.padding;
      
      this.ctx.strokeStyle = this.displaySettings.trimOutColor;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(outPosition, 0);
      this.ctx.lineTo(outPosition, this.canvas.height);
      this.ctx.stroke();
      
      // ラベルを描画
      this.ctx.fillStyle = this.displaySettings.trimOutColor;
      this.ctx.font = '12px sans-serif';
      this.ctx.fillText('OUT', outPosition - 30, 14);
    }
    
    // トリム範囲をハイライト
    if (window.AppState.trimInPoint !== null && window.AppState.trimOutPoint !== null) {
      const inPosition = (window.AppState.trimInPoint / videoPlayer.duration) * width + this.displaySettings.padding;
      const outPosition = (window.AppState.trimOutPoint / videoPlayer.duration) * width + this.displaySettings.padding;
      
      this.ctx.fillStyle = 'rgba(46, 204, 113, 0.2)';
      this.ctx.fillRect(inPosition, 0, outPosition - inPosition, this.canvas.height);
    }
  },
  
  // トリムマーカーの更新
  updateTrimMarkers() {
    if (this.waveformData) {
      this.drawWaveform(this.waveformData);
    }
  }
};

// DOMが読み込まれたら初期化
document.addEventListener('DOMContentLoaded', () => {
  WaveformModule.initialize();
});

// グローバルスコープで公開
window.WaveformModule = WaveformModule; 