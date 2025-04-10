import React, { useRef, useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';

interface WaveformDisplayProps {
  waveformData: number[];
  duration: number;
  trimStart: number | null;
  trimEnd: number | null;
  currentTime: number;
  seeking: boolean;
  onSetTrimStart: (time: number) => void;
  onSetTrimEnd: (time: number) => void;
  onSeek: (time: number) => void;
}

/**
 * 波形表示コンポーネント
 */
const WaveformDisplay: React.FC<WaveformDisplayProps> = ({
  waveformData,
  duration,
  trimStart,
  trimEnd,
  currentTime,
  seeking,
  onSetTrimStart,
  onSetTrimEnd,
  onSeek
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // 波形をキャンバスに描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData.length) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    
    // 背景をクリア
    ctx.clearRect(0, 0, width, height);
    
    // 波形データを描画
    const barWidth = width / waveformData.length;
    const centerY = height / 2;
    
    // 波形の背景を描画
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);
    
    // トリム範囲を色付きで表示
    if (trimStart !== null && trimEnd !== null) {
      ctx.fillStyle = 'rgba(100, 149, 237, 0.2)';
      const startX = (trimStart / duration) * width;
      const endX = (trimEnd / duration) * width;
      ctx.fillRect(startX, 0, endX - startX, height);
    }
    
    // 波形を描画
    ctx.fillStyle = '#4285f4';
    for (let i = 0; i < waveformData.length; i++) {
      const x = i * barWidth;
      const barHeight = waveformData[i] * height * 0.8;
      ctx.fillRect(x, centerY - barHeight / 2, barWidth - 1, barHeight);
    }
    
    // 現在位置のマーカーを描画
    const currentX = (currentTime / duration) * width;
    ctx.strokeStyle = '#ff5722';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(currentX, 0);
    ctx.lineTo(currentX, height);
    ctx.stroke();
    
    // トリムマーカーを描画
    if (trimStart !== null) {
      const trimStartX = (trimStart / duration) * width;
      drawTrimMarker(ctx, trimStartX, height, '#2196f3');
    }
    
    if (trimEnd !== null) {
      const trimEndX = (trimEnd / duration) * width;
      drawTrimMarker(ctx, trimEndX, height, '#2196f3');
    }
  }, [waveformData, duration, trimStart, trimEnd, currentTime]);
  
  // トリムマーカーを描画するヘルパー関数
  const drawTrimMarker = (
    ctx: CanvasRenderingContext2D,
    x: number,
    height: number,
    color: string
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    
    // ハンドル部分を描画
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, height / 2, 8, 0, Math.PI * 2);
    ctx.fill();
  };
  
  // マウスイベントハンドラー
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const time = (mouseX / rect.width) * duration;
    
    // トリムポイント付近をドラッグしているか判定
    if (trimStart !== null && Math.abs(time - trimStart) < duration * 0.02) {
      setIsResizing('start');
    } else if (trimEnd !== null && Math.abs(time - trimEnd) < duration * 0.02) {
      setIsResizing('end');
    } else {
      // トリムポイント以外の場所をクリックした場合は、シークとして扱う
      onSeek(time);
      setIsDragging(true);
    }
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (isResizing || isDragging) {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const newTime = Math.max(0, Math.min(duration, (mouseX / rect.width) * duration));
      
      if (isResizing === 'start') {
        if (trimEnd === null || newTime < trimEnd) {
          onSetTrimStart(newTime);
        }
      } else if (isResizing === 'end') {
        if (trimStart === null || newTime > trimStart) {
          onSetTrimEnd(newTime);
        }
      } else if (isDragging) {
        onSeek(newTime);
      }
    }
  };
  
  const handleMouseUp = () => {
    setIsResizing(null);
    setIsDragging(false);
  };
  
  // マウスがウィンドウから出た場合のハンドリング
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsResizing(null);
      setIsDragging(false);
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);
  
  return (
    <Box 
      ref={containerRef}
      sx={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative',
        userSelect: 'none'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          cursor: isResizing ? 'col-resize' : (seeking ? 'grabbing' : 'crosshair')
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      
      {/* 時間表示 */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        position: 'absolute',
        bottom: '5px',
        left: '10px',
        right: '10px',
        pointerEvents: 'none'
      }}>
        <Typography variant="caption" color="text.secondary">
          {formatTime(0)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatTime(duration)}
        </Typography>
      </Box>
      
      {/* 現在の時間表示 */}
      <Box sx={{ 
        position: 'absolute',
        top: '5px',
        left: '10px',
        pointerEvents: 'none'
      }}>
        <Typography variant="caption" color="error">
          {formatTime(currentTime)}
        </Typography>
      </Box>
      
      {/* トリム時間表示 */}
      {trimStart !== null && trimEnd !== null && (
        <Box sx={{ 
          position: 'absolute',
          top: '5px',
          right: '10px',
          pointerEvents: 'none'
        }}>
          <Typography variant="caption" color="primary">
            {formatTime(trimEnd - trimStart)}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

/**
 * 秒を時:分:秒の形式にフォーマット
 */
const formatTime = (seconds: number): string => {
  const pad = (num: number): string => num.toString().padStart(2, '0');
  
  const totalSeconds = Math.round(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  
  return `${pad(mins)}:${pad(secs)}`;
};

export default WaveformDisplay;
