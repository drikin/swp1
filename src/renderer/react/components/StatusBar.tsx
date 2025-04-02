import React from 'react';
import { formatDuration } from '../../utils/formatters';

interface StatusBarProps {
  status: string;
  ffmpegVersion: string;
  totalDuration: number;
}

// ステータスバーコンポーネント
const StatusBar: React.FC<StatusBarProps> = ({ status, ffmpegVersion, totalDuration }) => {
  const formattedDuration = formatDuration(totalDuration);

  return (
    <div className="status-bar">
      <span>{status}</span>
      <span className="duration-display">Total: {formattedDuration}</span>
      <span>{ffmpegVersion}</span>
    </div>
  );
};

export default StatusBar;