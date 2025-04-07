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
import { TaskProvider } from './TaskContext';
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
  const [currentTime, setCurrentTime] = useState(0); // Add currentTime state
  const [showTaskDetails, setShowTaskDetails] = useState(false); // タスク詳細パネルの表示状態
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

  // TrimPane からのトリムポイント更新を処理する関数
  const handleUpdateTrimPoints = (mediaId: string, trimStart: number | null, trimEnd: number | null) => {
    setMediaFiles(prevFiles => 
      prevFiles.map(file => 
        file.id === mediaId ? { ...file, trimStart: trimStart ?? undefined, trimEnd: trimEnd ?? undefined } : file
      )
    );
    // 必要に応じてステータス更新やログ表示
    // console.log(`Updated trim points for ${mediaId}:`, { trimStart, trimEnd });
  };

  // TrimPane からの再生位置変更要求を処理する関数
  const handleSeek = (time: number) => {
    videoPlayerRef.current?.seekToTime(time);
    // 必要に応じて currentTime ステートも更新（videoPlayer の onTimeUpdate で更新されるはず）
    // setCurrentTime(time); 
  };

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

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      
      // ドロップされたファイルを取得
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        // 添付されたファイルを処理
        const filePaths: string[] = [];
        Array.from(e.dataTransfer.files).forEach((file) => {
          // ElectronFileとして扱う
          const electronFile = file as unknown as ElectronFile;
          if (electronFile.path) {
            filePaths.push(electronFile.path);
          }
        });
        
        // ファイルが有効な場合は処理を続行
        if (filePaths.length > 0) {
          handleDropFiles(filePaths);
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
        const filePaths = await window.api.openFileDialog([]);
        if (filePaths && filePaths.length > 0) {
          // ファイルパスからメディア情報を取得
          const newFiles: any[] = [];
          
          for (const path of filePaths) {
            try {
              // メディア情報を取得
              const mediaInfo = await window.api.getMediaInfo(path);
              if (mediaInfo) {
                newFiles.push(mediaInfo);
              }
            } catch (error) {
              console.error('メディア情報取得エラー:', error);
            }
          }
          
          // 有効なメディアファイルが取得できた場合
          if (newFiles.length > 0) {
            setMediaFiles(prev => [...prev, ...newFiles]);
            setStatus(`${newFiles.length}件のファイルを追加しました`);
            
            // 追加されたファイルについて自動的にラウドネス測定を開始
            newFiles.forEach(file => {
              // ファイルの種類をチェック
              if (file.type === 'video' || file.type === 'audio') {
                startLoudnessMeasurement(file);
              }
            });
          } else {
            setStatus('有効なメディアファイルが見つかりませんでした');
          }
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
    
    // メディアとパスの検証
    if (!media || !media.id || !media.path) {
      console.error('ラウドネス測定エラー: 無効なメディアまたはパス', media);
      return;
    }
    
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
      setStatus(`${media.name || 'メディア'}のラウドネス測定に失敗しました`);
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

  // ラウドネス測定イベントリスナー
  useEffect(() => {
    if (window.api) {
      // ラウドネス測定完了イベント
      const removeMeasuredListener = window.api.on('loudness-measured', (data: { id: string, loudnessInfo: any }) => {
        const { id, loudnessInfo } = data;
        console.log('ラウドネス測定完了イベント受信:', id, loudnessInfo);
        
        setMediaFiles(prev => {
          // 対象メディアを見つける
          const targetMedia = prev.find(m => m.id === id);
          const mediaName = targetMedia?.name || 'メディア';
          
          // 状態更新後に完了メッセージを表示
          setTimeout(() => {
            setStatus(`${mediaName}のラウドネス測定が完了しました`);
          }, 0);
          
          // メディア状態を更新して返す
          return prev.map(m => 
            m.id === id ? { 
              ...m, 
              loudnessInfo, 
              loudnessNormalization: true, 
              isMeasuringLoudness: false 
            } : m
          );
        });
      });
      
      // ラウドネス測定エラーイベント
      const removeErrorListener = window.api.on('loudness-error', (data: { id: string, error?: string }) => {
        const { id, error } = data;
        console.log('ラウドネス測定エラーイベント受信:', id, error || 'エラー詳細なし');
        
        setMediaFiles(prev => {
          // 対象メディアを見つける
          const targetMedia = prev.find(m => m.id === id);
          const mediaName = targetMedia?.name || 'メディア';
          
          // 状態更新後にエラーメッセージを表示
          setTimeout(() => {
            const errorMessage = error === 'タイムアウト' 
              ? `${mediaName}のラウドネス測定がタイムアウトしました` 
              : `${mediaName}のラウドネス測定に失敗しました`;
            setStatus(errorMessage);
          }, 0);
          
          // メディア状態を更新して返す
          return prev.map(m => 
            m.id === id ? { 
              ...m, 
              isMeasuringLoudness: false, 
              loudnessError: true 
            } : m
          );
        });
      });
      
      return () => {
        removeMeasuredListener();
        removeErrorListener();
      };
    }
  }, []);

  // サムネイル生成用のヘルパー関数
  const generateThumbnailForMedia = (media: any) => {
    if (!window.api || !media || !media.id || !media.path) {
      return;
    }
    
    // すでにサムネイル生成中または完了していたら処理しない
    if (media.thumbnailGenerating || media.thumbnail) {
      console.log('このメディアはすでにサムネイル生成中または完了しています:', media.id);
      return;
    }
    
    // API が利用可能かどうかを確認（ネストされたプロパティアクセスを避ける）
    if (typeof window.api.generateThumbnail !== 'function') {
      console.error('generateThumbnail 関数が利用できません');
      return;
    }
    
    console.log('サムネイル生成要求:', media.id, media.path);
    
    // サムネイル生成中フラグを設定（メディア情報を更新）
    handleUpdateMedia(media.id, { thumbnailGenerating: true });
    
    // メディアパスとIDを個別に渡す
    try {
      window.api.generateThumbnail(media.path, media.id)
        .then((result: any) => {
          if (result) {
            console.log('サムネイル生成成功:', media.id);
            // サムネイル生成完了フラグを設定
            handleUpdateMedia(media.id, { 
              thumbnail: result,
              thumbnailGenerating: false 
            });
          } else {
            console.warn('サムネイル生成結果がnullです:', media.id);
            handleUpdateMedia(media.id, { thumbnailGenerating: false });
          }
        })
        .catch((error: Error) => {
          console.error('サムネイル生成エラー:', media.id, error);
          handleUpdateMedia(media.id, { thumbnailGenerating: false });
        });
    } catch (error) {
      console.error('サムネイル生成の呼び出しエラー:', error);
      handleUpdateMedia(media.id, { thumbnailGenerating: false });
    }
  };
  
  // コンポーネントがマウントされたときに既存のメディアファイルのサムネイルを生成
  useEffect(() => {
    if (mediaFiles.length > 0 && window.api) {
      // API が利用可能かどうかを確認
      if (typeof window.api.generateThumbnail === 'function') {
        console.log('既存メディアファイルのサムネイル生成開始:', mediaFiles.length, '件');
        mediaFiles.forEach(media => {
          generateThumbnailForMedia(media);
        });
      }
    }
  }, [mediaFiles]);

  // ドロップしたファイルを直接追加する処理
  const handleDropFiles = async (filePaths: string[]) => {
    // 無効なパスを除外
    const validPaths = filePaths.filter(path => path && typeof path === 'string');
    
    if (validPaths.length === 0) {
      console.error('有効なファイルパスがありません');
      setStatus('有効なファイルがドロップされませんでした');
      return;
    }
    
    const newFiles: any[] = [];
    
    // ローディング状態を設定
    setStatus('ファイルを処理中...');
    
    for (const path of validPaths) {
      try {
        // メディア情報を取得（ファイルサイズ、ID情報を含む）
        const mediaInfo = await window.api.getMediaInfo(path);
        if (mediaInfo) {
          // main.jsから返されたIDとサイズをそのまま使用
          console.log('メディア情報を取得:', mediaInfo);
          
          // 必須プロパティが揃っているか確認（念のため）
          if (!mediaInfo.id) {
            mediaInfo.id = `file-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          }
          
          if (!mediaInfo.name) {
            const fileName = path.split('/').pop() || 'unknown';
            mediaInfo.name = fileName;
          }
          
          if (!mediaInfo.path) {
            mediaInfo.path = path;
          }
          
          // タイプ情報を確認
          if (!mediaInfo.type) {
            mediaInfo.type = mediaInfo.video ? 'video' : (mediaInfo.audio ? 'audio' : 'unknown');
          }
          
          // サイズが数値型であることを確認
          if (typeof mediaInfo.size !== 'number') {
            const sizeNum = parseInt(mediaInfo.size, 10);
            mediaInfo.size = isNaN(sizeNum) ? 0 : sizeNum;
          }
          
          newFiles.push(mediaInfo);
        }
      } catch (error) {
        console.error('Media info retrieval failed:', error);
      }
    }
    
    if (newFiles.length > 0) {
      // 新しいファイルを追加
      setMediaFiles(prev => [...prev, ...newFiles]);
      
      // メディア情報のログ出力（デバッグ用）
      console.log('追加されたメディア:', newFiles);
      
      // 明示的にサムネイル生成とラウドネス測定を呼び出し
      newFiles.forEach(media => {
        if (media.id && media.path) {
          // サムネイル生成を要求
          generateThumbnailForMedia(media);
          
          // ラウドネス測定を開始
          startLoudnessMeasurement(media);
        } else {
          console.error('無効なメディアオブジェクト：IDまたはパスがありません', media);
        }
      });
      
      setStatus(`${newFiles.length}個のファイルを追加しました`);
    } else {
      setStatus('サポートされていないファイル形式です');
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
    <TaskProvider>
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
            <PanelGroup direction="horizontal" style={{ height: '100%' }}>
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
    </TaskProvider>
  );
};

export default App;