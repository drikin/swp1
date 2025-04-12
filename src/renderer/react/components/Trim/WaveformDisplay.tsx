import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Box, Typography, useTheme } from '@mui/material';

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
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  
  // テーマを最上位レベルで取得
  const theme = useTheme();
  const colors = React.useMemo(() => {
    return theme.palette.mode === 'dark' 
      ? { 
          background: '#1e1e1e', 
          waveform: '#4285f4', 
          trimArea: 'rgba(0, 120, 215, 0.2)', 
          playhead: '#ff5722', 
          trimMarker: '#0078d7' 
        } 
      : { 
          background: '#f0f0f0', 
          waveform: '#0078d7', 
          trimArea: 'rgba(0, 120, 215, 0.2)', 
          playhead: '#d70040', 
          trimMarker: '#0078d7' 
        };
  }, [theme.palette.mode]);

  // props監視用デバッグロガー
  useEffect(() => {
    console.log('🔍 WaveformDisplay - propsデバッグ:', { 
      propsReceived: {
        waveformDataExists: !!waveformData,
        waveformDataType: typeof waveformData,
        waveformDataLength: waveformData ? waveformData.length : 0,
        duration,
        trimStart,
        trimEnd,
        currentTime
      }
    });
  }, [waveformData, duration, trimStart, trimEnd, currentTime]);

  // トリムマーカーを描画するヘルパー関数
  const drawTrimMarker = useCallback((
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
  }, []);

  // 波形描画関数
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.log('描画スキップ: キャンバスが見つかりません');
      return;
    }
    
    console.log('👉 波形データデバッグ情報:', {
      waveformDataExists: !!waveformData,
      waveformDataType: typeof waveformData,
      isArray: Array.isArray(waveformData),
      length: waveformData ? waveformData.length : 0,
      isEmpty: !waveformData || waveformData.length === 0,
      firstFewItems: waveformData ? waveformData.slice(0, 10) : [],
      hasNaN: waveformData ? waveformData.some(val => isNaN(val)) : false,
      min: waveformData ? Math.min(...waveformData) : null,
      max: waveformData ? Math.max(...waveformData) : null,
    });
    
    if (!waveformData || !waveformData.length) {
      console.log('描画スキップ: 波形データがありません');
      return;
    }
    
    console.log('波形描画開始', { 
      waveformDataLength: waveformData.length,
      duration,
      canvasSize
    });
    
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('描画コンテキスト取得失敗');
        return;
      }
      
      // 背景をクリア
      ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
      
      // 波形の背景を描画
      ctx.fillStyle = colors.background;
      ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
      
      // キャンバスが適切なサイズを持っていない場合、処理を中止
      if (canvasSize.width < 10 || canvasSize.height < 10) {
        console.error('キャンバスサイズが小さすぎます:', canvasSize.width, canvasSize.height);
        
        // デバッグ用の枠を描画
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvasSize.width, canvasSize.height);
        
        ctx.fillStyle = 'red';
        ctx.font = '14px Arial';
        ctx.fillText(`小さすぎるキャンバス: ${canvasSize.width}x${canvasSize.height}`, 10, 20);
        return;
      }
      
      if (duration <= 0) {
        console.error('無効な継続時間:', duration);
        
        ctx.fillStyle = 'red';
        ctx.font = '14px Arial';
        ctx.fillText(`無効な継続時間: ${duration}秒`, 10, 20);
        return;
      }

      // 波形データを描画
      const barWidth = Math.max(1, canvasSize.width / waveformData.length);
      const centerY = canvasSize.height / 2;
      
      console.log('波形バー設定', { 
        barWidth,
        dataPoints: waveformData.length, 
        totalWidth: barWidth * waveformData.length
      });
      
      // 時間の目盛りを描画
      const gridInterval = Math.max(1, Math.floor(duration / 10)); // 10秒間隔で目盛りを表示
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)';
      ctx.lineWidth = 1;
      
      for (let i = 0; i <= duration; i += gridInterval) {
        const x = (i / duration) * canvasSize.width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasSize.height);
        ctx.stroke();
        
        // 時間マーカーのラベルを描画（上部）
        if (i > 0 && i < duration) {
          ctx.fillStyle = 'rgba(150, 150, 150, 0.7)';
          ctx.font = '10px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(formatTime(i), x, 14);
        }
      }
      
      // トリム範囲を色付きで表示
      if (trimStart !== null && trimEnd !== null) {
        ctx.fillStyle = colors.trimArea;
        const startX = (trimStart / duration) * canvasSize.width;
        const endX = (trimEnd / duration) * canvasSize.width;
        ctx.fillRect(startX, 0, endX - startX, canvasSize.height);
      }
      
      // 波形に関する追加のデバッグ情報を出力
      console.log('波形描画詳細:', {
        'データサンプル': waveformData.slice(0, 5).map(v => Number(v).toFixed(2)),
        'バー幅': barWidth,
        'キャンバス幅': canvasSize.width,
        '中心Y': centerY
      });
      
      // 波形データが有効かどうかを検証
      const invalidValues = waveformData.filter(v => typeof v !== 'number' || isNaN(v) || v < 0 || v > 1);
      if (invalidValues.length > 0) {
        console.warn(`無効な波形データ値が ${invalidValues.length} 個検出されました`);
      }
      
      // 波形を描画
      ctx.fillStyle = colors.waveform;
      
      // パス描画による最適化（個別の矩形よりも効率的）
      ctx.beginPath();
      
      for (let i = 0; i < waveformData.length; i++) {
        const x = i * barWidth;
        let value = Number(waveformData[i]);
        
        // 無効な値を修正
        if (isNaN(value) || value < 0) {
          value = 0;
        } else if (value > 1) {
          value = 1;
        }
        
        const barHeight = value * (canvasSize.height * 0.8);
        const yTop = centerY - barHeight / 2;
        
        // 矩形を描画（パフォーマンス向上のためにパスを使用）
        ctx.rect(x, yTop, Math.max(1, barWidth - 1), barHeight);
      }
      
      // パスを一度に塗りつぶす
      ctx.fill();
      
      // 現在位置のマーカーを描画
      const currentX = (currentTime / duration) * canvasSize.width;
      ctx.strokeStyle = colors.playhead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(currentX, 0);
      ctx.lineTo(currentX, canvasSize.height);
      ctx.stroke();
      
      // トリムマーカーを描画
      if (trimStart !== null) {
        const trimStartX = (trimStart / duration) * canvasSize.width;
        drawTrimMarker(ctx, trimStartX, canvasSize.height, colors.trimMarker);
      }
      
      if (trimEnd !== null) {
        const trimEndX = (trimEnd / duration) * canvasSize.width;
        drawTrimMarker(ctx, trimEndX, canvasSize.height, colors.trimMarker);
      }
      
      console.log('波形描画完了');
    } catch (error) {
      console.error('波形描画エラー:', error);
    }
  }, [waveformData, duration, trimStart, trimEnd, currentTime, drawTrimMarker, canvasSize, colors]);

  // キャンバスサイズの設定とリサイズ監視
  useEffect(() => {
    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      
      // コンテナのサイズを取得
      const rect = container.getBoundingClientRect();
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      
      console.log('コンテナサイズ更新:', width, height);
      
      if (width === 0 || height === 0) {
        console.error('コンテナサイズがゼロです');
        return;
      }
      
      // キャンバス表示サイズをコンテナに合わせる
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      
      // キャンバス描画バッファのサイズ設定（高解像度ディスプレイ対応）
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      
      console.log('キャンバスバッファサイズ設定:', canvas.width, canvas.height, 'DPR:', dpr);
      
      // サイズ情報をステートに保存
      setCanvasSize({ width, height });
    };
    
    // リサイズイベントリスナー
    const handleResize = () => {
      updateCanvasSize();
    };
    
    // 初期サイズ設定
    updateCanvasSize();
    
    // リサイズイベントを監視
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 波形データまたはキャンバスサイズが変わったら描画
  useEffect(() => {
    if (canvasSize.width > 0 && canvasSize.height > 0 && waveformData && waveformData.length > 0) {
      console.log('波形描画トリガー：', {
        width: canvasSize.width,
        height: canvasSize.height,
        dataLength: waveformData.length
      });
      
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // キャンバスコンテキストの保存・復元
            ctx.save();
            
            // キャンバスのクリア
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // 高解像度ディスプレイに対応
            const dpr = window.devicePixelRatio || 1;
            ctx.scale(dpr, dpr);
            
            // 波形描画
            drawWaveform();
            
            ctx.restore();
            
            console.log('波形描画完了（キャンバスサイズ）:', canvasSize.width, canvasSize.height);
          }
        }
      });
    }
  }, [canvasSize, waveformData, duration, trimStart, trimEnd, currentTime, drawWaveform]);

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
        userSelect: 'none',
        bgcolor: 'background.paper',
        borderRadius: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* 情報表示領域 - 上部固定エリア */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        px: 1,
        py: 0.3,
        borderBottom: '1px solid rgba(0,0,0,0.1)',
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(240,240,240,0.8)',
        height: '22px', // 高さを固定
        zIndex: 5
      }}>
        {/* 左側 - 現在時間表示 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="caption" sx={{ 
            fontWeight: 'medium', 
            fontSize: '0.7rem',
            color: theme.palette.text.secondary 
          }}>
            現在位置: {formatTime(currentTime)}
          </Typography>
        </Box>
        
        {/* 右側 - トリム情報 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {trimStart !== null && trimEnd !== null ? (
            <Typography variant="caption" sx={{ 
              fontWeight: 'medium', 
              fontSize: '0.7rem',
              color: theme.palette.primary.main
            }}>
              {formatTime(trimStart)} - {formatTime(trimEnd)} ({formatTime(trimEnd - trimStart)})
            </Typography>
          ) : (
            <Typography variant="caption" sx={{ 
              fontWeight: 'medium', 
              fontSize: '0.7rem',
              color: theme.palette.text.secondary
            }}>
              トリム未設定
            </Typography>
          )}
        </Box>
      </Box>

      {/* 波形表示エリア - メインコンテンツ */}
      <Box sx={{
        position: 'relative',
        flex: 1,
        minHeight: '120px',
        height: 'calc(100% - 40px)', // 上下の情報表示エリアの高さを引いた値
        overflow: 'hidden' // 波形が切れないように
      }}>
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            cursor: isResizing ? 'col-resize' : (seeking ? 'grabbing' : 'crosshair')
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />

        {/* デバッグ情報 - 開発時のみ表示 */}
        <Box sx={{ 
          position: 'absolute', 
          top: 5, 
          right: 5, 
          zIndex: 4, 
          bgcolor: 'rgba(0,0,0,0.5)', 
          color: 'white', 
          p: 0.3,
          borderRadius: 1,
          fontSize: '0.6rem',
          opacity: 0.5
        }}>
          Canvas: {canvasSize.width}x{canvasSize.height}
        </Box>
      </Box>

      {/* 時間目盛り表示 - 下部固定エリア */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        px: 1,
        py: 0.3,
        borderTop: '1px solid rgba(0,0,0,0.1)',
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(240,240,240,0.8)',
        height: '18px', // 高さを固定
        zIndex: 5,
        fontSize: '0.65rem'
      }}>
        <Typography variant="caption" sx={{ 
          fontWeight: 'medium', 
          fontSize: '0.65rem',
          color: theme.palette.text.secondary
        }}>
          {formatTime(0)}
        </Typography>
        
        <Typography variant="caption" sx={{ 
          fontWeight: 'medium', 
          fontSize: '0.65rem',
          color: theme.palette.text.secondary
        }}>
          合計: {formatTime(duration)}
        </Typography>
      </Box>
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
