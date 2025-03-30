import React, { useRef, useEffect, useState } from 'react';

interface TrimPaneProps {
  selectedMedia: any | null;
}

// トリミングペインコンポーネント
const TrimPane: React.FC<TrimPaneProps> = ({ selectedMedia }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState(0);
  const [waveformData, setWaveformData] = useState<number[] | null>(null);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);

  // タイムライン目盛りを描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // キャンバスをクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 目盛りを描画
    ctx.fillStyle = '#666';
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.font = '10px sans-serif';
    
    const secondWidth = 60 * scale; // 1秒あたりの幅（ピクセル）
    const totalSeconds = Math.ceil(canvas.width / secondWidth);
    
    for (let i = 0; i <= totalSeconds; i++) {
      const x = i * secondWidth;
      
      // 秒の目盛り線
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 15);
      ctx.stroke();
      
      // 時間表示
      const time = i + Math.floor(position);
      const minutes = Math.floor(time / 60);
      const seconds = time % 60;
      const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      ctx.fillText(timeText, x + 2, 12);
      
      // 0.5秒ごとの小さな目盛り
      if (i < totalSeconds) {
        const halfX = x + secondWidth / 2;
        ctx.beginPath();
        ctx.moveTo(halfX, 0);
        ctx.lineTo(halfX, 8);
        ctx.stroke();
      }
    }
  }, [scale, position]);

  // 選択されたメディアが変更されたときに波形を生成
  useEffect(() => {
    const generateWaveform = async () => {
      if (!selectedMedia || !selectedMedia.path || !window.api || selectedMedia.type !== 'video') {
        setWaveformData(null);
        return;
      }

      try {
        setIsLoadingWaveform(true);
        // 一時ファイルパスはnullを渡して、API側で生成する
        const result = await window.api.generateWaveform(selectedMedia.path, null);
        if (result && result.success && result.waveform) {
          setWaveformData(result.waveform);
        } else {
          console.error('Failed to generate waveform:', result?.error || 'Unknown error');
          setWaveformData(null);
        }
      } catch (error) {
        console.error('Error generating waveform:', error);
        setWaveformData(null);
      } finally {
        setIsLoadingWaveform(false);
      }
    };

    generateWaveform();
  }, [selectedMedia]);

  // 波形を描画
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !waveformData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // キャンバスをクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 波形を描画
    const width = canvas.width;
    const height = canvas.height;
    const barWidth = width / waveformData.length;
    const centerY = height / 2;
    
    ctx.fillStyle = '#0078d7';
    
    // 最大値を見つけてスケーリング
    const maxValue = Math.max(...waveformData, 1);
    const scaleFactor = (height / 2) / maxValue;
    
    for (let i = 0; i < waveformData.length; i++) {
      const x = i * barWidth;
      const barHeight = waveformData[i] * scaleFactor;
      
      ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
    }
  }, [waveformData]);

  // ズームイン
  const handleZoomIn = () => {
    setScale(prevScale => Math.min(prevScale * 1.5, 10));
  };

  // ズームアウト
  const handleZoomOut = () => {
    setScale(prevScale => Math.max(prevScale / 1.5, 0.5));
  };

  // IN点の設定
  const handleSetInPoint = () => {
    // 現在の再生位置を取得する処理（実際の実装では、現在の再生位置を取得する必要があります）
    const currentPosition = 0; // 仮の値
    setInPoint(currentPosition);
  };

  // OUT点の設定
  const handleSetOutPoint = () => {
    // 現在の再生位置を取得する処理（実際の実装では、現在の再生位置を取得する必要があります）
    const currentPosition = 10; // 仮の値
    setOutPoint(currentPosition);
  };

  // トリミングの適用
  const handleApplyTrim = () => {
    if (inPoint !== null && outPoint !== null) {
      // トリミング適用処理（実際の実装ではAPIを呼び出すなどする）
      console.log(`トリミング適用: ${inPoint}秒から${outPoint}秒まで`);
    } else {
      console.log('IN点とOUT点を設定してください');
    }
  };

  // 時間をフォーマット
  const formatTime = (seconds: number | null): string => {
    if (seconds === null) return '--:--:--';
    
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>トリミング</h2>
        <div className="timeline-controls">
          <button className="compact-btn" onClick={handleZoomIn}>+</button>
          <button className="compact-btn" onClick={handleZoomOut}>-</button>
        </div>
      </div>
      <div className="panel-content">
        <div className="timeline-ruler">
          <canvas 
            ref={canvasRef} 
            width={1000} 
            height={20}
          />
        </div>
        <div className="timeline-tracks">
          {/* トラック1 */}
          <div className="timeline-track">
            <div className="track-header">ビデオ</div>
            <div className="track-content"></div>
          </div>
          
          {/* トラック2 */}
          <div className="timeline-track">
            <div className="track-header">オーディオ</div>
            <div className="track-content"></div>
          </div>
        </div>
        <div className="waveform-container">
          {isLoadingWaveform ? (
            <div className="waveform-loading">波形生成中...</div>
          ) : waveformData ? (
            <canvas ref={waveformCanvasRef} width={1000} height={100} />
          ) : (
            <div className="waveform-empty">波形データがありません</div>
          )}
        </div>
        
        {/* トリミングコントロール */}
        <div className="trim-controls">
          <div className="trim-point-item">
            <span className="trim-label">IN:</span>
            <span className="trim-value">{formatTime(inPoint)}</span>
            <button onClick={handleSetInPoint}>IN点設定</button>
          </div>
          <div className="trim-point-item">
            <span className="trim-label">OUT:</span>
            <span className="trim-value">{formatTime(outPoint)}</span>
            <button onClick={handleSetOutPoint}>OUT点設定</button>
          </div>
          <button 
            className="trim-apply-btn"
            onClick={handleApplyTrim}
            disabled={inPoint === null || outPoint === null}
          >
            トリミング適用
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrimPane; 