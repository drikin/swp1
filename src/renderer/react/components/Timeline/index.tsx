import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { DropResult } from '@hello-pangea/dnd';
import { Box, Paper, Typography, Button, IconButton, Divider, useTheme } from '@mui/material';
import { Delete, SelectAll, Clear, CloudUpload, VolumeUp, VolumeOff } from '@mui/icons-material';
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
  const theme = useTheme();

  // 状態
  const [isDragging, setIsDragging] = useState(false);
  const [selectedMedias, setSelectedMedias] = useState<string[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [measuringLoudness, setMeasuringLoudness] = useState<Record<string, boolean>>({});
  const [loudnessErrors, setLoudnessErrors] = useState<Record<string, string>>({});
  
  // サムネイル処理中のメディアを追跡（無限ループ防止）
  const processingThumbnails = useRef<Set<string>>(new Set());

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
   * 必要なサムネイルを取得
   */
  const loadThumbnails = async () => {
    if (!mediaFiles.length) return;
    
    // サムネイル処理前後のデバッグ出力を追加
    console.log('サムネイル取得処理開始 - Timeline', {
      mediaCount: mediaFiles.length,
      currentThumbnails: Object.keys(thumbnails).length
    });
    
    const thumbnailPromises = mediaFiles.map(async (media) => {
      try {
        // 既に取得済みまたは処理中の場合はスキップ
        if (thumbnails[media.id]) {
          console.log(`スキップ: サムネイル既に取得済み [${media.id}]`);
          return null;
        }
        
        // 現在処理中の場合もスキップ（無限ループ防止）
        if (processingThumbnails.current.has(media.id)) {
          console.log(`スキップ: サムネイル処理中 [${media.id}]`);
          return null;
        }
        
        // 処理中としてマーク
        processingThumbnails.current.add(media.id);
        
        console.log(`サムネイル取得処理開始 [${media.id}]`);
        let url = await getThumbnailForMedia(media);
        console.log(`サムネイル取得結果 [${media.id}]:`, url);
        
        // URLでない場合（タスクIDが返された場合）、そのタスクが完了したURLを取得する
        if (url && (!url.startsWith('file://') && !url.startsWith('secure-file://'))) {
          console.log(`タスクIDが返されました [${url}]、完了を待機します`);
          
          let retryCount = 0;
          const maxRetries = 5;
          
          // タスクが完了するまで最大5回、1秒間隔で再試行
          while (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            try {
              console.log(`サムネイル再取得試行 ${retryCount + 1}/${maxRetries} [${media.id}]`);
              const newUrl = await getThumbnailForMedia(media);
              
              if (newUrl && (newUrl.startsWith('file://') || newUrl.startsWith('secure-file://'))) {
                url = newUrl;
                console.log(`有効なサムネイルURLを取得しました [${media.id}]: ${url}`);
                break;
              }
            } catch (retryError) {
              console.warn(`サムネイル再取得エラー [${media.id}]:`, retryError);
            }
            
            retryCount++;
          }
        }
        
        // 処理完了としてマーク
        processingThumbnails.current.delete(media.id);
        
        // URLでない場合はnullを返す
        if (!url || (!url.startsWith('file://') && !url.startsWith('secure-file://'))) {
          console.warn(`有効なサムネイルURLが取得できませんでした [${media.id}]`);
          return null;
        }
        
        return { id: media.id, url };
      } catch (error) {
        // エラー時も処理中マークを解除
        processingThumbnails.current.delete(media.id);
        console.error(`サムネイル取得エラー (${media.id}):`, error);
        return null;
      }
    });
    
    // 最大10個のプロミスだけ同時に処理（負荷軽減）
    const results: (ThumbnailResult | null)[] = [];
    const chunks = [];
    for (let i = 0; i < thumbnailPromises.length; i += 10) {
      chunks.push(thumbnailPromises.slice(i, i + 10));
    }
    
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(chunk);
      results.push(...chunkResults);
    }
    
    // 取得したサムネイルを状態に反映
    const newThumbnails: Record<string, string> = { ...thumbnails };
    
    results.forEach(result => {
      if (result && result.id && result.url) {
        console.log(`サムネイル表示情報を更新 [${result.id}]: ${result.url}`);
        newThumbnails[result.id] = result.url;
      }
    });
    
    console.log('サムネイル取得処理完了 - Timeline', {
      updatedCount: Object.keys(newThumbnails).length - Object.keys(thumbnails).length
    });
    
    setThumbnails(newThumbnails);
  };

  /**
   * サムネイル読み込み処理
   */
  useEffect(() => {
    loadThumbnails();
  }, [mediaFiles, getThumbnailForMedia]);

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
    <Box
      className={`panel ${isDragging ? 'dragover' : ''}`}
      ref={timelinePaneRef}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        bgcolor: 'background.paper',
        border: isDragging ? '2px dashed' : '1px solid',
        borderColor: isDragging ? 'primary.main' : 'divider',
        borderRadius: 1,
      }}
    >
      <Box
        className="panel-header"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
        }}
      >
        <Typography variant="h6" component="h2" sx={{ fontSize: '0.9rem', fontWeight: 'medium' }}>
          タイムライン
        </Typography>
        <Box className="panel-controls" sx={{ display: 'flex', gap: 0.5 }}>
          {selectedMedias.length > 0 && (
            <>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Clear fontSize="small" />}
                onClick={handleDeselectAll}
                sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
              >
                選択解除
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                size="small"
                startIcon={<Delete fontSize="small" />}
                onClick={handleDeleteSelected}
                sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
              >
                削除 ({selectedMedias.length})
              </Button>
            </>
          )}
          {selectedMedias.length === 0 && mediaFiles.length > 0 && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<SelectAll fontSize="small" />}
              onClick={handleSelectAll}
              sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
            >
              全選択
            </Button>
          )}
        </Box>
      </Box>
      
      <Box 
        className="panel-content timeline-content"
        sx={{
          flex: 1,
          overflow: 'auto',
          p: mediaFiles.length === 0 ? 2 : 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {mediaFiles.length === 0 ? (
          <Box 
            className="empty-state dropzone-container"
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              height: '100%',
              border: '2px dashed',
              borderColor: 'divider',
              borderRadius: 1,
              p: 3,
              bgcolor: 'background.paper',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: 'action.hover',
              }
            }}
          >
            <CloudUpload 
              sx={{ 
                fontSize: '3rem',
                color: 'text.secondary',
                mb: 2
              }}
            />
            <Typography 
              variant="h6"
              component="h3"
              className="dropzone-title"
              sx={{ 
                fontWeight: 'medium',
                fontSize: '1rem',
                mb: 1
              }}
            >
              メディアファイルをここにドロップ
            </Typography>
            <Typography 
              variant="body2"
              color="textSecondary"
              className="dropzone-subtitle"
              sx={{ fontSize: '0.8rem' }}
            >
              または クリックしてファイルを選択
            </Typography>
          </Box>
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
      </Box>
    </Box>
  );
};

export default TimelinePane;
