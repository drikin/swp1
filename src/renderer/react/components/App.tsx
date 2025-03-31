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
import StatusBar from './StatusBar';

// Electronでのファイル型拡張（pathプロパティを持つ）
interface ElectronFile extends File {
  path: string;
}

// アプリケーションのメインコンポーネント
const App: React.FC = () => {
  // アプリケーションの状態
  const [mediaFiles, setMediaFiles] = useState<any[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<any | null>(null);
  const [taskCount, setTaskCount] = useState(0);
  const [status, setStatus] = useState('準備完了');
  const [ffmpegVersion, setFfmpegVersion] = useState('');
  const [showExportSettings, setShowExportSettings] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const appRef = useRef<HTMLDivElement>(null);
  const videoPlayerRef = useRef<VideoPlayerRef>(null);

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
          const currentRate = videoPlayerRef.current?.playbackRate || 1;
          const newRate = currentRate >= 8 ? 2 : currentRate * 2;
          videoPlayerRef.current?.changePlaybackRate(-newRate);
          break;
        case 'l':
          e.preventDefault();
          const currentForwardRate = videoPlayerRef.current?.playbackRate || 1;
          const newForwardRate = currentForwardRate >= 8 ? 2 : currentForwardRate * 2;
          videoPlayerRef.current?.changePlaybackRate(newForwardRate);
          break;
        case 'arrowup':
        case 'p':
          e.preventDefault();
          if (selectedMedia) {
            const currentIndex = mediaFiles.findIndex(m => m.id === selectedMedia.id);
            if (currentIndex > 0) {
              const newMedia = mediaFiles[currentIndex - 1];
              setSelectedMedia(newMedia);
            }
          }
          break;
        case 'arrowdown':
        case 'n':
          e.preventDefault();
          if (selectedMedia) {
            const currentIndex = mediaFiles.findIndex(m => m.id === selectedMedia.id);
            if (currentIndex < mediaFiles.length - 1) {
              const newMedia = mediaFiles[currentIndex + 1];
              setSelectedMedia(newMedia);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMedia, mediaFiles]);

  // アプリケーション起動時の処理
  useEffect(() => {
    // FFmpegバージョンの取得
    if (window.api) {
      window.api.checkFFmpeg().then((result: any) => {
        setFfmpegVersion(`FFmpeg ${result.version || 'available'}`);
      }).catch(() => {
        setFfmpegVersion('FFmpeg not found');
      });
    }

    // ドラッグ&ドロップの設定
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      
      if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      
      const filePaths: string[] = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i] as ElectronFile;
        if (file.path) {
          filePaths.push(file.path);
        }
      }
      
      if (filePaths.length > 0 && window.api) {
        try {
          // ファイルパスを直接渡して処理（ダイアログをスキップ）
          const files = await window.api.openFileDialog(filePaths);
          if (files && files.length > 0) {
            setMediaFiles(prev => [...prev, ...files]);
            setStatus(`${files.length}件のファイルを追加しました`);
          }
        } catch (error) {
          console.error('ファイル追加エラー:', error);
          setStatus('ファイル追加に失敗しました');
        }
      }
    };

    const container = appRef.current;
    if (container) {
      container.addEventListener('dragover', handleDragOver as unknown as EventListener);
      container.addEventListener('dragleave', handleDragLeave as unknown as EventListener);
      container.addEventListener('drop', handleDrop as unknown as EventListener);
    }

    return () => {
      if (container) {
        container.removeEventListener('dragover', handleDragOver as unknown as EventListener);
        container.removeEventListener('dragleave', handleDragLeave as unknown as EventListener);
        container.removeEventListener('drop', handleDrop as unknown as EventListener);
      }
    };
  }, []);

  // ファイル追加処理
  const handleAddFiles = async () => {
    if (window.api) {
      try {
        // 空の配列を渡してファイル選択ダイアログを表示
        const files = await window.api.openFileDialog([]);
        if (files && files.length > 0) {
          setMediaFiles(prev => [...prev, ...files]);
          setStatus(`${files.length}件のファイルを追加しました`);
        }
      } catch (error) {
        console.error('ファイル選択エラー:', error);
        setStatus('ファイル選択に失敗しました');
      }
    }
  };

  // ドロップしたファイルを直接追加する処理
  const handleDropFiles = async (filePaths: string[]) => {
    if (filePaths.length > 0 && window.api) {
      try {
        // ファイルパスを直接渡して処理（ダイアログをスキップ）
        const files = await window.api.openFileDialog(filePaths);
        if (files && files.length > 0) {
          setMediaFiles(prev => [...prev, ...files]);
          setStatus(`${files.length}件のファイルを追加しました`);
        }
      } catch (error) {
        console.error('ファイル追加エラー:', error);
        setStatus('ファイル追加に失敗しました');
      }
    }
  };

  // メディアファイルの並び替え処理
  const handleReorderMedia = (result: { source: number; destination: number }) => {
    const { source, destination } = result;
    
    // 並び替え処理
    const reorderedFiles = Array.from(mediaFiles);
    const [removed] = reorderedFiles.splice(source, 1);
    reorderedFiles.splice(destination, 0, removed);
    
    // 状態を更新
    setMediaFiles(reorderedFiles);
    setStatus('素材の順序を変更しました');
  };

  // メディアファイルの削除処理
  const handleDeleteMedias = (mediaIds: string[]) => {
    // 削除対象ではないファイルだけを残す
    const remainingFiles = mediaFiles.filter(media => !mediaIds.includes(media.id));
    
    // 状態を更新
    setMediaFiles(remainingFiles);
    
    // 選択中のメディアが削除された場合は選択を解除
    if (selectedMedia && mediaIds.includes(selectedMedia.id)) {
      setSelectedMedia(null);
    }
    
    setStatus(`${mediaIds.length}件の素材を削除しました`);
  };

  // メディア選択処理
  const handleSelectMedia = (media: any) => {
    setSelectedMedia(media);
    setStatus(`${media.name}を選択しました`);
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
        taskCount={taskCount}
        onAddFiles={handleAddFiles}
        onToggleExport={toggleExportSettings}
      />
      
      {/* メインコンテンツ */}
      <div className="app-content">
        {showExportSettings ? (
          <ExportSettings onClose={() => setShowExportSettings(false)} mediaFiles={mediaFiles} />
        ) : (
          <PanelGroup direction="horizontal">
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
              />
            </Panel>
            
            {renderResizeHandle()}
            
            {/* 右パネル: プレーヤーとトリミングペイン */}
            <Panel defaultSize={75}>
              <PanelGroup direction="vertical">
                {/* 上部: ビデオプレーヤー */}
                <Panel defaultSize={70} minSize={50}>
                  <VideoPlayer
                    ref={videoPlayerRef}
                    media={selectedMedia}
                  />
                </Panel>
                
                {renderResizeHandle({ className: "horizontal" })}
                
                {/* 下部: トリミングペイン */}
                <Panel defaultSize={30} minSize={20}>
                  <TrimPane 
                    selectedMedia={selectedMedia}
                  />
                </Panel>
              </PanelGroup>
            </Panel>
          </PanelGroup>
        )}
      </div>
      
      {/* ステータスバー */}
      <StatusBar
        status={status}
        ffmpegVersion={ffmpegVersion}
      />
    </div>
  );
};

export default App; 