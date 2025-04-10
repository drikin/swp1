import React, { useState, useEffect, useRef } from 'react';
import { 
  Panel, 
  PanelGroup, 
  PanelResizeHandle 
} from 'react-resizable-panels';
import Header from './Header';
import TimelinePane from './Timeline';
import VideoPlayer, { VideoPlayerRef } from './VideoPlayer';
import TrimPane from './Trim';
import ExportSettings from './ExportSettings';
import FooterTaskBar from './FooterTaskBar';
import TaskDetailsPanel from './TaskDetailsPanel';
import { formatDuration } from '../../utils/formatters';
import { 
  useTasks, 
  useMediaFiles, 
  useWaveform, 
  useThumbnail,
  useKeyboardShortcuts,
  useFileDragDrop
} from '../hooks';
import { MediaFile } from '../types';

// アプリケーションのメインコンポーネント
const App: React.FC = () => {
  // コンテキストから状態と機能を取得
  const { 
    waveformData, 
    isLoadingWaveform, 
    getWaveformForMedia 
  } = useWaveform();
  
  const { 
    thumbnailUrl, 
    isLoadingThumbnail, 
    getThumbnailForMedia 
  } = useThumbnail();
  
  const { 
    tasks, 
    isLoading: isTasksLoading, 
    taskStatus, 
    fetchTasks, 
    fetchTaskStatus 
  } = useTasks();
  
  const { 
    mediaFiles, 
    selectedMedia, 
    addMediaFiles, 
    updateMedia, 
    deleteMediaFiles, 
    reorderMediaFiles, 
    selectMedia,
    calculateTotalDuration: calcTotalDuration
  } = useMediaFiles();

  // アプリケーションの状態
  const [status, setStatus] = useState('準備完了');
  const [ffmpegVersion, setFfmpegVersion] = useState('');
  const [showExportSettings, setShowExportSettings] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0); // 操作生成時間
  const [currentTime, setCurrentTime] = useState(0); // 現在の再生位置
  const [showTaskDetails, setShowTaskDetails] = useState(false); // タスク詳細パネルの表示状態
  const appRef = useRef<HTMLDivElement>(null);
  const videoPlayerRef = useRef<VideoPlayerRef>(null);

  // ドラッグ＆ドロップのカスタムフックを使用
  const isDragging = useFileDragDrop(appRef, handleDropFiles);

  // キーボードショートカットのカスタムフックを使用
  useKeyboardShortcuts(videoPlayerRef);

  // mediaFiles が変更されたら合計時間を再計算
  useEffect(() => {
    const duration = calcTotalDuration();
    setTotalDuration(duration);
  }, [mediaFiles, calcTotalDuration]);

  // FFmpegバージョン確認
  useEffect(() => {
    checkFfmpegVersion();
  }, []);

  // FFmpegバージョン確認
  async function checkFfmpegVersion() {
    try {
      const result = await window.api.invoke('check-ffmpeg');
      if (result.success) {
        setFfmpegVersion(result.version);
      } else {
        console.error('FFmpeg確認エラー:', result.error);
        setFfmpegVersion('利用不可');
      }
    } catch (error) {
      console.error('FFmpeg確認中に例外が発生しました:', error);
      setFfmpegVersion('エラー');
    }
  }

  // TrimPane からのトリムポイント更新を処理する関数
  const handleUpdateTrimPoints = (mediaId: string, trimStart: number | null, trimEnd: number | null) => {
    updateMedia(mediaId, { 
      trimStart, 
      trimEnd
    });

    setStatus(`トリムポイントを更新: ${formatDuration(trimStart || 0)} - ${formatDuration(trimEnd || 0)}`);
  };

  // TrimPane からの再生位置変更要求を処理する関数
  const handleSeek = (time: number) => {
    if (videoPlayerRef.current) {
      videoPlayerRef.current.seekToTime(time);
    }
  };

  // ファイル追加処理
  async function handleAddFiles() {
    try {
      // ファイル選択ダイアログでパスを取得
      const filePaths = await window.api.invoke('open-file-dialog');
      
      if (filePaths && filePaths.length > 0) {
        setStatus(`ファイルを追加中...`);
        
        // メディアコンテキストを使用してファイルを追加
        const mediaFiles = await addMediaFiles(filePaths);
        
        if (mediaFiles.length > 0) {
          setStatus(`${mediaFiles.length}件のファイルを追加しました`);
        } else {
          setStatus('ファイルの追加に失敗しました');
        }
      }
    } catch (error) {
      console.error('ファイル追加中にエラーが発生しました:', error);
      setStatus('ファイル追加中にエラーが発生しました');
    }
  }

  // ドロップしたファイルを直接追加する処理
  async function handleDropFiles(filePaths: string[]) {
    try {
      setStatus(`${filePaths.length}件のファイルを処理中...`);
      
      // メディアコンテキストを使用してファイルを追加
      const mediaFiles = await addMediaFiles(filePaths);
      
      if (mediaFiles.length > 0) {
        setStatus(`${mediaFiles.length}件のファイルを追加しました`);
      } else {
        setStatus('ファイルの追加に失敗しました');
      }
    } catch (error) {
      console.error('ドロップファイル処理エラー:', error);
      setStatus('ファイル処理中にエラーが発生しました');
    }
  }

  // メディアファイルの並び替え処理
  const handleReorderMedia = ({ source, destination }: { source: number; destination: number }) => {
    reorderMediaFiles(source, destination);
    setStatus('メディアの順序を変更しました');
  };

  // メディアファイルの削除処理
  const handleDeleteMedias = (mediaIds: string[]) => {
    deleteMediaFiles(mediaIds);
    setStatus(`${mediaIds.length}件のメディアを削除しました`);
  };

  // メディア選択処理
  const handleSelectMedia = (media: MediaFile | null) => {
    selectMedia(media);
    
    if (media) {
      setStatus(`メディア「${media.name}」を選択しました`);
    } else {
      setStatus('メディア選択を解除しました');
    }
    // 選択されたメディアが動画の場合、自動的にVideoPlayerでロードされる
  };

  // タスク詳細パネルの表示/非表示を切り替え
  const toggleTaskDetails = () => {
    setShowTaskDetails(!showTaskDetails);
  };

  // エクスポート設定の表示/非表示を切り替え
  const toggleExportSettings = () => {
    setShowExportSettings(!showExportSettings);
  };

  // リサイズハンドルのレンダリング
  const renderResizeHandle = ({ className = "" } = {}) => (
    <PanelResizeHandle className={`resize-handle ${className}`}>
      <div className="handle-bar" />
    </PanelResizeHandle>
  );

  return (
    <div className={`app-container ${isDragging ? 'dragover' : ''}`} ref={appRef}>
      {/* ヘッダー */}
      <Header
        onAddFiles={handleAddFiles}
        onToggleExport={toggleExportSettings}
      />
      
      {/* メインコンテンツとタスク管理のラッパー */}
      <div className="main-content-wrapper">
        {/* メインコンテンツ */}
        <div className="app-content">
          {showExportSettings ? (
            <ExportSettings onClose={() => setShowExportSettings(false)} mediaFiles={mediaFiles} />
          ) : (
            <PanelGroup direction="horizontal" style={{ height: '100%', overflow: 'hidden' }}>
              {/* 左パネル: タイムライン */}
              <Panel defaultSize={25} minSize={15}>
                <TimelinePane
                  mediaFiles={mediaFiles}
                  selectedMedia={selectedMedia}
                  onSelectMedia={handleSelectMedia}
                  onAddFiles={handleAddFiles}
                  onDropFiles={handleDropFiles}
                  onReorderMedia={handleReorderMedia}
                  onDeleteMedias={handleDeleteMedias}
                  onUpdateMedia={updateMedia}
                />
              </Panel>
              
              {renderResizeHandle()}
              
              {/* 右パネル: プレーヤーとトリミングペイン */}
              <Panel defaultSize={75}>
                <PanelGroup direction="vertical" style={{ height: '100%', overflow: 'hidden' }}>
                  {/* 上部: ビデオプレーヤー */}
                  <Panel defaultSize={70} minSize={50}>
                    <VideoPlayer
                      ref={videoPlayerRef}
                      media={selectedMedia}
                      onTimeUpdate={setCurrentTime}
                    />
                  </Panel>
                  
                  {renderResizeHandle({ className: "horizontal" })}
                  
                  {/* 下部: トリミングペイン */}
                  <Panel defaultSize={30} minSize={20}>
                    <TrimPane 
                      selectedMedia={selectedMedia}
                      currentTime={currentTime}
                      onUpdateTrimPoints={handleUpdateTrimPoints}
                      onSeek={handleSeek}
                    />
                  </Panel>
                </PanelGroup>
              </Panel>
            </PanelGroup>
          )}
        </div>
        
        {/* タスク管理エリア: タスク詳細パネルとフッタータスクバー */}
        <div className="task-management-area">
          {/* タスク詳細パネル */}
          <TaskDetailsPanel
            open={showTaskDetails}
            onClose={() => setShowTaskDetails(false)}
          />
          
          {/* フッタータスクバー（旧ステータスバーの代わり） */}
          <FooterTaskBar
            ffmpegVersion={ffmpegVersion}
            onShowTaskDetails={toggleTaskDetails}
            status={status}
            totalDuration={totalDuration}
            isTaskDetailsOpen={showTaskDetails}
          />
        </div>
      </div>
    </div>
  );
};

export default App;