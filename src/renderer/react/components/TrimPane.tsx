import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button, Box, Typography, CircularProgress } from '@mui/material';
import type { MediaFile } from '../types';
import { useWaveform } from '../hooks';
import Logger from '../utils/logger';

interface TrimPaneProps {
  selectedMedia: MediaFile | null;
  currentTime: number;
  onUpdateTrimPoints: (mediaId: string, trimStart: number | null, trimEnd: number | null) => void;
  onSeek: (time: number) => void; // Add onSeek prop for seeking
}

// APIレスポンスの型定義
interface TaskStatusResponse {
  id: string;
  status: "error" | "pending" | "processing" | "completed" | "cancelled";
  progress: number;
  type: string;
  task?: {
    status: "error" | "pending" | "processing" | "completed" | "cancelled";
    progress: number;
  };
}

interface WaveformDataResponse {
  success?: boolean;
  data?: {
    waveform?: number[];
  } | number[];
  waveform?: number[];
  taskId?: string;
}

interface TaskIdByMediaPathResponse {
  success?: boolean;
  taskId?: string;
}

// APIからのnullableな結果を型安全に処理するための型
type TaskIdResponse = TaskIdByMediaPathResponse | string | null;

interface GenerateWaveformResponse {
  success: boolean;
  taskId?: string;
}

/**
 * トリムペインコンポーネント - 波形表示とトリム範囲設定
 */
const TrimPane: React.FC<TrimPaneProps> = ({ 
  selectedMedia, 
  currentTime, 
  onUpdateTrimPoints,
  onSeek // Destructure onSeek prop
}) => {
  // useWaveformフックをコンポーネントのトップレベルで使用
  const { 
    waveformData,
    isLoadingWaveform, 
    error: waveformError,
    generateWaveform: generateWaveformFromContext,
    getWaveformForMedia
  } = useWaveform();
  
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskRequestId, setTaskRequestId] = useState<string | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const isInitialRender = useRef(true);
  const [dimensionsLoaded, setDimensionsLoaded] = useState(false);

  const displayError = error || waveformError;
  
  // コンポーネントがマウントされたとき
  useEffect(() => {
    Logger.info('TrimPane', 'コンポーネントがマウントされました');
    
    // コンポーネントがアンマウントされたときのクリーンアップ
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  // メディアが変更されたときの処理
  useEffect(() => {
    if (selectedMedia) {
      Logger.info('TrimPane', 'メディア選択変更', {
        path: selectedMedia.path,
        duration: selectedMedia.duration
      });
      
      // トリムポイントをリセット（最初は全体を選択）
      if (selectedMedia.duration) {
        setInPoint(0);
        setOutPoint(selectedMedia.duration);
        
        // コールバックで通知
        if (onUpdateTrimPoints) {
          onUpdateTrimPoints(selectedMedia.id, 0, selectedMedia.duration);
        }
      }
      
      // 波形データを取得
      handleFetchWaveform();
    }
  }, [selectedMedia, onUpdateTrimPoints]);

  // 波形データを取得する処理
  const handleFetchWaveform = useCallback(async () => {
    if (!selectedMedia) return;
    
    try {
      setError(null);
      Logger.info('TrimPane', '波形データ取得開始', { mediaId: selectedMedia.id });
      const taskId = await getWaveformForMedia(selectedMedia);
      if (taskId) {
        Logger.debug('TrimPane', '波形データ取得タスク登録完了', { taskId });
        setTaskRequestId(taskId);
      }
    } catch (err) {
      Logger.error('TrimPane', '波形データ取得エラー', err);
      setError('波形データの取得に失敗しました');
    }
  }, [selectedMedia, getWaveformForMedia]);

  // 波形データを生成する処理
  const handleGenerateWaveform = useCallback(async () => {
    if (!selectedMedia || !selectedMedia.path) return;
    
    try {
      setError(null);
      Logger.info('TrimPane', '波形データ生成開始', { path: selectedMedia.path });
      // MediaFileではなくファイルパス文字列を渡す
      const result = await generateWaveformFromContext(selectedMedia.path);
      if (result) {
        Logger.debug('TrimPane', '波形データ生成リクエスト成功', { taskId: result });
        setTaskRequestId(result);
      } else {
        throw new Error('波形データ生成に失敗しました');
      }
    } catch (err) {
      Logger.error('TrimPane', '波形データ生成エラー', err);
      setError('波形データの生成に失敗しました');
    }
  }, [selectedMedia, generateWaveformFromContext]);

  // IN点を設定
  const handleSetInPoint = useCallback(() => {
    if (!selectedMedia) return;
    
    // currentTimeが存在することを確認（undefined対策）
    if (typeof currentTime !== 'number') {
      Logger.warn('TrimPane', 'IN点設定: 現在時間が無効です');
      return;
    }
    
    // 現在の再生位置をIN点として設定
    const newInPoint = currentTime;
    
    Logger.info('TrimPane', 'IN点設定', { time: newInPoint });
    
    // OUT点と比較して調整（IN点はOUT点より前でなければならない）
    if (outPoint !== null && newInPoint >= outPoint) {
      Logger.warn('TrimPane', 'IN点がOUT点以降に設定されました - 調整します');
      setInPoint(outPoint - 1 > 0 ? outPoint - 1 : 0);
    } else {
      setInPoint(newInPoint);
    }
    
    // 親コンポーネントに通知（null値でないことを確認）
    if (onUpdateTrimPoints && outPoint !== null) {
      onUpdateTrimPoints(selectedMedia.id, newInPoint < outPoint ? newInPoint : outPoint - 1, outPoint);
    }
  }, [currentTime, outPoint, selectedMedia, onUpdateTrimPoints]);

  // OUT点を設定
  const handleSetOutPoint = useCallback(() => {
    if (!selectedMedia) return;
    
    // currentTimeが存在することを確認（undefined対策）
    if (typeof currentTime !== 'number') {
      Logger.warn('TrimPane', 'OUT点設定: 現在時間が無効です');
      return;
    }
    
    // 現在の再生位置をOUT点として設定
    const newOutPoint = currentTime;
    
    Logger.info('TrimPane', 'OUT点設定', { time: newOutPoint });
    
    // IN点と比較して調整（OUT点はIN点より後でなければならない）
    if (inPoint !== null && newOutPoint <= inPoint) {
      Logger.warn('TrimPane', 'OUT点がIN点以前に設定されました - 調整します');
      setOutPoint(inPoint + 1 < selectedMedia.duration! ? inPoint + 1 : selectedMedia.duration);
    } else {
      setOutPoint(newOutPoint);
    }
    
    // 親コンポーネントに通知（null値でないことを確認）
    if (onUpdateTrimPoints && inPoint !== null) {
      onUpdateTrimPoints(selectedMedia.id, inPoint, newOutPoint > inPoint ? newOutPoint : inPoint + 1);
    }
  }, [currentTime, inPoint, selectedMedia, onUpdateTrimPoints]);

  // 波形データの描画
  const renderWaveform = useCallback(() => {
    if (!selectedMedia) {
      return (
        <Box sx={{ 
          height: '200px', 
          border: '1px dashed #ccc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Typography variant="body2" color="text.secondary">
            メディアを選択してください
          </Typography>
        </Box>
      );
    }
    
    if (isLoadingWaveform) {
      return (
        <Box sx={{ 
          height: '200px', 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <CircularProgress size={32} sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary">
            波形データを読み込み中...
          </Typography>
        </Box>
      );
    }
    
    if (displayError) {
      return (
        <Box sx={{ 
          height: '200px', 
          border: '1px dashed #f44336',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f44336'
        }}>
          <Typography variant="body2" gutterBottom>
            {displayError}
          </Typography>
          <Button 
            variant="outlined" 
            color="error" 
            size="small"
            onClick={handleGenerateWaveform}
          >
            波形を再生成
          </Button>
        </Box>
      );
    }
    
    if (!waveformData || waveformData.length === 0) {
      return (
        <Box sx={{ 
          height: '200px', 
          border: '1px dashed #ccc',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            波形データがありません
          </Typography>
          <Button 
            variant="outlined" 
            size="small"
            onClick={handleGenerateWaveform}
          >
            波形を生成
          </Button>
        </Box>
      );
    }
    
    // 波形が正常に取得できた場合、canvas表示
    return (
      <Box sx={{ 
        height: '200px', 
        border: '1px solid #e0e0e0',
        borderRadius: '4px',
        overflow: 'hidden',
        position: 'relative',
        cursor: 'pointer' // カーソルをポインターに変更してクリッカブルであることを示す
      }}>
        <canvas 
          ref={waveformCanvasRef} 
          style={{ width: '100%', height: '100%' }}
          onClick={handleCanvasClick} // 波形クリックでシーク
        />
        {
          selectedMedia && inPoint !== null && outPoint !== null && (
            <Box sx={{ 
              position: 'absolute', 
              bottom: 4, 
              left: 8, 
              right: 8, 
              display: 'flex', 
              justifyContent: 'space-between',
              fontSize: '0.75rem',
              color: 'rgba(0, 0, 0, 0.6)',
              pointerEvents: 'none'
            }}>
              <span>IN: {inPoint.toFixed(2)}s</span>
              {
                selectedMedia.duration && (
                  <span>選択: {(outPoint - inPoint).toFixed(2)}s / 合計: {selectedMedia.duration.toFixed(2)}s</span>
                )
              }
              <span>OUT: {outPoint.toFixed(2)}s</span>
            </Box>
          )
        }
      </Box>
    );
  }, [selectedMedia, isLoadingWaveform, displayError, waveformData, handleGenerateWaveform, inPoint, outPoint]);

  // 波形データと選択範囲を描画
  useEffect(() => {
    const drawCanvas = () => {
      if (!selectedMedia || !waveformCanvasRef.current || !waveformData || waveformData.length === 0) {
        return;
      }
      
      if (isInitialRender.current) {
        isInitialRender.current = false;
        resizeCanvas();
      }
      
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      
      animationFrameId.current = requestAnimationFrame(drawWaveform);
    };
    
    drawCanvas();
  }, [waveformData, selectedMedia, inPoint, outPoint, currentTime]);
  
  // キャンバスのサイズを親要素に合わせる
  const resizeCanvas = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    const container = canvas?.parentElement;
    
    if (canvas && container) {
      // デバイスピクセル比を考慮したキャンバスサイズ設定
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      
      // CSSでの見た目のサイズ
      canvas.style.width = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
      
      setDimensionsLoaded(true);
      // drawWaveformを安全に呼び出し
      if (waveformData && waveformData.length > 0 && selectedMedia) {
        drawWaveform();
      }
      Logger.debug('TrimPane', 'キャンバスサイズ更新', { width: canvas.width, height: canvas.height });
    }
  }, [drawWaveform, waveformData, selectedMedia]);

  // 波形を描画する関数
  const drawWaveform = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !selectedMedia || !waveformData || waveformData.length === 0) {
      return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width;
    const height = canvas.height;
    const duration = selectedMedia.duration || 1; // 0除算を防ぐ
    
    // キャンバスをクリア
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.scale(dpr, dpr);
    
    // 背景を描画
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, width, height);
    
    // 1秒ごとの目盛りを描画
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    const pixelsPerSecond = (width / dpr) / duration;
    
    for (let i = 0; i <= duration; i++) {
      const x = i * pixelsPerSecond;
      
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height / dpr);
      ctx.stroke();
      
      // 5秒ごとに時間を表示
      if (i % 5 === 0 || i === Math.floor(duration)) {
        ctx.fillStyle = '#757575';
        ctx.font = '10px Arial';
        ctx.fillText(`${i}s`, x + 2, 12);
      }
    }
    
    // 波形データがない場合は終了
    if (!waveformData.length) {
      ctx.restore();
      return;
    }
    
    // データポイントが多すぎる場合はダウンサンプリング
    const displayWidth = width / dpr;
    const dataPoints = Math.min(displayWidth, waveformData.length);
    const step = waveformData.length / dataPoints;
    
    // 選択範囲を描画
    if (inPoint !== null && outPoint !== null) {
      const inX = (inPoint / duration) * displayWidth;
      const outX = (outPoint / duration) * displayWidth;
      
      ctx.fillStyle = 'rgba(25, 118, 210, 0.3)'; // primary colorの薄い色
      ctx.fillRect(inX, 0, outX - inX, height / dpr);
    }
    
    // 波形の描画
    ctx.beginPath();
    ctx.strokeStyle = '#4dabf5';
    ctx.lineWidth = 1.5;
    
    // 波形の中央線（0dBの位置）
    const centerY = (height / dpr) / 2;
    
    for (let i = 0; i < dataPoints; i++) {
      const x = i;
      const dataIndex = Math.floor(i * step);
      // 波形データは0-1の範囲を想定
      const amplitude = waveformData[dataIndex] * ((height / dpr) / 2);
      
      if (i === 0) {
        ctx.moveTo(x, centerY - amplitude);
      } else {
        ctx.lineTo(x, centerY - amplitude);
      }
    }
    
    // 中央線から下の波形を描画
    for (let i = dataPoints - 1; i >= 0; i--) {
      const x = i;
      const dataIndex = Math.floor(i * step);
      // 波形データは0-1の範囲を想定
      const amplitude = waveformData[dataIndex] * ((height / dpr) / 2);
      
      ctx.lineTo(x, centerY + amplitude);
    }
    
    ctx.closePath();
    ctx.fillStyle = 'rgba(33, 150, 243, 0.1)';
    ctx.fill();
    ctx.stroke();
    
    // 現在位置を描画
    if (currentTime !== undefined) {
      const currentX = (currentTime / duration) * displayWidth;
      
      ctx.beginPath();
      ctx.strokeStyle = '#4caf50'; // success color
      ctx.lineWidth = 2;
      ctx.moveTo(currentX, 0);
      ctx.lineTo(currentX, height / dpr);
      ctx.stroke();
    }
    
    ctx.restore();
  }, [waveformData, selectedMedia, inPoint, outPoint, currentTime]);

  // 波形をクリックしたときのシーク処理
  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!waveformCanvasRef.current || !selectedMedia?.duration) return;

    const canvas = waveformCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const displayWidth = rect.width;

    // 表示幅が0以下の場合は処理しない
    if (displayWidth <= 0) return;

    // クリック位置に対応する時間を計算
    const clickedTime = (x / displayWidth) * selectedMedia.duration;
    Logger.debug('TrimPane', '波形クリックによるシーク', { time: clickedTime });

    // 親コンポーネントのシーク関数を呼び出し
    onSeek(clickedTime);
  }, [selectedMedia, onSeek]);

  // メモ化されたレンダリング
  const renderedWaveform = useMemo(() => renderWaveform(), [renderWaveform]);

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Typography variant="body2" gutterBottom>トリミング</Typography>
      <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          onClick={handleSetInPoint}
          disabled={!selectedMedia}
          size="small"
          sx={{ fontSize: '0.75rem' }}
        >
          IN点を設定 {inPoint !== null ? `(${inPoint.toFixed(2)}s)` : ''}
        </Button>
        <Button
          variant="contained"
          onClick={handleSetOutPoint}
          disabled={!selectedMedia}
          size="small"
          sx={{ fontSize: '0.75rem' }}
        >
          OUT点を設定 {outPoint !== null ? `(${outPoint.toFixed(2)}s)` : ''}
        </Button>
      </Box>
      {renderedWaveform}
    </Box>
  );
};

export default TrimPane;