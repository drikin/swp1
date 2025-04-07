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
  const [error, setError] = useState<string | null>(null);
  const [fetchAttempts, setFetchAttempts] = useState(0);
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

  // 波形データを取得する関数
  const fetchWaveformData = useCallback(async (taskId: string) => {
    console.log(`波形データを取得します（タスクID: ${taskId}）`);
    
    if (!window.api) {
      console.error('API が利用できません');
      return;
    }

    try {
      // タスク状態の確認
      const taskStatus = await window.api.getTaskStatus(taskId);
      console.log(`タスク状態: ${JSON.stringify(taskStatus)}`);
      
      // タスクが完了していない場合は終了
      if (taskStatus && taskStatus.status !== 'completed') {
        console.log(`タスクはまだ完了していません (status: ${taskStatus.status})`);
        
        // タスクが処理中の場合は再試行をスケジュール
        if (taskStatus.status === 'processing') {
          setFetchAttempts(prevAttempts => {
            const newAttempts = prevAttempts + 1;
            
            // 最大10回まで試行（合計10秒）
            if (newAttempts <= 10) {
              console.log(`波形データ取得を再試行します (${newAttempts}/10)...`);
              // 1秒後に再試行
              setTimeout(() => fetchWaveformData(taskId), 1000);
            } else {
              console.warn('波形データ取得の最大試行回数に達しました');
              setError('波形データの生成中にタイムアウトしました。');
            }
            
            return newAttempts;
          });
        }
        
        return;
      }
      
      // このタスクの波形データを取得
      const waveformData = await window.api.getWaveformData(taskId);
      console.log('波形データを取得しました:', waveformData ? 'データあり' : 'データなし');
      
      if (!waveformData || !waveformData.data) {
        console.error('有効な波形データがありません');
        setError('波形データを取得できませんでした。');
        return;
      }
      
      // 成功: 波形データを状態に設定
      setWaveformData(waveformData.data);
      setIsLoadingWaveform(false);
      setError(null);
      
    } catch (error) {
      console.error('波形データ取得エラー:', error);
      setError('波形データの取得中にエラーが発生しました。');
      setIsLoadingWaveform(false);
    }
  }, []);

  // メディアが変更されたときに波形データを読み込む
  useEffect(() => {
    if (!selectedMedia || !selectedMedia.path) {
      console.log('有効なメディアファイルがありません');
      return;
    }

    // ローディング状態をリセット
    setIsLoadingWaveform(true);
    setError(null);
    setWaveformData(null);
    setFetchAttempts(0);

    // 1. まず既存の波形タスクを確認
    // メディアパスに紐づくタスクを以前にgetTaskIdByMediaPath関数で取得
    const checkExistingTask = async () => {
      try {
        console.log(`メディアファイルの波形データを確認: ${selectedMedia.path}`);
        
        // 以前の波形生成タスクがあるか確認
        const existingTaskId = await window.api.getTaskIdByMediaPath(selectedMedia.path, 'waveform');
        console.log('既存タスクID:', existingTaskId);
        
        if (existingTaskId) {
          console.log(`既存の波形タスクが見つかりました: ${existingTaskId}`);
          
          // 既存タスクから波形データを取得
          fetchWaveformData(existingTaskId);
        } else {
          console.log('既存の波形タスクが見つかりません。新しいタスクを作成します...');
          
          // 2. 波形データを生成する新しいタスクを作成
          generateWaveform();
        }
      } catch (error) {
        console.error('波形タスク確認エラー:', error);
        setError('波形データの確認中にエラーが発生しました。');
        setIsLoadingWaveform(false);
      }
    };
    
    // 初期確認を実行
    checkExistingTask();
    
    // tasks-updated イベントのリスナーを設定
    const unsubscribe = window.api.on('tasks-updated', (data) => {
      console.log('タスク更新イベント受信:', data);
      
      // 完了した波形タスクを探す
      const completedWaveformTasks = data.tasks.filter(
        (t: { type: string; status: string; mediaPath: string }) => 
          t.type === 'waveform' && t.status === 'completed' && t.mediaPath === selectedMedia.path
      );
      
      if (completedWaveformTasks.length > 0) {
        const latestTask = completedWaveformTasks[0];
        console.log('完了した波形タスクを検出:', latestTask.id);
        
        // 波形データを取得
        fetchWaveformData(latestTask.id);
      }
    });
    
    // クリーンアップ時にリスナーを削除
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [selectedMedia, fetchWaveformData]);

  // 波形データを生成
  const generateWaveform = async () => {
    if (!selectedMedia || !selectedMedia.path || !window.api) {
      console.error('波形を生成できません: 無効なメディアまたはAPI');
      setError('波形を生成できません。メディアファイルが無効です。');
      setIsLoadingWaveform(false);
      return;
    }

    try {
      console.log(`波形生成開始: ${selectedMedia.path}`);
      setIsLoadingWaveform(true);
      setError(null);
      
      // 波形生成タスクを作成して実行
      const response = await window.api.generateWaveform(selectedMedia.path);
      console.log('波形生成タスク作成:', response);
      
      if (response && response.taskId) {
        // タスクIDを保存（将来の参照用）
        const taskId = response.taskId;
        console.log(`波形生成タスクID: ${taskId}`);
        
        // 完了を待ってデータ取得
        fetchWaveformData(taskId);
      } else {
        throw new Error('タスクIDが返されませんでした');
      }
    } catch (error) {
      console.error('波形生成エラー:', error);
      setError('波形の生成中にエラーが発生しました。');
      setIsLoadingWaveform(false);
    }
  };

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