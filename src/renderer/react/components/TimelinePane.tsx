import React from 'react';

interface TimelinePaneProps {
  mediaFiles: any[];
  selectedMedia: any | null;
  onSelectMedia: (media: any) => void;
}

// タイムラインペインコンポーネント
const TimelinePane: React.FC<TimelinePaneProps> = ({
  mediaFiles,
  selectedMedia,
  onSelectMedia
}) => {
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
    <div className="panel">
      <div className="panel-header">
        <h2>タイムライン</h2>
        <span className="item-count">{mediaFiles.length}アイテム</span>
      </div>
      <div className="panel-content">
        <div className="media-list">
          {mediaFiles.length === 0 ? (
            <div className="empty-list">
              素材が追加されていません。「素材を追加」ボタンをクリックしてください。
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