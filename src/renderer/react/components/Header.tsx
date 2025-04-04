import React from 'react';

interface HeaderProps {
  onAddFiles: () => void;
  onToggleExport: () => void;
}

// ヘッダーコンポーネント
const Header: React.FC<HeaderProps> = ({ onAddFiles, onToggleExport }) => {
  return (
    <header className="app-header">
      <h1>Super Watarec</h1>
      <div className="controls">
        <button className="header-btn" onClick={onAddFiles}>素材を追加</button>
        <button className="header-btn export-toggle-btn" onClick={onToggleExport}>書き出し設定</button>
      </div>
    </header>
  );
};

export default Header;