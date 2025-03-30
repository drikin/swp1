import React, { useState, useEffect, useRef } from 'react';
import { 
  Panel, 
  PanelGroup, 
  PanelResizeHandle 
} from 'react-resizable-panels';
import Header from './Header';
import MediaList from './MediaList';
import VideoPlayer from './VideoPlayer';
import Timeline from './Timeline';
import TrimControls from './TrimControls';
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
          const files = await window.api.openFileDialog(filePaths);
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
          <ExportSettings onClose={() => setShowExportSettings(false)} />
        ) : (
          <PanelGroup direction="horizontal">
            {/* 左パネル: メディアリスト */}
            <Panel defaultSize={25} minSize={15}>
              <MediaList
                mediaFiles={mediaFiles}
                selectedMedia={selectedMedia}
                onSelectMedia={handleSelectMedia}
              />
            </Panel>
            
            {renderResizeHandle()}
            
            {/* 右パネル: プレーヤーとタイムライン */}
            <Panel defaultSize={75}>
              <PanelGroup direction="vertical">
                {/* 上部: ビデオプレーヤー */}
                <Panel defaultSize={50} minSize={30}>
                  <VideoPlayer
                    media={selectedMedia}
                  />
                </Panel>
                
                {renderResizeHandle({ className: "horizontal" })}
                
                {/* 下部: タイムラインとトリミング */}
                <Panel defaultSize={50}>
                  <PanelGroup direction="vertical">
                    <Panel defaultSize={70} minSize={40}>
                      <Timeline 
                        selectedMedia={selectedMedia}
                      />
                    </Panel>
                    
                    {renderResizeHandle({ className: "horizontal" })}
                    
                    <Panel defaultSize={30}>
                      <TrimControls />
                    </Panel>
                  </PanelGroup>
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