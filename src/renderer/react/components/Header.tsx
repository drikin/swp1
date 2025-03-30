import React from 'react';

interface HeaderProps {
  taskCount: number;
  onAddFiles: () => void;
  onToggleExport: () => void;
}

// ヘッダーコンポーネント
const Header: React.FC<HeaderProps> = ({ taskCount, onAddFiles, onToggleExport }) => {
  return (
    <header className="app-header">
      <h1>Super Watarec</h1>
      <div className="task-indicator">
        処理中: <span>{taskCount}</span>件
      </div>
      <div className="controls">
        <button onClick={onAddFiles}>素材を追加</button>
        <button onClick={onToggleExport} className="export-toggle-btn">書き出し設定</button>
      </div>
    </header>
  );
};

export default Header; 