import React, { useState, useEffect, useRef } from 'react';
import { 
  Panel, 
  PanelGroup, 
  PanelResizeHandle 
} from 'react-resizable-panels';
import Header from './Header';
import TimelinePane from './TimelinePane';
import VideoPlayer, { VideoPlayerRef } from './VideoPlayer';
import TrimPane from './TrimPane';
import ExportSettings from './ExportSettings';
import FooterTaskBar from './FooterTaskBar';
import TaskDetailsPanel from './TaskDetailsPanel';
import { formatDuration } from '../../utils/formatters';
import { useTasks, useMediaFiles, useWaveform, useThumbnail } from '../hooks';
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
  const [isDragging, setIsDragging] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0); // 操作生成時間
  const [currentTime, setCurrentTime] = useState(0); // 現在の再生位置
  const [showTaskDetails, setShowTaskDetails] = useState(false); // タスク詳細パネルの表示状態
  const appRef = useRef<HTMLDivElement>(null);
  const videoPlayerRef = useRef<VideoPlayerRef>(null);

  // mediaFiles が変更されたら合計時間を再計算
  useEffect(() => {
    const duration = calcTotalDuration();
    setTotalDuration(duration);
  }, [mediaFiles, calcTotalDuration]);

  // キーボードショートカットの処理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // フォーム要素にフォーカスがある場合はショートカットを無視
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault(); // スクロールを防止
          videoPlayerRef.current?.togglePlayback();
          break;
        case 'k':
          videoPlayerRef.current?.stopPlayback();
          break;
        case 'j':
          e.preventDefault();
          const player = videoPlayerRef.current;
          if (!player) break;
          
          if (!player.isPlaying) {
            // 停止時は等速で逆再生
            player.changePlaybackRate(-1);
            player.togglePlayback();
          } else {
            const currentRate = player.playbackRate;
            if (currentRate > 0) {
              // 順方向再生中は速度を半分に
              const newRate = currentRate / 2;
              if (newRate < 0.25) {
                // 一定以下になったら逆方向に切り替え
                player.changePlaybackRate(-1);
              } else {
                player.changePlaybackRate(newRate);
              }
            } else {
              // 逆方向再生中は速度を2倍に
              const newRate = currentRate * 2;
              if (newRate < -2) {
                // 一定以上になったら順方向に切り替え
                player.changePlaybackRate(1);
              } else {
                player.changePlaybackRate(newRate);
              }
            }
          }
          break;
        case 'l':
          e.preventDefault();
          // 再生速度を速める
          const activePlayer = videoPlayerRef.current;
          if (!activePlayer) break;
          
          if (!activePlayer.isPlaying) {
            // 停止時は順方向再生開始
            activePlayer.changePlaybackRate(1);
            activePlayer.togglePlayback();
          } else {
            const rate = activePlayer.playbackRate;
            if (rate < 0) {
              // 逆再生中は速度を半分に
              const newRate = rate / 2;
              if (newRate > -0.25) {
                // 一定以下になったら順方向に切り替え
                activePlayer.changePlaybackRate(1);
              } else {
                activePlayer.changePlaybackRate(newRate);
              }
            } else {
              // 順方向再生中は速度を2倍に
              const newRate = rate * 2;
              if (newRate > 2) {
                // 一定以上は制限
                activePlayer.changePlaybackRate(2);
              } else {
                activePlayer.changePlaybackRate(newRate);
              }
            }
          }
          break;
        case 'arrowleft':
          // 5秒戻る
          e.preventDefault();
          videoPlayerRef.current?.seekRelative(-5);
          break;
        case 'arrowright':
          // 5秒進む
          e.preventDefault();
          videoPlayerRef.current?.seekRelative(5);
          break;
        case 'arrowup':
          // 音量上げる
          e.preventDefault();
          videoPlayerRef.current?.changeVolume(0.1);
          break;
        case 'arrowdown':
          // 音量下げる
          e.preventDefault();
          videoPlayerRef.current?.changeVolume(-0.1);
          break;
        case 'm':
          // ミュート切り替え
          videoPlayerRef.current?.toggleMute();
          break;
        case 'i':
          // I で In point（トリム開始位置）を設定
          if (selectedMedia && videoPlayerRef.current) {
            const currentPlayerTime = videoPlayerRef.current.getCurrentTime();
            handleUpdateTrimPoints(selectedMedia.id, currentPlayerTime, selectedMedia.trimEnd ?? null);
          }
          break;
        case 'o':
          // O で Out point（トリム終了位置）を設定
          if (selectedMedia && videoPlayerRef.current) {
            const currentPlayerTime = videoPlayerRef.current.getCurrentTime();
            handleUpdateTrimPoints(selectedMedia.id, selectedMedia.trimStart ?? null, currentPlayerTime);
          }
          break;
        case 'escape':
          // ESC でエクスポート設定を閉じる
          if (showExportSettings) {
            setShowExportSettings(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedMedia, showExportSettings]);

  // FFmpegバージョン確認
  useEffect(() => {
    checkFfmpegVersion();
    
    // ドラッグ&ドロップイベントのリスナー登録
    if (appRef.current) {
      const appElement = appRef.current;
      appElement.addEventListener('dragover', handleDragOver);
      appElement.addEventListener('dragleave', handleDragLeave);
      appElement.addEventListener('drop', handleDrop);
      
      return () => {
        appElement.removeEventListener('dragover', handleDragOver);
        appElement.removeEventListener('dragleave', handleDragLeave);
        appElement.removeEventListener('drop', handleDrop);
      };
    }
  }, []);

  // TrimPane からのトリムポイント更新を処理する関数
  const handleUpdateTrimPoints = (mediaId: string, trimStart: number | null, trimEnd: number | null) => {
    if (!mediaId) return;
    
    // MediaContextのupdateTrimPointsを使用
    updateMedia(mediaId, { 
      trimStart: trimStart !== null ? Math.max(0, trimStart) : null, 
      trimEnd 
    });
  };

  // TrimPane からの再生位置変更要求を処理する関数
  const handleSeek = (time: number) => {
    if (videoPlayerRef.current) {
      videoPlayerRef.current.seekToTime(time);
    }
  };

  // FFmpegバージョン確認
  const checkFfmpegVersion = async () => {
    if (window.api && window.api.checkFFmpeg) {
      try {
        const result = await window.api.checkFFmpeg();
        if (result && result.version) {
          setFfmpegVersion(result.version);
        }
      } catch (error) {
        console.error('FFmpeg確認エラー:', error);
      }
    }
  };

  // ドラッグ&ドロップの設定
  const handleDragOver = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    e.dataTransfer.dropEffect = 'copy';
    
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const filePaths: string[] = [];
      
      // Electron のドラッグドロップでは File オブジェクトに path プロパティが追加される
      for (let i = 0; i < files.length; i++) {
        const file = files[i] as any;
        if (file.path) {
          filePaths.push(file.path);
        }
      }
      
      if (filePaths.length > 0) {
        handleDropFiles(filePaths);
      }
    }
  };

  // ファイル追加処理
  const handleAddFiles = async () => {
    if (!window.api || !window.api.openFileDialog) {
      console.error('ファイル選択APIが利用できません');
      return;
    }
    
    try {
      setStatus('ファイル選択中...');
      
      // ファイル選択ダイアログを表示
      const filePaths = await window.api.openFileDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'メディアファイル', extensions: ['mp4', 'webm', 'mov', 'mp3', 'wav', 'aac', 'm4a'] },
          { name: 'すべてのファイル', extensions: ['*'] }
        ]
      });
      
      if (!filePaths || filePaths.length === 0) {
        setStatus('ファイル選択がキャンセルされました');
        return;
      }
      
      setStatus(`${filePaths.length}個のファイルを処理中...`);
      console.log('選択されたファイル:', filePaths);
      
      // メディアファイル追加処理
      const addedFiles = await addMediaFiles(filePaths);
      
      if (addedFiles.length > 0) {
        setStatus(`${addedFiles.length}個のファイルを追加しました`);
      } else {
        setStatus('ファイルの追加に失敗しました');
      }
    } catch (error) {
      console.error('ファイル追加エラー:', error);
      setStatus('ファイル追加中にエラーが発生しました');
    }
  };

  // ドロップしたファイルを直接追加する処理
  const handleDropFiles = async (filePaths: string[]) => {
    try {
      setStatus(`${filePaths.length}個のファイルを処理中...`);
      const addedFiles = await addMediaFiles(filePaths);
      setStatus(`${addedFiles.length}個のファイルを追加しました`);
    } catch (error) {
      console.error('ドロップファイル処理エラー:', error);
      setStatus('ファイル処理中にエラーが発生しました');
    }
  };

  // メディアファイルの並び替え処理
  const handleReorderMedia = ({ source, destination }: { source: number; destination: number }) => {
    if (destination === undefined || source === destination) {
      return;
    }
    
    reorderMediaFiles(source, destination);
    setStatus('メディアリストを並び替えました');
  };

  // メディアファイルの削除処理
  const handleDeleteMedias = (mediaIds: string[]) => {
    if (!mediaIds || mediaIds.length === 0) return;
    
    deleteMediaFiles(mediaIds);
    setStatus(`${mediaIds.length}個のメディアを削除しました`);
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