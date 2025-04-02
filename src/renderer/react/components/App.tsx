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
import { formatDuration } from '../../utils/formatters';

// Electronでのファイル型拡張（pathプロパティを持つ）
interface ElectronFile extends File {
  path: string;
}

// アプリケーションのメインコンポーネント
const App: React.FC = () => {
  // アプリケーションの状態
  const [mediaFiles, setMediaFiles] = useState<any[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<any | null>(null);
  const [status, setStatus] = useState('準備完了');
  const [ffmpegVersion, setFfmpegVersion] = useState('');
  const [showExportSettings, setShowExportSettings] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0); // 操作生成時間
  const appRef = useRef<HTMLDivElement>(null);
  const videoPlayerRef = useRef<VideoPlayerRef>(null);

  // 操作生成時間の計算関数
  const calculateTotalDuration = (files: any[]): number => {
    return files.reduce((total, file) => {
      const startTime = file.trimStart ?? 0;
      const endTime = file.trimEnd ?? file.duration; // trimEnd がなければ duration を使用
      const duration = (endTime && startTime !== undefined) ? endTime - startTime : (file.duration ?? 0);
      return total + (duration > 0 ? duration : 0);
    }, 0);
  };

  // mediaFiles が変更されたら合計時間を再計算
  useEffect(() => {
    const duration = calculateTotalDuration(mediaFiles);
    setTotalDuration(duration);
  }, [mediaFiles]);

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
              const newRate = Math.max(-8, currentRate * 2);
              player.changePlaybackRate(newRate);
            }
          }
          break;
        case 'l':
          e.preventDefault();
          const videoPlayer = videoPlayerRef.current;
          if (!videoPlayer) break;
          
          if (!videoPlayer.isPlaying) {
            // 停止時は等速で順再生
            videoPlayer.changePlaybackRate(1);
            videoPlayer.togglePlayback();
          } else {
            const currentRate = videoPlayer.playbackRate;
            if (currentRate < 0) {
              // 逆方向再生中は速度を半分に
              const newRate = currentRate / 2;
              if (newRate > -0.25) {
                // 一定以上になったら順方向に切り替え
                videoPlayer.changePlaybackRate(1);
              } else {
                videoPlayer.changePlaybackRate(newRate);
              }
            } else {
              // 順方向再生中は速度を2倍に
              const newRate = Math.min(8, currentRate * 2);
              videoPlayer.changePlaybackRate(newRate);
            }
          }
          break;
        case 'e':
          // Command+E または Ctrl+E で書き出し設定を開く
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            toggleExportSettings();
          }
          break;
        case 'a':
          // Command+A または Ctrl+A で素材を追加
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            handleAddFiles();
          }
          break;
        case 'arrowup':
        case 'p': // Pキーを上矢印と同じ機能にマッピング
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
        case 'n': // Nキーを下矢印と同じ機能にマッピング
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
            
            // 追加されたファイルについて自動的にラウドネス測定を開始
            files.forEach(file => {
              if (file.type === 'video' || file.type === 'audio') {
                startLoudnessMeasurement(file);
              }
            });
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
          
          // 追加されたファイルについて自動的にラウドネス測定を開始
          files.forEach(file => {
            if (file.type === 'video' || file.type === 'audio') {
              startLoudnessMeasurement(file);
            }
          });
        }
      } catch (error) {
        console.error('ファイル選択エラー:', error);
        setStatus('ファイル選択に失敗しました');
      }
    }
  };
  
  // ラウドネス測定を開始する関数
  const startLoudnessMeasurement = async (media: any) => {
    if (!window.api) return;
    
    try {
      // 測定中フラグを設定
      setMediaFiles(prev => prev.map(m => 
        m.id === media.id ? { ...m, isMeasuringLoudness: true } : m
      ));
      
      // バックグラウンドでラウドネス測定を実行（IDをパスと一緒に渡す）
      const loudnessInfo = await window.api.measureLoudness(`${media.id}|${media.path}`);
      
      // 測定結果を反映
      setMediaFiles(prev => prev.map(m => 
        m.id === media.id ? { 
          ...m, 
          loudnessInfo, 
          loudnessNormalization: true, 
          isMeasuringLoudness: false 
        } : m
      ));
      
      setStatus(`${media.name}のラウドネス測定が完了しました`);
    } catch (error) {
      console.error('ラウドネス測定エラー:', error);
      // エラー状態を設定
      setMediaFiles(prev => prev.map(m => 
        m.id === media.id ? { ...m, isMeasuringLoudness: false, loudnessError: true } : m
      ));
      setStatus(`${media.name}のラウドネス測定に失敗しました`);
    }
  };

  // サムネイル生成イベントリスナー
  useEffect(() => {
    if (window.api) {
      const removeListener = window.api.on('thumbnail-generated', (data: { id: string, thumbnail: string }) => {
        const { id, thumbnail } = data;
        setMediaFiles(prev => prev.map(media => 
          media.id === id ? { ...media, thumbnail } : media
        ));
      });
      
      return () => {
        removeListener();
      };
    }
  }, []);

  // ドロップしたファイルを直接追加する処理
  const handleDropFiles = async (filePaths: string[]) => {
    if (filePaths.length > 0 && window.api) {
      try {
        // ファイルパスを直接渡して処理（ダイアログをスキップ）
        const files = await window.api.openFileDialog(filePaths);
        if (files && files.length > 0) {
          setMediaFiles(prev => [...prev, ...files]);
          setStatus(`${files.length}件のファイルを追加しました`);
          
          // 追加されたファイルについて自動的にラウドネス測定を開始
          files.forEach(file => {
            if (file.type === 'video' || file.type === 'audio') {
              startLoudnessMeasurement(file);
            }
          });
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

  // クリップのメディア情報を更新
  const handleUpdateMedia = (mediaId: string, updates: any) => {
    setMediaFiles(prev => 
      prev.map(media => 
        media.id === mediaId 
          ? { ...media, ...updates } 
          : media
      )
    );
    
    // 選択中のメディアの場合も更新
    if (selectedMedia && selectedMedia.id === mediaId) {
      setSelectedMedia((prev: any) => ({ ...prev, ...updates }));
    }
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
                onUpdateMedia={handleUpdateMedia}
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
        totalDuration={totalDuration} // 操作生成時間を渡す
      />
    </div>
  );
};

export default App;