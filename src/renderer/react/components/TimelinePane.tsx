import React, { useState, useRef, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface TimelinePaneProps {
  mediaFiles: any[];
  selectedMedia: any | null;
  onSelectMedia: (media: any) => void;
  onAddFiles?: () => Promise<void>; // ファイル追加関数
  onDropFiles?: (filePaths: string[]) => Promise<void>; // ドロップしたファイルを直接追加する関数
  onReorderMedia?: (result: { source: number; destination: number }) => void; // 素材の並び替え関数
  onDeleteMedias?: (mediaIds: string[]) => void; // 素材削除関数
  onUpdateMedia?: (mediaId: string, updates: any) => void; // 素材更新関数
}

// Electronでのファイル型拡張（pathプロパティを持つ）
interface ElectronFile extends File {
  path: string;
}

// タイムラインペインコンポーネント
const TimelinePane: React.FC<TimelinePaneProps> = ({
  mediaFiles,
  selectedMedia,
  onSelectMedia,
  onAddFiles,
  onDropFiles,
  onReorderMedia,
  onDeleteMedias,
  onUpdateMedia
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedMedias, setSelectedMedias] = useState<string[]>([]);
  // サムネイルの状態を保存する形式を変更（ファイルパス形式で扱う）
  const [thumbnails, setThumbnails] = useState<Record<string, { path: string, url?: string }>>({}); 
  const [measuringLoudness, setMeasuringLoudness] = useState<Record<string, boolean>>({});
  const [loudnessErrors, setLoudnessErrors] = useState<Record<string, boolean>>({});
  const timelinePaneRef = useRef<HTMLDivElement>(null);

  // 単一メディア選択時に選択リストも更新
  useEffect(() => {
    if (selectedMedia) {
      // 単一選択の場合は選択リストをリセット
      setSelectedMedias([selectedMedia.id]);
    }
  }, [selectedMedia]);

  // サムネイル更新イベントのリスナー設定
  useEffect(() => {
    if (window.api && window.api.on) {
      console.log('サムネイルリスナーを設定します...');
      
      // サムネイル生成イベントハンドラ
      const handleThumbnailGenerated = (data: { id: string; filePath?: string }) => {
        console.log('サムネイル生成イベント受信:', data);
        
        if (!data.id) {
          console.error('サムネイルデータにIDがありません');
          return;
        }
        
        // filePathがある場合のみ処理（既にpreload.jsでfile://プロトコルが追加済み）
        if (data.filePath) {
          console.log('サムネイルパスを使用:', data.filePath);
          
          // サムネイル情報を保存
          setThumbnails(prev => {
            const newThumbnails = {
              ...prev,
              [data.id]: { 
                path: data.filePath || '',
                url: data.filePath  // ファイルパスをそのまま使用（preload.jsで処理済み）
              }
            };
            console.log('サムネイル保存完了:', data.id, 'サムネイル数:', Object.keys(newThumbnails).length);
            return newThumbnails;
          });
        } else {
          console.log('サムネイルデータがありません:', data.id);
        }
      };
      
      const removeListener = window.api.on('thumbnail-generated', handleThumbnailGenerated);
      
      // 初期化時にサムネイル状態をログ出力
      console.log('サムネイルリスナー設定完了');

      return () => {
        if (removeListener) {
          removeListener();
        }
      };
    }
  }, []);

  // メディアデータが変更されたときのログ出力を追加
  useEffect(() => {
    if (mediaFiles && mediaFiles.length > 0) {
      console.log('メディアファイル一覧:', mediaFiles);
      console.log('現在のサムネイル状態:', thumbnails);
      
      // メディアIDとサムネイルIDの一致を確認
      const mediaIds = mediaFiles.map(media => media.id);
      const thumbnailIds = Object.keys(thumbnails);
      
      console.log('メディアID一覧:', mediaIds);
      console.log('サムネイルID一覧:', thumbnailIds);
      
      // メディアとサムネイルの対応関係を確認
      mediaFiles.forEach(media => {
        if (media.id && thumbnails[media.id]) {
          console.log(`メディア ${media.id} のサムネイル情報:`, thumbnails[media.id]);
        } else if (media.id) {
          console.log(`メディア ${media.id} のサムネイルがありません`);
        }
      });
    }
  }, [mediaFiles, thumbnails]);

  // ラウドネス測定結果のリスナー設定
  useEffect(() => {
    if (window.api && window.api.on) {
      const handleLoudnessMeasured = (data: { id: string; loudnessInfo: any }) => {
        if (onUpdateMedia && data.id && data.loudnessInfo) {
          onUpdateMedia(data.id, { 
            loudnessInfo: data.loudnessInfo,
            // デフォルトで有効にする
            loudnessNormalization: true
          });
          // 測定中フラグを解除
          setMeasuringLoudness(prev => ({
            ...prev,
            [data.id]: false
          }));
        }
      };

      const removeListener = window.api.on('loudness-measured', handleLoudnessMeasured);

      return () => {
        if (removeListener) {
          removeListener();
        }
      };
    }
  }, [onUpdateMedia]);

  // ラウドネスエラーのリスナー設定
  useEffect(() => {
    if (window.api && window.api.on) {
      const handleLoudnessError = (data: { id: string }) => {
        if (data && data.id) {
          setLoudnessErrors(prev => ({
            ...prev,
            [data.id]: true
          }));
          
          // 測定中フラグも解除
          setMeasuringLoudness(prev => ({
            ...prev,
            [data.id]: false
          }));
        }
      };

      const removeListener = window.api.on('loudness-error', handleLoudnessError);

      return () => {
        if (removeListener) {
          removeListener();
        }
      };
    }
  }, []);

  // ドラッグ&ドロップ処理の設定
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      // ドラッグ中のデータにファイルが含まれている場合のみドラッグ状態を有効にする
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        setIsDragging(true);
      }
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
      
      // ファイルのドロップ処理
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const filePaths: string[] = [];
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const file = e.dataTransfer.files[i] as ElectronFile;
          if (file.path) {
            filePaths.push(file.path);
          }
        }
        
        // ドロップされたファイルパスを直接処理
        if (filePaths.length > 0 && onDropFiles) {
          await onDropFiles(filePaths);
        }
      }
    };

    const container = timelinePaneRef.current;
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
  }, [onDropFiles]);

  // ラウドネス測定関数
  const handleMeasureLoudness = async (media: any, e: React.MouseEvent) => {
    e.stopPropagation(); // イベントの伝播を防止
    if (!window.api) return;

    // メディアとパスが存在することを確認
    if (!media || !media.path || !media.id) {
      console.error('ラウドネス測定エラー: 無効なメディアまたはパス');
      setLoudnessErrors(prev => ({
        ...prev,
        [media?.id || 'unknown']: true
      }));
      return;
    }

    try {
      console.log(`タイムラインからラウドネス測定開始: ${media.path}`);
      
      // 測定中フラグを設定
      setMeasuringLoudness(prev => ({
        ...prev,
        [media.id]: true
      }));
      
      // エラーフラグをリセット
      setLoudnessErrors(prev => {
        const newErrors = {...prev};
        delete newErrors[media.id];
        return newErrors;
      });

      // メディアの更新も行う（isMeasuringLUFSフラグを設定）
      if (onUpdateMedia) {
        onUpdateMedia(media.id, { 
          isMeasuringLUFS: true,
          loudnessError: null // エラーがあれば消去
        });
      }

      // ラウドネス測定リクエスト（メディアIDとパスを引数に渡す）
      const result = await window.api.measureLoudness(media.path);
      console.log('ラウドネス測定結果：', result);
      
      if (result && !result.error) {
        // 成功時：メディア情報を更新
        if (onUpdateMedia) {
          const lufsValue = parseFloat(result.integrated);
          onUpdateMedia(media.id, { 
            lufs: lufsValue,
            isMeasuringLUFS: false,
            loudnessNormalization: true // デフォルトで有効化
          });
        }
      } else {
        throw new Error(result?.error || 'ラウドネス測定に失敗しました');
      }
    } catch (error) {
      console.error('ラウドネス測定エラー:', error);
      // エラーフラグを設定
      setLoudnessErrors(prev => ({
        ...prev,
        [media.id]: true
      }));
      
      // メディアにもエラー情報を設定
      if (onUpdateMedia) {
        onUpdateMedia(media.id, { 
          isMeasuringLUFS: false,
          loudnessError: error instanceof Error ? error.message : '測定エラー'
        });
      }
    } finally {
      // 測定中フラグを解除
      setMeasuringLoudness(prev => ({
        ...prev,
        [media.id]: false
      }));
    }
  };

  // ラウドネス正規化切り替え関数
  const handleToggleLoudnessNormalization = (media: any, e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation(); // イベントの伝播を防止
    if (onUpdateMedia) {
      onUpdateMedia(media.id, { 
        loudnessNormalization: e.target.checked 
      });
    }
  };

  // react-beautiful-dndのドラッグ終了ハンドラ
  const handleDragEnd = (result: DropResult) => {
    // ドロップ先がない場合は何もしない
    if (!result.destination) return;
    
    // 同じ位置にドロップした場合は何もしない
    if (result.destination.index === result.source.index) return;
    
    // 親コンポーネントに並び替えを通知
    if (onReorderMedia) {
      onReorderMedia({
        source: result.source.index,
        destination: result.destination.index
      });
    }
  };

  // 複数選択の処理（Ctrlキーを押しながらのクリック）
  const handleMediaClick = (media: any, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrlキーが押されている場合は複数選択
      e.preventDefault(); // 通常の選択を防止
      
      setSelectedMedias(prev => {
        const isSelected = prev.includes(media.id);
        if (isSelected) {
          // すでに選択されている場合は選択解除
          return prev.filter(id => id !== media.id);
        } else {
          // 選択されていない場合は選択に追加
          return [...prev, media.id];
        }
      });
    } else {
      // 通常のクリック（単一選択）
      onSelectMedia(media);
    }
  };

  // 選択した素材を削除
  const handleDeleteSelected = () => {
    if (selectedMedias.length > 0 && onDeleteMedias) {
      onDeleteMedias(selectedMedias);
      setSelectedMedias([]);
    }
  };

  // 全選択
  const handleSelectAll = () => {
    setSelectedMedias(mediaFiles.map(media => media.id));
  };

  // 選択解除
  const handleDeselectAll = () => {
    setSelectedMedias([]);
  };

  // ファイルサイズを表示用にフォーマット
  const formatFileSize = (size: number | undefined | null): string => {
    // 無効な値の場合は「不明」と表示
    if (size === undefined || size === null || isNaN(size)) return '不明';
    
    // 数値に変換（文字列の場合があるため）
    const sizeNum = typeof size === 'string' ? parseInt(size, 10) : size;
    
    // 変換に失敗した場合も「不明」と表示
    if (isNaN(sizeNum)) return '不明';
    
    // サイズに応じて単位を変更
    if (sizeNum < 1024) return `${sizeNum} B`;
    if (sizeNum < 1024 * 1024) return `${(sizeNum / 1024).toFixed(1)} KB`;
    if (sizeNum < 1024 * 1024 * 1024) return `${(sizeNum / (1024 * 1024)).toFixed(1)} MB`;
    return `${(sizeNum / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  // 時間をフォーマット
  const formatDuration = (duration: number): string => {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);
    
    return [
      hours > 0 ? String(hours).padStart(2, '0') : null,
      String(minutes).padStart(2, '0'),
      String(seconds).padStart(2, '0')
    ].filter(Boolean).join(':');
  };

  // ラウドネス値のフォーマット
  const formatLoudness = (lufs: number): string => {
    if (isNaN(lufs)) return 'N/A';
    return `${lufs.toFixed(1)} LUFS`;
  };

  return (
    <div 
      className={`panel ${isDragging ? 'dragover' : ''}`}
      ref={timelinePaneRef}
    >
      <div className="panel-header">
        <h2>タイムライン</h2>
        <div className="panel-controls">
          {selectedMedias.length > 0 && (
            <>
              <button className="panel-button" onClick={handleDeselectAll}>
                選択解除
              </button>
              <button className="panel-button danger" onClick={handleDeleteSelected}>
                削除 ({selectedMedias.length})
              </button>
            </>
          )}
          {selectedMedias.length === 0 && mediaFiles.length > 0 && (
            <button className="panel-button" onClick={handleSelectAll}>
              全選択
            </button>
          )}
        </div>
      </div>
      
      <div className="panel-content timeline-content">
        {mediaFiles.length === 0 ? (
          <div className="empty-state">
            <p>タイムラインにファイルがありません</p>
            <p className="drag-hint">ファイルをドラッグ＆ドロップ</p>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="mediaList">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="media-list"
                >
                  {mediaFiles
                    .filter(media => media && media.id) // idがある項目のみフィルター
                    .map((media, index) => {
                      const isSelected = selectedMedias.includes(media.id);
                      const isMeasuringLoudness = measuringLoudness[media.id] || false;
                      // IDをそのまま使用（プレフィックスを追加しない）
                      const draggableId = `${media.id}`;
                      
                      return (
                        <Draggable
                          key={draggableId}
                          draggableId={draggableId}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`media-item ${selectedMedia?.id === media.id ? 'active' : ''} ${isSelected ? 'selected' : ''} ${snapshot.isDragging ? 'dragging' : ''}`}
                              onClick={(e) => handleMediaClick(media, e)}
                            >
                              <div className="media-thumbnail">
                                {/* IDデバッグ表示を削除 */}
                                
                                {/* シンプルな表示ロジック - サムネイルを最大限表示 */}
                                {media.thumbnailUrl ? (
                                  <img 
                                    src={media.thumbnailUrl} 
                                    alt={media.name} 
                                    style={{ 
                                      width: '100%', 
                                      height: '100%',
                                      objectFit: 'cover',
                                      objectPosition: 'center',
                                      borderRadius: '4px'
                                    }} 
                                    onError={(e) => {
                                      console.error('サムネイル読み込みエラー:', media.thumbnailUrl);
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : thumbnails[media.id] ? (
                                  <img 
                                    src={thumbnails[media.id].url} 
                                    alt={media.name} 
                                    style={{ 
                                      width: '100%', 
                                      height: '100%',
                                      objectFit: 'cover',
                                      objectPosition: 'center',
                                      borderRadius: '4px'
                                    }} 
                                    onError={(e) => {
                                      console.error('サムネイル読み込みエラー:', thumbnails[media.id]?.url);
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="thumbnail-placeholder">
                                    {media.type === 'video' ? '🎬' : '🖼️'}
                                  </div>
                                )}
                              </div>
                              <div className="media-info">
                                <div className="media-name">{media.name}</div>
                                <div className="media-details">
                                  <span className="media-type">{media.type === 'video' ? '動画' : '画像'}</span>
                                  {media.duration && <span className="media-duration">{formatDuration(media.duration)}</span>}
                                  <span className="media-size">{formatFileSize(media.size)}</span>
                                </div>
                                
                                {/* ラウドネス情報の表示 */}
                                <div className="media-loudness">
                                  {media.lufs !== undefined ? (
                                    <div className="loudness-info">
                                      <div className="loudness-value">
                                        ラウドネス: {media.lufs.toFixed(1)} LUFS
                                        {media.lufsGain !== undefined && (
                                          <span className={media.lufsGain > 0 ? 'gain-positive' : 'gain-negative'}>
                                            {media.lufsGain > 0 ? '+' : ''}{media.lufsGain.toFixed(1)}dB
                                          </span>
                                        )}
                                      </div>
                                      <div className="loudness-controls">
                                        <label className="toggle-label">
                                          <input
                                            type="checkbox"
                                            checked={media.loudnessNormalization !== false}
                                            onChange={(e) => handleToggleLoudnessNormalization(media, e)}
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                          <span>-14 LUFS適用</span>
                                        </label>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="loudness-status">
                                      {media.isMeasuringLUFS ? (
                                        <div className="measuring-indicator">
                                          <span className="spinner"></span>
                                          <span>ラウドネス測定中...</span>
                                        </div>
                                      ) : loudnessErrors[media.id] || media.loudnessError ? (
                                        <div className="error-indicator">
                                          <span>測定エラー</span>
                                          <button 
                                            onClick={(e) => handleMeasureLoudness(media, e)} 
                                            className="retry-button"
                                          >
                                            再試行
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="waiting-indicator">
                                          <button 
                                            onClick={(e) => handleMeasureLoudness(media, e)} 
                                            className="measure-button"
                                          >
                                            ラウドネス測定
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>
      
      {/* デバッグ情報 */}
      <div className="debug-info" style={{ fontSize: '10px', color: '#999', padding: '4px', display: 'none' }}>
        <div>メディア件数: {mediaFiles.length}</div>
        <div>サムネイル件数: {Object.keys(thumbnails).length}</div>
      </div>
    </div>
  );
};

export default TimelinePane;