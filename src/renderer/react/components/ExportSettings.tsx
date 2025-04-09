import React, { useState, useEffect } from 'react';

interface ExportSettingsProps {
  onClose?: () => void;
  mediaFiles?: any[];
}

// 書き出し設定コンポーネント
const ExportSettings: React.FC<ExportSettingsProps> = ({ onClose, mediaFiles = [] }) => {
  const [resolution, setResolution] = useState('1080p');
  const [fps, setFps] = useState('30');
  const [codec, setCodec] = useState('h265');
  const [format, setFormat] = useState('mp4');
  const [isExporting, setIsExporting] = useState(false);
  const [outputPath, setOutputPath] = useState('');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<'idle' | 'converting' | 'combining'>('idle');
  const [processedFiles, setProcessedFiles] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<{ success: boolean; outputPath?: string } | null>(null);

  // 初期化時にデスクトップパスを設定
  useEffect(() => {
    const initOutputPath = async () => {
      if (window.api) {
        try {
          // デスクトップパスを取得
          const desktopPath = await window.api.getDesktopPath();
          if (desktopPath) {
            setOutputPath(desktopPath);
          }
        } catch (error) {
          console.error('デスクトップパス取得エラー:', error);
        }
      }
    };
    
    initOutputPath();
  }, []);

  // 進捗イベントのリスナー
  useEffect(() => {
    const handleExportProgress = (data: {
      current: number;
      total: number;
      percentage: number;
      stage: 'converting' | 'combining';
    }) => {
      setProgress(data.percentage);
      setStage(data.stage);
      setProcessedFiles(data.current);
      setTotalFiles(data.total);
    };

    if (window.api) {
      // 直接イベントリスナーを登録
      window.api.on('export-progress', handleExportProgress);
    }

    return () => {
      if (window.api) {
        // イベントリスナーの削除
        window.api.off('export-progress', handleExportProgress);
      }
    };
  }, []);

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
    if (mediaFiles.length === 0) {
      setError('エクスポートするメディアファイルがありません');
      return;
    }
    
    try {
      setIsExporting(true);
      setError(null);
      setProgress(0);
      setExportResult(null);
      setStage('converting');
      setProcessedFiles(0);
      setTotalFiles(mediaFiles.length);
      
      // 実際のエクスポート処理を呼び出す
      const result = await window.api.exportCombinedVideo({
        mediaFiles,
        outputPath,
        settings: {
          resolution,
          fps,
          codec,
          format
        }
      });
      
      if (result.success) {
        setExportResult(result);
        setProgress(100);
        setStage('idle');
      } else {
        setError(result.error || 'エクスポートに失敗しました');
        setStage('idle');
      }
    } catch (error: any) {
      console.error('エクスポートエラー:', error);
      setError(error.message || 'エクスポート中にエラーが発生しました');
      setStage('idle');
    } finally {
      setIsExporting(false);
    }
  };

  // 進捗状況のテキスト
  const getProgressText = () => {
    if (stage === 'converting') {
      return `素材変換中 (${processedFiles}/${totalFiles})`;
    } else if (stage === 'combining') {
      return '動画結合中...';
    }
    return 'エクスポート中...';
  };

  return (
    <div className="panel full-panel export-settings-panel">
      <div className="panel-header">
        <h2>書き出し設定</h2>
        {onClose && !isExporting && (
          <button onClick={onClose} className="close-btn">
            ✕
          </button>
        )}
      </div>
      <div className="panel-content">
        <div className="settings-grid">
          <div className="setting-info">
            <p>エクスポート対象: {mediaFiles.length} ファイル</p>
            {mediaFiles.length > 0 && (
              <ul className="media-list-export">
                {mediaFiles.slice(0, 5).map((file, index) => (
                  <li key={file.id || index}>{file.name}</li>
                ))}
                {mediaFiles.length > 5 && <li>...他 {mediaFiles.length - 5} ファイル</li>}
              </ul>
            )}
          </div>
          
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
              <option value="h264">H.264 (HW アクセラレーション)</option>
              <option value="h265">H.265/HEVC (HW アクセラレーション)</option>
              <option value="prores_hq">ProRes HQ</option>
            </select>
            <div className="codec-info">
              Appleシリコン向けハードウェアエンコードを使用して高速処理
            </div>
          </div>
          
          <div className="setting-group">
            <label htmlFor="format">フォーマット</label>
            <select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              disabled={isExporting}
            >
              <option value="mp4">MP4</option>
              <option value="mov">MOV</option>
              <option value="mkv">MKV</option>
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
            
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}
            
            {isExporting && (
              <div className="export-progress">
                <div className="progress-info">
                  {getProgressText()}
                </div>
                <div className="progress-bar-container">
                  <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                  <span>{progress}%</span>
                </div>
              </div>
            )}
            
            {exportResult && exportResult.success && (
              <div className="success-message">
                エクスポート完了: {exportResult.outputPath}
              </div>
            )}
            
            <button
              onClick={handleExport}
              disabled={isExporting || !outputPath || mediaFiles.length === 0}
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