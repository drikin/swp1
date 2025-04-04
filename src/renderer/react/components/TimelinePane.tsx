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
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
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
      const handleThumbnailGenerated = (data: { id: string; thumbnail: string }) => {
        console.log('サムネイル受信:', data.id, '長さ:', data.thumbnail ? data.thumbnail.length : 0);
        // サムネイルデータの内容確認（デバッグ用）
        if (data.thumbnail && data.thumbnail.startsWith('data:image')) {
          console.log('サムネイル形式OK:', data.id);
        } else if (data.thumbnail) {
          console.log('サムネイル形式異常:', data.id, data.thumbnail.substring(0, 30) + '...');
        } else {
          console.log('サムネイルデータなし:', data.id);
        }
        
        setThumbnails(prev => {
          const newThumbnails = {
            ...prev,
            [data.id]: data.thumbnail
          };
          // 更新後の状態を表示（デバッグ用）
          console.log('サムネイル保存完了:', data.id, 'サムネイル数:', Object.keys(newThumbnails).length);
          return newThumbnails;
        });
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
      setMeasuringLoudness(prev => ({
        ...prev,
        [media.id]: true
      }));

      // IDとパスを一緒に送信して、バックエンドで分離できるようにする
      const loudnessInfo = await window.api.measureLoudness(`${media.id}|${media.path}`);
      if (onUpdateMedia && !loudnessInfo.error) {
        onUpdateMedia(media.id, { 
          loudnessInfo,
          // デフォルトで有効にする
          loudnessNormalization: true
        });
      }
    } catch (error) {
      console.error('ラウドネス測定エラー:', error);
      setLoudnessErrors(prev => ({
        ...prev,
        [media.id]: true
      }));
    } finally {
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
                                {thumbnails[media.id] ? (
                                  <img src={thumbnails[media.id]} alt={media.name} />
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
                                  {media.loudnessInfo ? (
                                    <div className="loudness-info">
                                      <div className="loudness-value">
                                        現在: {formatLoudness(media.loudnessInfo.inputIntegratedLoudness)}
                                        {media.loudnessInfo.lufsGain !== undefined && (
                                          <span className={media.loudnessInfo.lufsGain > 0 ? 'gain-positive' : 'gain-negative'}>
                                            {media.loudnessInfo.lufsGain > 0 ? '+' : ''}{media.loudnessInfo.lufsGain.toFixed(1)}dB
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
                                      {media.isMeasuringLoudness ? (
                                        <div className="measuring-indicator">
                                          <span className="spinner"></span>
                                          <span>ラウドネス測定中...</span>
                                        </div>
                                      ) : loudnessErrors[media.id] || media.loudnessError ? (
                                        <div className="error-indicator">
                                          <span>測定エラー</span>
                                        </div>
                                      ) : (
                                        <div className="waiting-indicator">
                                          <span>ラウドネス情報を取得中...</span>
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
    </div>
  );
};

export default TimelinePane;