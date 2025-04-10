import React from 'react';

interface MediaItemProps {
  media: any;
  thumbnail: string | null;
  isSelected: boolean;
  isActive: boolean;
  formatDuration: (seconds: number) => string;
  formatFileSize: (bytes: number) => string;
  measuringLoudness: Record<string, boolean>;
  loudnessErrors: Record<string, string>;
  onMediaClick: (mediaId: string, e: React.MouseEvent) => void;
  onMeasureLoudness: (media: any, e: React.MouseEvent) => void;
  onToggleLoudnessNormalization: (media: any, e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * タイムライン内のメディアアイテムを表示するコンポーネント
 */
const MediaItem: React.FC<MediaItemProps> = ({
  media,
  thumbnail,
  isSelected,
  isActive,
  formatDuration,
  formatFileSize,
  measuringLoudness,
  loudnessErrors,
  onMediaClick,
  onMeasureLoudness,
  onToggleLoudnessNormalization
}) => {
  return (
    <div 
      className={`media-item ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
      onClick={(e) => onMediaClick(media.id, e)}
    >
      <div className="media-thumbnail">
        {thumbnail ? (
          <img src={thumbnail} alt={media.name} />
        ) : (
          <div className="thumbnail-placeholder">
            <span className="material-icons">photo</span>
          </div>
        )}
      </div>
      
      <div className="media-info">
        <div className="media-header">
          <div className="media-name">{media.name}</div>
        </div>
        
        <div className="media-details">
          <div className="media-metadata">
            <div className="media-duration">
              {formatDuration(media.duration)}
            </div>
            <div className="media-resolution">
              {media.video && `${media.video.width}x${media.video.height}`}
            </div>
            <div className="media-size">
              {formatFileSize(media.size)}
            </div>
          </div>
          
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
                      onChange={(e) => onToggleLoudnessNormalization(media, e)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span>-14 LUFS適用</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="loudness-status">
                {measuringLoudness[media.id] ? (
                  <div className="measuring-indicator">
                    <span className="spinner"></span>
                    <span>ラウドネス測定中...</span>
                  </div>
                ) : loudnessErrors[media.id] || media.loudnessError ? (
                  <div className="error-indicator">
                    <span>測定エラー</span>
                    <button 
                      onClick={(e) => onMeasureLoudness(media, e)} 
                      className="retry-button"
                    >
                      再試行
                    </button>
                  </div>
                ) : (
                  <div className="waiting-indicator">
                    <button 
                      onClick={(e) => onMeasureLoudness(media, e)} 
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
    </div>
  );
};

export default MediaItem;
