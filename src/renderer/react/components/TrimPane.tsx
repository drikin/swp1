import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Box, Typography, CircularProgress } from '@mui/material';
import type { MediaFile } from '../types';

interface TrimPaneProps {
  selectedMedia: MediaFile | null;
  currentTime: number;
  onUpdateTrimPoints: (mediaId: string, trimStart: number | null, trimEnd: number | null) => void;
  onSeek: (time: number) => void; // Add onSeek prop for seeking
}

// --- Helper: Canvas Drawing Function ---
const drawCanvas = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  duration: number | undefined,
  waveformData: number[] | null,
  inPoint: number | null,
  outPoint: number | null,
  currentTime: number
) => {
  ctx.clearRect(0, 0, width, height);

  // Ensure waveform data and duration are available
  if (!waveformData || waveformData.length === 0 || !duration || duration <= 0) {
    return; // Don't draw if data is missing
  }

  // --- 1. Waveform ---
  const barWidth = width / waveformData.length;
  const centerY = height / 2;
  ctx.fillStyle = '#90caf9'; // Light blue for dark background
  const maxValue = Math.max(...waveformData, 1);
  const scaleFactor = (height / 2) / maxValue;

  for (let i = 0; i < waveformData.length; i++) {
    const x = i * barWidth;
    const barHeight = waveformData[i] * scaleFactor;
    ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
  }

  // --- Helper: Time to X ---
  const timeToX = (time: number): number => {
    return Math.max(0, Math.min(width, (time / duration) * width));
  };

  // --- 2. Shading & Markers ---
  const inX = typeof inPoint === 'number' ? timeToX(inPoint) : -1;
  const outX = typeof outPoint === 'number' ? timeToX(outPoint) : -1;

  if (inX !== -1 && outX !== -1 && inX < outX) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Darker shading
    ctx.fillRect(0, 0, inX, height);
    ctx.fillRect(outX, 0, width - outX, height);
  }

  if (inX !== -1) {
    ctx.fillStyle = 'rgba(102, 187, 106, 0.8)'; // Green
    ctx.fillRect(inX - 1, 0, 3, height);
  }

  if (outX !== -1) {
    ctx.fillStyle = 'rgba(229, 115, 115, 0.8)'; // Red
    ctx.fillRect(outX - 1, 0, 3, height);
  }

  // --- 3. Timeline Indicator ---
  if (currentTime >= 0) {
    const currentX = timeToX(currentTime);
    ctx.strokeStyle = '#fff176'; // Yellow
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(currentX, 0);
    ctx.lineTo(currentX, height);
    ctx.stroke();
  }
};

const TrimPane: React.FC<TrimPaneProps> = ({ 
  selectedMedia, 
  currentTime, 
  onUpdateTrimPoints,
  onSeek // Destructure onSeek prop
}) => {
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [waveformData, setWaveformData] = useState<number[] | null>(null);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);

  // Refs to hold the latest values for the animation loop
  const latestProps = useRef({ selectedMedia, currentTime, inPoint, outPoint, waveformData });

  useEffect(() => {
    latestProps.current = { selectedMedia, currentTime, inPoint, outPoint, waveformData };
  }, [selectedMedia, currentTime, inPoint, outPoint, waveformData]);

  // Animation loop using requestAnimationFrame
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!ctx || !selectedMedia) {
       // Stop any previous animation if media is deselected or canvas not ready
       if (animationFrameId.current) {
         cancelAnimationFrame(animationFrameId.current);
         animationFrameId.current = null;
       }
       // Clear canvas if media deselected
       if (!selectedMedia && canvas) {
           ctx?.clearRect(0, 0, canvas.width, canvas.height);
       }
      return;
    }

    const renderLoop = () => {
      // Access latest values via ref
      const { 
        selectedMedia: currentMedia, 
        currentTime: currentPlaybackTime, 
        inPoint: currentIn, 
        outPoint: currentOut, 
        waveformData: currentWaveform 
      } = latestProps.current;

      if (waveformCanvasRef.current && currentMedia?.duration) { // Ensure canvas and duration exist
         const currentCtx = waveformCanvasRef.current.getContext('2d');
         if(currentCtx) {
             drawCanvas(
                 currentCtx,
                 waveformCanvasRef.current.width,
                 waveformCanvasRef.current.height,
                 currentMedia.duration,
                 currentWaveform,
                 currentIn,
                 currentOut,
                 currentPlaybackTime
             );
         }
      }
      animationFrameId.current = requestAnimationFrame(renderLoop);
    };

    // Start the loop
    animationFrameId.current = requestAnimationFrame(renderLoop);

    // Cleanup function
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [selectedMedia]); // Re-run only when selectedMedia changes to start/stop loop

  // Fetch waveform data when selectedMedia changes
  useEffect(() => {
    setIsLoadingWaveform(true);

    if (selectedMedia && selectedMedia.path && window.api) {
      // 対象メディアのパスを取得
      const filePath = selectedMedia.path;
      
      // パスが有効な場合のみ波形生成を実行
      if (filePath) {
        window.api.generateWaveform(filePath)
          .then((data: { waveform: number[] }) => {
            // データがある場合は波形を設定
            if (data && data.waveform) {
              setWaveformData(data.waveform);
              
              // 既存のトリム設定があれば復元
              if (selectedMedia.trimStart !== undefined) {
                setInPoint(selectedMedia.trimStart);
              }
              if (selectedMedia.trimEnd !== undefined) {
                setOutPoint(selectedMedia.trimEnd);
              }
            }
            setIsLoadingWaveform(false);
          })
          .catch((err: Error) => {
            console.error("Error generating waveform:", err);
            setWaveformData([]);
            setInPoint(null);
            setOutPoint(null);
            setIsLoadingWaveform(false);
          });
      } else {
        console.error("Invalid file path for waveform generation");
        setIsLoadingWaveform(false);
      }
    } else {
        // Clear waveform and points if no media selected
        setWaveformData(null);
        setInPoint(null);
        setOutPoint(null);
        setIsLoadingWaveform(false);
    }
  }, [selectedMedia]); // Depend only on selectedMedia

  const handleSetInPoint = useCallback(() => {
    if (!selectedMedia) return;
    const newInPoint = latestProps.current.currentTime; // Use latest time from ref
    const currentOut = latestProps.current.outPoint; // Use latest outPoint from ref
    if (currentOut !== null && newInPoint >= currentOut) {
      console.warn("IN point cannot be after OUT point.");
      return;
    }
    setInPoint(newInPoint);
    onUpdateTrimPoints(selectedMedia.id, newInPoint, currentOut);
  }, [selectedMedia, onUpdateTrimPoints]); // Dependencies: props needed to update state/call parent

  const handleSetOutPoint = useCallback(() => {
    if (!selectedMedia) return;
    const newOutPoint = latestProps.current.currentTime; // Use latest time from ref
    const currentIn = latestProps.current.inPoint; // Use latest inPoint from ref
    if (currentIn !== null && newOutPoint <= currentIn) {
      console.warn("OUT point cannot be before IN point.");
      return;
    }
    setOutPoint(newOutPoint);
    onUpdateTrimPoints(selectedMedia.id, currentIn, newOutPoint);
  }, [selectedMedia, onUpdateTrimPoints]); // Dependencies: props needed to update state/call parent

  // Handle clicks on the canvas to seek
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    // Use waveformCanvasRef consistently
    if (!waveformCanvasRef.current || !selectedMedia?.duration) return;

    const canvas = waveformCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const displayWidth = rect.width; // Use display width from getBoundingClientRect

    // Ensure displayWidth is not zero to prevent division by zero
    if (displayWidth <= 0) return;

    // Calculate the time corresponding to the click position using display width
    const clickedTime = (x / displayWidth) * selectedMedia.duration;

    // Call the onSeek prop passed from App.tsx
    onSeek(clickedTime);
  };

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Revert h2 back to Typography variant="body2" */}
      <Typography variant="body2" gutterBottom>トリミング</Typography>
      <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
        {/* Add sx prop for smaller font size */}
        <Button
          variant="contained"
          onClick={handleSetInPoint}
          disabled={!selectedMedia}
          size="small"
          sx={{ fontSize: '0.75rem' }}
        >
          IN点を設定 {latestProps.current.inPoint !== null ? `(${latestProps.current.inPoint.toFixed(2)}s)` : ''}
        </Button>
        <Button
          variant="contained"
          onClick={handleSetOutPoint}
          disabled={!selectedMedia}
          size="small"
          sx={{ fontSize: '0.75rem' }}
        >
          OUT点を設定 {latestProps.current.outPoint !== null ? `(${latestProps.current.outPoint.toFixed(2)}s)` : ''}
        </Button>
      </Box>
      <Box sx={{ flexGrow: 1, position: 'relative', backgroundColor: 'grey.900', minHeight: '100px' }}>
        {isLoadingWaveform && (
          <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            <CircularProgress color="primary" />
          </Box>
        )}
        <canvas
          ref={waveformCanvasRef}
          width={1000} // Fixed width (adjust as needed)
          height={100} // Fixed height
          style={{ display: 'block', width: '100%', height: '100%' }}
          onClick={handleCanvasClick} // Add onClick handler to the canvas
        />
      </Box>
    </Box>
  );
};

export default TrimPane;