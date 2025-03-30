import React, { useState } from 'react';

// トリムコントロールコンポーネント
const TrimControls: React.FC = () => {
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);

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
      </div>
      <div className="panel-content">
        <div className="trim-controls">
          <div className="trim-points">
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
          </div>
          <div className="trim-actions">
            <button 
              onClick={handleApplyTrim}
              disabled={inPoint === null || outPoint === null}
            >
              トリミング適用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrimControls; 