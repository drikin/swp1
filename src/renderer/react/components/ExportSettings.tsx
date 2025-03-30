import React, { useState } from 'react';

interface ExportSettingsProps {
  onClose?: () => void;
}

// 書き出し設定コンポーネント
const ExportSettings: React.FC<ExportSettingsProps> = ({ onClose }) => {
  const [resolution, setResolution] = useState('1080p');
  const [fps, setFps] = useState('30');
  const [codec, setCodec] = useState('h264');
  const [isExporting, setIsExporting] = useState(false);
  const [outputPath, setOutputPath] = useState('');

  // 出力先フォルダの選択
  const handleSelectOutputPath = async () => {
    if (!window.api) return;
    
    try {
      const path = await window.api.openDirectoryDialog();
      if (path) {
        setOutputPath(path);
      }
    } catch (error) {
      console.error('フォルダ選択エラー:', error);
    }
  };

  // 書き出し処理
  const handleExport = async () => {
    if (!window.api) return;
    
    try {
      setIsExporting(true);
      
      // 実際はここでFFmpegに関連するAPIを呼び出す必要があります
      // 現在の実装では具体的なエクスポート関数がないため、コンソールにログを出力するだけにします
      console.log('エクスポート設定:', {
        resolution,
        fps: parseInt(fps, 10),
        codec,
        outputPath
      });
      
      // 待機時間をシミュレート
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('エクスポート完了');
    } catch (error) {
      console.error('エクスポートエラー:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="panel full-panel export-settings-panel">
      <div className="panel-header">
        <h2>書き出し設定</h2>
        {onClose && (
          <button onClick={onClose} className="close-btn">
            ✕
          </button>
        )}
      </div>
      <div className="panel-content">
        <div className="settings-grid">
          <div className="setting-group">
            <label htmlFor="resolution">解像度</label>
            <select
              id="resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              disabled={isExporting}
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              <option value="2k">2K</option>
              <option value="4k">4K</option>
            </select>
          </div>
          
          <div className="setting-group">
            <label htmlFor="fps">フレームレート</label>
            <select
              id="fps"
              value={fps}
              onChange={(e) => setFps(e.target.value)}
              disabled={isExporting}
            >
              <option value="24">24fps</option>
              <option value="30">30fps</option>
              <option value="60">60fps</option>
            </select>
          </div>
          
          <div className="setting-group">
            <label htmlFor="codec">コーデック</label>
            <select
              id="codec"
              value={codec}
              onChange={(e) => setCodec(e.target.value)}
              disabled={isExporting}
            >
              <option value="h264">H.264</option>
              <option value="h265">H.265 (HEVC)</option>
              <option value="prores_hq">ProRes HQ</option>
            </select>
          </div>
          
          <div className="setting-group">
            <button
              onClick={handleSelectOutputPath}
              disabled={isExporting}
              className="output-btn"
            >
              出力先を選択
            </button>
            {outputPath && (
              <div className="output-path">
                出力先: {outputPath}
              </div>
            )}
            <button
              onClick={handleExport}
              disabled={isExporting || !outputPath}
              className="export-btn"
            >
              {isExporting ? '書き出し中...' : '書き出し'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportSettings; 