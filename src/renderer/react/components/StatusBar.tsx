import React from 'react';

interface StatusBarProps {
  status: string;
  ffmpegVersion: string;
}

// ステータスバーコンポーネント
const StatusBar: React.FC<StatusBarProps> = ({ status, ffmpegVersion }) => {
  return (
    <footer className="status-bar">
      <div className="status-message">{status}</div>
      <div className="ffmpeg-version">{ffmpegVersion}</div>
    </footer>
  );
};

export default StatusBar; 