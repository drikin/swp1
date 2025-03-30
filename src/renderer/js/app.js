// app.js - アプリケーションのメイン処理

// アプリケーションの状態管理
const AppState = {
  mediaItems: [], // 読み込まれたメディアアイテムのリスト
  currentItemIndex: -1, // 現在選択されているアイテムのインデックス
  timelineItems: [], // タイムラインに配置されたアイテムのリスト
  processingTasks: 0, // 処理中のタスク数
  trimInPoint: null, // トリムのIN点
  trimOutPoint: null, // トリムのOUT点
  ffmpegReady: false, // FFmpegが準備完了かどうか
  
  // 状態を更新し、UIを更新するメソッド
  updateState(changes) {
    // 変更を適用
    Object.assign(this, changes);
    
    // UIの更新
    this.updateUI();
  },
  
  // UIを更新するメソッド
  updateUI() {
    // タスク数インジケータを更新
    document.getElementById('task-count').textContent = this.processingTasks;
    
    // 書き出しボタンの有効/無効を設定
    const exportBtn = document.getElementById('export-btn');
    if (this.processingTasks > 0 || this.timelineItems.length === 0) {
      exportBtn.disabled = true;
      exportBtn.title = this.processingTasks > 0 
        ? "処理中のタスクがあるため書き出しできません" 
        : "タイムラインに項目がありません";
    } else {
      exportBtn.disabled = false;
      exportBtn.title = "動画を書き出します";
    }
    
    // ステータスメッセージを更新
    const statusMessage = document.getElementById('status-message');
    if (this.processingTasks > 0) {
      statusMessage.textContent = `処理中：${this.processingTasks}件のタスクを実行中...`;
    } else if (!this.ffmpegReady) {
      statusMessage.textContent = "FFmpegの初期化中...";
    } else if (this.timelineItems.length === 0) {
      statusMessage.textContent = "タイムラインに素材を追加してください";
    } else {
      statusMessage.textContent = "準備完了";
    }
  },
  
  // タスクを追加
  addTask() {
    this.processingTasks++;
    this.updateUI();
  },
  
  // タスクを完了
  completeTask() {
    if (this.processingTasks > 0) {
      this.processingTasks--;
      this.updateUI();
    }
  }
};

// サポートされているファイル拡張子
const SUPPORTED_EXTENSIONS = {
  video: ['mp4', 'mov', 'avi', 'webm', 'mkv'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp']
};

// ファイルの処理（フィルタリングと追加）を一元化した関数
async function processMediaFiles(filePaths) {
  if (!filePaths || filePaths.length === 0) {
    return;
  }

  console.log(`Processing ${filePaths.length} files`);
  
  // サポートされている拡張子のファイルのみをフィルタリング
  const allSupportedExtensions = [...SUPPORTED_EXTENSIONS.video, ...SUPPORTED_EXTENSIONS.image];
  const validFilePaths = filePaths.filter(path => {
    const ext = path.split('.').pop().toLowerCase();
    return allSupportedExtensions.includes(ext);
  });
  
  console.log(`Found ${validFilePaths.length} supported files`);
  
  if (validFilePaths.length === 0) {
    // サポートされているファイルがない場合はメッセージを表示
    document.getElementById('status-message').textContent = 
      "サポートされていないファイル形式です。動画や画像ファイルのみ追加できます。";
    setTimeout(() => {
      if (AppState.processingTasks === 0) {
        document.getElementById('status-message').textContent = "準備完了";
      }
    }, 3000);
    return;
  }
  
  // 有効なファイルをメディアリストに追加
  MediaList.addMediaFiles(validFilePaths);
}

// アプリケーションの初期化
async function initializeApp() {
  try {
    // APIが利用可能になるまで待機
    if (!window.api) {
      console.error('API is not available. contextBridge may not be properly setup.');
      document.getElementById('status-message').textContent = "エラー: APIが利用できません。";
      return;
    }

    // FFmpegの初期化チェック
    const ffmpegResult = await window.api.checkFFmpeg();
    if (ffmpegResult.success) {
      console.log('FFmpeg initialized:', ffmpegResult.version);
      document.getElementById('ffmpeg-version').textContent = `FFmpeg: ${ffmpegResult.version.split(' ')[2]}`;
      AppState.updateState({ ffmpegReady: true });
    } else {
      console.error('FFmpeg initialization failed:', ffmpegResult.error);
      document.getElementById('status-message').textContent = "エラー: FFmpegの初期化に失敗しました";
      return;
    }
    
    // イベントリスナーの設定
    setupEventListeners();
    
  } catch (error) {
    console.error('Initialization error:', error);
    document.getElementById('status-message').textContent = `エラー: ${error.message}`;
  }
}

// イベントリスナーの設定
function setupEventListeners() {
  // 素材追加ボタン
  const addFilesBtn = document.getElementById('add-files-btn');
  addFilesBtn.addEventListener('click', async () => {
    try {
      const filePaths = await window.api.openFileDialog();
      processMediaFiles(filePaths);
    } catch (error) {
      console.error('Error opening file dialog:', error);
    }
  });
  
  // ドラッグ&ドロップ機能
  const mediaListContainer = document.getElementById('area-1');
  
  // ドラッグ開始イベント
  mediaListContainer.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    mediaListContainer.classList.add('drag-over');
  });
  
  // ドラッグ中イベント
  mediaListContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    mediaListContainer.classList.add('drag-over');
  });
  
  // ドラッグ終了イベント
  mediaListContainer.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!mediaListContainer.contains(e.relatedTarget)) {
      mediaListContainer.classList.remove('drag-over');
    }
  });
  
  // ドロップイベント
  mediaListContainer.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    mediaListContainer.classList.remove('drag-over');
    
    console.log('Drop event triggered');
    
    // ドロップされたファイルを取得
    const files = e.dataTransfer.files;
    
    if (files && files.length > 0) {
      console.log(`Dropped ${files.length} files`);
      
      // ファイルパスの配列を作成
      const filePaths = Array.from(files).map(file => file.path);
      
      // 共通関数を使ってファイルを処理
      processMediaFiles(filePaths);
    }
  });
  
  // 書き出しボタン
  const exportBtn = document.getElementById('export-btn');
  exportBtn.addEventListener('click', () => {
    if (AppState.timelineItems.length > 0 && AppState.processingTasks === 0) {
      ExportModule.showExportDialog();
    }
  });
  
  // トリム操作ボタン
  document.getElementById('set-in-point').addEventListener('click', () => {
    const videoPlayer = document.getElementById('video-player');
    if (videoPlayer.currentTime > 0) {
      AppState.updateState({ trimInPoint: videoPlayer.currentTime });
      WaveformModule.updateTrimMarkers();
    }
  });
  
  document.getElementById('set-out-point').addEventListener('click', () => {
    const videoPlayer = document.getElementById('video-player');
    if (videoPlayer.duration && videoPlayer.currentTime < videoPlayer.duration) {
      AppState.updateState({ trimOutPoint: videoPlayer.currentTime });
      WaveformModule.updateTrimMarkers();
    }
  });
  
  document.getElementById('apply-trim').addEventListener('click', () => {
    if (AppState.trimInPoint !== null && AppState.trimOutPoint !== null && 
        AppState.currentItemIndex >= 0 && AppState.currentItemIndex < AppState.mediaItems.length) {
      TimelineModule.applyTrim(AppState.trimInPoint, AppState.trimOutPoint);
    }
  });
  
  // 再生コントロールボタン
  document.getElementById('play-btn').addEventListener('click', () => {
    const videoPlayer = document.getElementById('video-player');
    videoPlayer.play();
  });
  
  document.getElementById('pause-btn').addEventListener('click', () => {
    const videoPlayer = document.getElementById('video-player');
    videoPlayer.pause();
  });
  
  document.getElementById('stop-btn').addEventListener('click', () => {
    const videoPlayer = document.getElementById('video-player');
    videoPlayer.pause();
    videoPlayer.currentTime = 0;
  });
}

// DOMが読み込まれたら初期化
document.addEventListener('DOMContentLoaded', initializeApp);

// グローバルスコープでAppStateを公開
window.AppState = AppState; 

// グローバルスコープでSUPPORTED_EXTENSIONSを公開
window.SUPPORTED_EXTENSIONS = SUPPORTED_EXTENSIONS; 