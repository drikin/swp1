import React, { useState, useRef, useEffect } from 'react';

interface TimelinePaneProps {
  mediaFiles: any[];
  selectedMedia: any | null;
  onSelectMedia: (media: any) => void;
  onAddFiles?: () => Promise<void>; // ファイル追加関数
  onDropFiles?: (filePaths: string[]) => Promise<void>; // ドロップしたファイルを直接追加する関数
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
  onDropFiles
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const timelinePaneRef = useRef<HTMLDivElement>(null);

  // ドラッグ&ドロップ処理の設定
  useEffect(() => {
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
      
      // ドロップされたファイルパスを直接処理
      if (filePaths.length > 0 && onDropFiles) {
        await onDropFiles(filePaths);
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
        <div className="media-list">
          {mediaFiles.length === 0 ? (
            <div className="empty-list">
              素材が追加されていません。「素材を追加」ボタンをクリックするか、ファイルをドラッグ&ドロップしてください。
            </div>
          ) : (
            mediaFiles.map(media => (
              <div 
                key={media.id} 
                className={`media-item ${selectedMedia?.id === media.id ? 'selected' : ''}`}
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
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TimelinePane; 