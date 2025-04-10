import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { DropResult } from '@hello-pangea/dnd';
import { useThumbnail, useTasks } from '../../hooks';
import MediaList from './MediaList';

interface TimelinePaneProps {
  mediaFiles: any[];
  selectedMedia: any | null;
  onSelectMedia: (media: any) => void;
  onAddFiles?: () => Promise<void>;
  onDropFiles?: (filePaths: string[]) => Promise<void>;
  onReorderMedia?: (result: { source: number; destination: number }) => void;
  onDeleteMedias?: (mediaIds: string[]) => void;
  onUpdateMedia?: (mediaId: string, updates: any) => void;
}

interface LoudnessResult {
  lufs: number;
  lufsGain: number;
}

// サムネイル結果の型定義
interface ThumbnailResult {
  id: string;
  url: string;
}

/**
 * タイムラインペインコンポーネント
 */
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
  // フック
  const { getThumbnailForMedia } = useThumbnail();
  const { tasks, monitorTaskStatus } = useTasks();

  // 状態
  const [isDragging, setIsDragging] = useState(false);
  const [selectedMedias, setSelectedMedias] = useState<string[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [measuringLoudness, setMeasuringLoudness] = useState<Record<string, boolean>>({});
  const [loudnessErrors, setLoudnessErrors] = useState<Record<string, string>>({});
  
  // タイムラインペインのDOM参照
  const timelinePaneRef = useRef<HTMLDivElement>(null);

  /**
   * メディアがドロップされたときの処理
   */
  const handleFileDrop = useCallback(async (filePaths: string[]) => {
    setIsDragging(false);
    if (filePaths.length && onDropFiles) {
      try {
        await onDropFiles(filePaths);
      } catch (error) {
        console.error('ファイルをドロップ処理中にエラーが発生しました:', error);
      }
    }
  }, [onDropFiles]);

  /**
   * ドラッグ終了時の処理
   */
  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination || !onReorderMedia) return;
    
    onReorderMedia({
      source: result.source.index,
      destination: result.destination.index
    });
  }, [onReorderMedia]);

  /**
   * メディアクリック時の処理
   */
  const handleMediaClick = useCallback((mediaId: string, e: React.MouseEvent) => {
    // Ctrlキーか⌘キーが押されている場合は複数選択
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSelectedMedias(prev => {
        const isSelected = prev.includes(mediaId);
        if (isSelected) {
          return prev.filter(id => id !== mediaId);
        } else {
          return [...prev, mediaId];
        }
      });
    } else {
      // 通常クリックは単一選択
      const media = mediaFiles.find(m => m.id === mediaId);
      if (media) {
        onSelectMedia(media);
        setSelectedMedias([mediaId]);
      }
    }
  }, [mediaFiles, onSelectMedia]);

  /**
   * 全てのメディアを選択
   */
  const handleSelectAll = useCallback(() => {
    setSelectedMedias(mediaFiles.map(media => media.id));
  }, [mediaFiles]);

  /**
   * 選択をすべて解除
   */
  const handleDeselectAll = useCallback(() => {
    setSelectedMedias([]);
  }, []);

  /**
   * 選択したメディアを削除
   */
  const handleDeleteSelected = useCallback(() => {
    if (selectedMedias.length > 0 && onDeleteMedias) {
      onDeleteMedias(selectedMedias);
      setSelectedMedias([]);
    }
  }, [selectedMedias, onDeleteMedias]);

  /**
   * ラウドネス測定を開始
   */
  const handleMeasureLoudness = useCallback(async (media: any, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!onUpdateMedia || measuringLoudness[media.id]) return;
    
    // ラウドネス測定中状態をセット
    setMeasuringLoudness(prev => ({ ...prev, [media.id]: true }));
    
    // ラウドネス測定タスクを開始
    if (!window.api) {
      console.error('window.api が見つかりません');
      return;
    }
    
    try {
      const result: any = await window.api.invoke('create-task', 'measureLoudness', {
        mediaId: media.id,
        filePath: media.path
      });
      
      if (!result?.taskId) {
        throw new Error('タスク作成に失敗しました');
      }
      
      // タスクの状態監視を開始
      monitorTaskStatus(result.taskId, (taskStatus) => {
        if (taskStatus && taskStatus.status === 'completed' && taskStatus.data) {
          // 測定成功
          setMeasuringLoudness(prev => ({ ...prev, [media.id]: false }));
          setLoudnessErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[media.id];
            return newErrors;
          });
          
          const loudnessData = taskStatus.data as LoudnessResult;
          const { lufs, lufsGain } = loudnessData;
          
          // メディア情報を更新
          onUpdateMedia(media.id, {
            lufs,
            lufsGain,
            loudnessNormalization: true
          });
        } 
        else if (taskStatus && (taskStatus.status === 'error' || taskStatus.status === 'failed')) {
          // 測定失敗
          setMeasuringLoudness(prev => ({ ...prev, [media.id]: false }));
          setLoudnessErrors(prev => ({
            ...prev,
            [media.id]: taskStatus.error || '不明なエラー'
          }));
        }
      });
    } catch (error: any) {
      console.error('ラウドネス測定タスク作成エラー:', error);
      setMeasuringLoudness(prev => ({ ...prev, [media.id]: false }));
      setLoudnessErrors(prev => ({
        ...prev,
        [media.id]: error.message || '不明なエラー'
      }));
    }
  }, [measuringLoudness, onUpdateMedia, monitorTaskStatus]);

  /**
   * ラウドネス正規化の切り替え
   */
  const handleToggleLoudnessNormalization = useCallback((media: any, e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (onUpdateMedia) {
      onUpdateMedia(media.id, {
        loudnessNormalization: e.target.checked
      });
    }
  }, [onUpdateMedia]);

  /**
   * サムネイル読み込み処理
   */
  useEffect(() => {
    // 必要なサムネイルを取得
    const loadThumbnails = async () => {
      if (!mediaFiles.length) return;
      
      const thumbnailPromises = mediaFiles.map(async (media) => {
        try {
          // 既に取得済みの場合はスキップ
          if (thumbnails[media.id]) return null;
          
          const url = await getThumbnailForMedia(media);
          if (!url) return null;
          return { id: media.id, url };
        } catch (error) {
          console.error(`サムネイル取得エラー (${media.id}):`, error);
          return null;
        }
      });
      
      const results = await Promise.all(thumbnailPromises);
      
      // 取得したサムネイルを状態に反映
      const newThumbnails: Record<string, string> = { ...thumbnails };
      
      results.forEach(result => {
        if (result && result.id && result.url) {
          newThumbnails[result.id] = result.url;
        }
      });
      
      setThumbnails(newThumbnails);
    };
    
    loadThumbnails();
  }, [mediaFiles, thumbnails, getThumbnailForMedia]);

  /**
   * ドラッグ&ドロップのイベントハンドラー
   */
  useEffect(() => {
    const container = timelinePaneRef.current;
    if (!container || !onDropFiles) return;
    
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };
    
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (e.relatedTarget === null || !container.contains(e.relatedTarget as Node)) {
        setIsDragging(false);
      }
    };
    
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      
      if (e.dataTransfer?.files?.length) {
        const filePaths: string[] = [];
        
        for (let i = 0; i < e.dataTransfer.items.length; i++) {
          const item = e.dataTransfer.items[i];
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file && 'path' in file) {
              filePaths.push((file as any).path);
            }
          }
        }
        
        if (filePaths.length) {
          handleFileDrop(filePaths);
        }
      }
    };
    
    // イベントリスナーを登録
    container.addEventListener('dragover', handleDragOver as EventListener);
    container.addEventListener('dragleave', handleDragLeave as EventListener);
    container.addEventListener('drop', handleDrop as EventListener);
    
    return () => {
      container.removeEventListener('dragover', handleDragOver as EventListener);
      container.removeEventListener('dragleave', handleDragLeave as EventListener);
      container.removeEventListener('drop', handleDrop as EventListener);
    };
  }, [handleFileDrop, onDropFiles]);

  /**
   * フォーマット用ヘルパー関数
   */
  const formatDuration = (seconds: number): string => {
    if (isNaN(seconds)) return '00:00';
    
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
            <p>ファイルをドラッグ＆ドロップしてください。</p>
          </div>
        ) : (
          <MediaList
            mediaFiles={mediaFiles}
            thumbnails={thumbnails}
            selectedMedias={selectedMedias}
            selectedMedia={selectedMedia}
            measuringLoudness={measuringLoudness}
            loudnessErrors={loudnessErrors}
            formatDuration={formatDuration}
            formatFileSize={formatFileSize}
            onDragEnd={handleDragEnd}
            onMediaClick={handleMediaClick}
            onMeasureLoudness={handleMeasureLoudness}
            onToggleLoudnessNormalization={handleToggleLoudnessNormalization}
          />
        )}
      </div>
    </div>
  );
};

export default TimelinePane;
