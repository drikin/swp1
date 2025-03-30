import React, { useState, useRef, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface TimelinePaneProps {
  mediaFiles: any[];
  selectedMedia: any | null;
  onSelectMedia: (media: any) => void;
  onAddFiles?: () => Promise<void>; // ファイル追加関数
  onDropFiles?: (filePaths: string[]) => Promise<void>; // ドロップしたファイルを直接追加する関数
  onReorderMedia?: (result: { source: number; destination: number }) => void; // 素材の並び替え関数
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
  onReorderMedia
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const timelinePaneRef = useRef<HTMLDivElement>(null);

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

  // ファイルサイズを表示用にフォーマット
  const formatFileSize = (size: number): string => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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

  return (
    <div 
      className={`panel ${isDragging ? 'dragover' : ''}`}
      ref={timelinePaneRef}
    >
      <div className="panel-header">
        <h2>タイムライン</h2>
        <span className="item-count">{mediaFiles.length}アイテム</span>
      </div>
      <div className="panel-content">
        {mediaFiles.length === 0 ? (
          <div className="empty-list">
            素材が追加されていません。「素材を追加」ボタンをクリックするか、ファイルをドラッグ&ドロップしてください。
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="timeline-media-list">
              {(provided) => (
                <div 
                  className="media-list"
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                >
                  {mediaFiles.map((media, index) => (
                    <Draggable 
                      key={media.id} 
                      draggableId={media.id} 
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <div 
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`media-item ${selectedMedia?.id === media.id ? 'selected' : ''} ${snapshot.isDragging ? 'dragging' : ''}`}
                          onClick={() => onSelectMedia(media)}
                        >
                          <div className="media-thumbnail">
                            {media.thumbnail ? (
                              <img src={media.thumbnail} alt={media.name} />
                            ) : (
                              <div className="placeholder-thumbnail">
                                {media.type.startsWith('video') ? '🎬' : '🔊'}
                              </div>
                            )}
                          </div>
                          <div className="media-details">
                            <div className="media-name">{media.name}</div>
                            <div className="media-info">
                              {media.duration && <span>{formatDuration(media.duration)}</span>}
                              <span>{formatFileSize(media.size)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
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