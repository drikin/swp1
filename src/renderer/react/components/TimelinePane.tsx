import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useThumbnail, useTasks } from '../hooks';
import Logger from '../utils/logger';

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
  // サムネイルコンテキストを使用
  const { 
    thumbnailUrl,
    isLoadingThumbnail,
    error: thumbnailError,
    getThumbnailForMedia
  } = useThumbnail();
  
  // タスク管理コンテキストを使用
  const {
    tasks,
    monitorTaskStatus,
    taskStatus
  } = useTasks();

  const [isDragging, setIsDragging] = useState(false);
  const [selectedMedias, setSelectedMedias] = useState<string[]>([]);
  // サムネイルのローカル参照（IDとURLのマッピング）
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

  // メディアファイルのサムネイルを取得
  useEffect(() => {
    const loadThumbnails = async () => {
      if (!mediaFiles || mediaFiles.length === 0) return;
      
      Logger.info('TimelinePane', 'サムネイル読み込みを開始', { count: mediaFiles.length });
      
      for (const media of mediaFiles) {
        // すでにサムネイルがある場合はスキップ
        if (thumbnails[media.id]) continue;
        
        try {
          // サムネイルを取得
          const result = await getThumbnailForMedia(media);
          if (result && thumbnailUrl) {
            setThumbnails(prev => ({
              ...prev,
              [media.id]: thumbnailUrl
            }));
          }
        } catch (err) {
          Logger.error('TimelinePane', `メディア ${media.id} のサムネイル取得に失敗`, err);
        }
      }
    };
    
    loadThumbnails();
  }, [mediaFiles, getThumbnailForMedia, thumbnailUrl, thumbnails]);

  // メディアデータが変更されたときの処理
  useEffect(() => {
    if (mediaFiles && mediaFiles.length > 0) {
      Logger.debug('TimelinePane', 'メディアファイル更新', {
        count: mediaFiles.length,
        thumbnailCount: Object.keys(thumbnails).length
      });
      
      // メディアIDとサムネイルIDの一致を確認
      const mediaIds = mediaFiles.map(media => media.id);
      const thumbnailIds = Object.keys(thumbnails);
      
      // 古いサムネイルをクリーンアップ
      const outdatedThumbnails = thumbnailIds.filter(id => !mediaIds.includes(id));
      if (outdatedThumbnails.length > 0) {
        Logger.debug('TimelinePane', '古いサムネイルを削除', { count: outdatedThumbnails.length });
        const newThumbnails = { ...thumbnails };
        outdatedThumbnails.forEach(id => delete newThumbnails[id]);
        setThumbnails(newThumbnails);
      }
    }
  }, [mediaFiles, thumbnails]);

  // ドラッグオーバー処理
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isDragging) {
      setIsDragging(true);
    }
    
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, [isDragging]);

  // ドラッグリーブ処理
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  // ドロップ処理
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (!e.dataTransfer || !onDropFiles) return;
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    
    // パスの抽出（ElectronのFile拡張に対応）
    const filePaths = files
      .filter((file): file is ElectronFile => 'path' in file)
      .map(file => file.path);
    
    if (filePaths.length > 0) {
      Logger.info('TimelinePane', 'ファイルドロップ', { count: filePaths.length });
      onDropFiles(filePaths);
    }
  }, [onDropFiles]);

  // ラウドネス測定関数
  const handleMeasureLoudness = useCallback(async (media: any, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!window.api || !media || !media.path) {
      Logger.error('TimelinePane', 'ラウドネス測定: 無効なメディアまたはAPI');
      return;
    }
    
    try {
      // ラウドネス測定状態を更新
      setMeasuringLoudness(prev => ({
        ...prev,
        [media.id]: true
      }));
      
      // エラー状態をリセット
      setLoudnessErrors(prev => ({
        ...prev,
        [media.id]: false
      }));
      
      Logger.info('TimelinePane', 'ラウドネス測定開始', { mediaId: media.id, path: media.path });
      
      // APIを呼び出してラウドネス測定
      const response = await window.api.measureLoudness({
        filePath: media.path,
        fileId: media.id
      });
      
      Logger.debug('TimelinePane', 'ラウドネス測定応答', response);
      
      if (response && response.success && response.taskId) {
        const taskId = response.taskId;
        
        // タスク完了まで監視（PromiseベースのmonitorTaskStatusを使用）
        const result = await monitorTaskStatus(taskId);
        
        if (result && typeof result === 'object') {
          // 測定結果が正常に取得できた場合
          const lufs = result.data?.integratedLoudness;
          
          if (typeof lufs === 'number') {
            Logger.info('TimelinePane', 'ラウドネス測定完了', { mediaId: media.id, lufs });
            
            // 基準ラウドネス (-14 LUFS) に対する必要なゲイン値を計算
            const targetLUFS = -14;
            const lufsGain = targetLUFS - lufs;
            
            // メディア更新処理
            if (onUpdateMedia) {
              onUpdateMedia(media.id, {
                lufs,
                lufsGain,
                loudnessNormalization: true
              });
            }
          } else {
            throw new Error('無効なラウドネス値です');
          }
        } else {
          throw new Error('ラウドネス測定に失敗しました');
        }
      } else {
        throw new Error(response?.error || 'ラウドネス測定タスクの開始に失敗しました');
      }
    } catch (error) {
      Logger.error('TimelinePane', 'ラウドネス測定エラー', error);
      
      // エラー状態を更新
      setLoudnessErrors(prev => ({
        ...prev,
        [media.id]: true
      }));
    } finally {
      // ラウドネス測定状態を更新
      setMeasuringLoudness(prev => ({
        ...prev,
        [media.id]: false
      }));
    }
  }, [onUpdateMedia, monitorTaskStatus]);

  // ラウドネス正規化切り替え関数
  const handleToggleLoudnessNormalization = useCallback((media: any, e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (onUpdateMedia) {
      onUpdateMedia(media.id, {
        loudnessNormalization: e.target.checked
      });
    }
  }, [onUpdateMedia]);

  // react-beautiful-dndのドラッグ終了ハンドラ
  const handleDragEnd = useCallback((result: DropResult) => {
    // ドロップ先がない、または同じ位置の場合は何もしない
    if (!result.destination || result.destination.index === result.source.index) {
      return;
    }
    
    // 親コンポーネントに並び替え結果を通知
    if (onReorderMedia) {
      onReorderMedia({
        source: result.source.index,
        destination: result.destination.index
      });
    }
  }, [onReorderMedia]);

  // 複数選択の処理（Ctrlキーを押しながらのクリック）
  const handleMediaClick = useCallback((media: any, e: React.MouseEvent) => {
    // 親コンポーネントのメディア選択処理を呼び出し
    onSelectMedia(media);
    
    // Ctrlキーが押されている場合は複数選択モード
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSelectedMedias(prev => {
        // すでに選択されている場合は選択解除
        if (prev.includes(media.id)) {
          return prev.filter(id => id !== media.id);
        }
        // 選択されていない場合は追加
        return [...prev, media.id];
      });
    } else {
      // 通常クリックは単一選択
      setSelectedMedias([media.id]);
    }
  }, [onSelectMedia]);

  // 選択した素材を削除
  const handleDeleteSelected = useCallback(() => {
    if (onDeleteMedias && selectedMedias.length > 0) {
      onDeleteMedias(selectedMedias);
      setSelectedMedias([]);
    }
  }, [onDeleteMedias, selectedMedias]);

  // 全選択
  const handleSelectAll = useCallback(() => {
    const allIds = mediaFiles.map(media => media.id);
    setSelectedMedias(allIds);
  }, [mediaFiles]);

  // 選択解除
  const handleDeselectAll = useCallback(() => {
    setSelectedMedias([]);
  }, []);

  // ファイルサイズを表示用にフォーマット
  const formatFileSize = useCallback((size: number | undefined | null): string => {
    if (size === undefined || size === null) return '不明';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let formattedSize = size;
    let unitIndex = 0;
    
    while (formattedSize >= 1024 && unitIndex < units.length - 1) {
      formattedSize /= 1024;
      unitIndex++;
    }
    
    // 小数点以下1桁に丸める（ただし、Bの場合は整数）
    return `${unitIndex === 0 ? Math.round(formattedSize) : formattedSize.toFixed(1)} ${units[unitIndex]}`;
  }, []);

  // 時間をフォーマット
  const formatDuration = useCallback((duration: number): string => {
    if (isNaN(duration)) return '00:00';
    
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  // ラウドネス値のフォーマット
  const formatLoudness = useCallback((lufs: number): string => {
    return `${lufs.toFixed(1)} LUFS`;
  }, []);

  // メディアリストのレンダリングをメモ化
  const mediaListContent = useMemo(() => {
    return (
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="media-list">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="media-list"
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
                      className={`media-item ${selectedMedias.includes(media.id) ? 'selected' : ''} ${
                        snapshot.isDragging ? 'dragging' : ''
                      } ${selectedMedia && selectedMedia.id === media.id ? 'current' : ''}`}
                      onClick={(e) => handleMediaClick(media, e)}
                    >
                      <div className="media-thumbnail">
                        {thumbnails[media.id] ? (
                          <img
                            src={thumbnails[media.id]}
                            alt={media.name}
                            className="thumbnail-image"
                          />
                        ) : (
                          <div className="thumbnail-placeholder">
                            {isLoadingThumbnail ? (
                              <div className="loading-indicator">
                                <span className="spinner"></span>
                              </div>
                            ) : (
                              <span>未生成</span>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="media-info">
                        <div className="media-name">{media.name}</div>
                        <div className="media-details">
                          <div className="media-meta">
                            <div className="media-duration">
                              {media.duration ? formatDuration(media.duration) : '00:00'}
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
                                      onChange={(e) => handleToggleLoudnessNormalization(media, e)}
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
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );
  }, [
    mediaFiles, 
    thumbnails, 
    selectedMedias, 
    selectedMedia, 
    isLoadingThumbnail, 
    measuringLoudness, 
    loudnessErrors, 
    handleDragEnd, 
    handleMediaClick, 
    handleMeasureLoudness, 
    handleToggleLoudnessNormalization, 
    formatDuration, 
    formatFileSize
  ]);

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
          mediaListContent
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