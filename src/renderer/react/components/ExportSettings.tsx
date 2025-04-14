import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  FormHelperText,
  InputLabel,
  LinearProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  Alert,
  IconButton,
  useTheme
} from '@mui/material';
import { Close, FolderOpen, Send } from '@mui/icons-material';

interface ExportSettingsProps {
  onClose?: () => void;
  mediaFiles?: any[];
}

// 書き出し設定コンポーネント
const ExportSettings: React.FC<ExportSettingsProps> = ({ onClose, mediaFiles = [] }) => {
  const theme = useTheme();
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
  const [progressDetails, setProgressDetails] = useState<{
    phase: string;
    phaseName: string;
    message: string;
    currentStep?: number;
    totalSteps?: number;
    currentTime?: string;
    totalDuration?: string;
    fileName?: string;
  } | null>(null);

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
      stage?: 'converting' | 'combining';
      phase?: string;
      phaseName?: string;
      message?: string;
      currentStep?: number;
      totalSteps?: number;
      currentTime?: string;
      totalDuration?: string;
      fileName?: string;
      currentFile?: number;
      totalFiles?: number;
      overallProgress?: number;
    }) => {
      // 基本的な進捗情報の更新
      setProgress(data.percentage || data.overallProgress || 0);
      
      if (data.stage) {
        setStage(data.stage);
      }
      
      if (data.current !== undefined && data.total !== undefined) {
        setProcessedFiles(data.current);
        setTotalFiles(data.total);
      } else if (data.currentFile !== undefined && data.totalFiles !== undefined) {
        setProcessedFiles(data.currentFile);
        setTotalFiles(data.totalFiles);
      }
      
      // 詳細な進捗情報の更新
      setProgressDetails({
        phase: data.phase || '',
        phaseName: data.phaseName || '',
        message: data.message || '',
        currentStep: data.currentStep,
        totalSteps: data.totalSteps,
        currentTime: data.currentTime,
        totalDuration: data.totalDuration,
        fileName: data.fileName
      });
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

  // 進捗状況のテキスト
  const getProgressText = () => {
    // 詳細な進捗情報があればそれを優先して表示
    if (progressDetails) {
      if (progressDetails.message) {
        return progressDetails.message;
      }
      
      if (progressDetails.phaseName) {
        let text = progressDetails.phaseName;
        
        // ステップ情報があれば追加
        if (progressDetails.currentStep && progressDetails.totalSteps) {
          text += ` (ステップ ${progressDetails.currentStep}/${progressDetails.totalSteps})`;
        }
        
        // ファイル名があれば追加
        if (progressDetails.fileName) {
          text += ` - ${progressDetails.fileName}`;
        }
        
        // 時間情報があれば追加
        if (progressDetails.currentTime && progressDetails.totalDuration) {
          text += ` - ${progressDetails.currentTime}/${progressDetails.totalDuration}`;
        }
        
        return text;
      }
    }
    
    // 従来の表示方法（フォールバック）
    if (stage === 'converting') {
      return `素材変換中 (${processedFiles}/${totalFiles})`;
    } else if (stage === 'combining') {
      return '動画結合中...';
    }
    return 'エクスポート中...';
  };

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

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        bgcolor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <Paper
        elevation={3}
        sx={{
          width: '90%',
          maxWidth: 800,
          maxHeight: '90vh',
          overflow: 'auto',
          p: 3,
          borderRadius: 2,
          position: 'relative',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5" component="h2" gutterBottom sx={{ fontWeight: 'bold' }}>
            書き出し設定
          </Typography>
          
          <IconButton onClick={onClose} disabled={isExporting} aria-label="閉じる">
            <Close />
          </IconButton>
        </Box>
        
        <Divider sx={{ mb: 3 }} />
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* メディアファイル情報 */}
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'medium' }}>
              対象ファイル ({mediaFiles.length}件)
            </Typography>
            
            {mediaFiles.length === 0 ? (
              <Alert severity="warning" sx={{ mb: 2 }}>
                選択されたメディアファイルがありません
              </Alert>
            ) : (
              <Paper variant="outlined" sx={{ p: 1, mb: 2 }}>
                <List dense sx={{ maxHeight: 150, overflow: 'auto' }}>
                  {mediaFiles.slice(0, 5).map((file, index) => (
                    <ListItem key={file.id || index} dense>
                      <ListItemText primary={file.name} />
                    </ListItem>
                  ))}
                  {mediaFiles.length > 5 && (
                    <ListItem dense>
                      <ListItemText secondary={`...他 ${mediaFiles.length - 5} ファイル`} />
                    </ListItem>
                  )}
                </List>
              </Paper>
            )}
          </Box>
          
          {/* 解像度とフレームレート設定 */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
            {/* 解像度設定 */}
            <Box sx={{ flex: 1 }}>
              <FormControl fullWidth>
                <InputLabel id="resolution-label">解像度</InputLabel>
                <Select
                  labelId="resolution-label"
                  id="resolution"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  disabled={isExporting}
                  label="解像度"
                  size="small"
                >
                  <MenuItem value="720p">720p</MenuItem>
                  <MenuItem value="1080p">1080p</MenuItem>
                  <MenuItem value="2k">2K</MenuItem>
                  <MenuItem value="4k">4K</MenuItem>
                </Select>
              </FormControl>
            </Box>
            
            {/* フレームレート設定 */}
            <Box sx={{ flex: 1 }}>
              <FormControl fullWidth>
                <InputLabel id="fps-label">フレームレート</InputLabel>
                <Select
                  labelId="fps-label"
                  id="fps"
                  value={fps}
                  onChange={(e) => setFps(e.target.value)}
                  disabled={isExporting}
                  label="フレームレート"
                  size="small"
                >
                  <MenuItem value="24">24fps</MenuItem>
                  <MenuItem value="30">30fps</MenuItem>
                  <MenuItem value="60">60fps</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
          
          {/* コーデック設定 */}
          <Box>
            <FormControl fullWidth>
              <InputLabel id="codec-label">コーデック</InputLabel>
              <Select
                labelId="codec-label"
                id="codec"
                value={codec}
                onChange={(e) => setCodec(e.target.value)}
                disabled={isExporting}
                label="コーデック"
                size="small"
              >
                <MenuItem value="h264">H.264 (HW アクセラレーション)</MenuItem>
                <MenuItem value="h265">H.265/HEVC (HW アクセラレーション)</MenuItem>
                <MenuItem value="prores_hq">ProRes HQ</MenuItem>
              </Select>
              <FormHelperText>
                Appleシリコン向けハードウェアエンコードを使用して高速処理
              </FormHelperText>
            </FormControl>
          </Box>
          
          {/* フォーマットと出力先設定 */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
            {/* フォーマット設定 */}
            <Box sx={{ flex: 1 }}>
              <FormControl fullWidth>
                <InputLabel id="format-label">フォーマット</InputLabel>
                <Select
                  labelId="format-label"
                  id="format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  disabled={isExporting}
                  label="フォーマット"
                  size="small"
                >
                  <MenuItem value="mp4">MP4</MenuItem>
                  <MenuItem value="mov">MOV</MenuItem>
                  <MenuItem value="mkv">MKV</MenuItem>
                </Select>
              </FormControl>
            </Box>
            
            {/* 出力先設定 */}
            <Box sx={{ flex: 1 }}>
              <Button
                variant="outlined"
                startIcon={<FolderOpen />}
                onClick={handleSelectOutputPath}
                disabled={isExporting}
                fullWidth
                sx={{ height: '40px' }}
              >
                出力先を選択
              </Button>
            </Box>
          </Box>
          
          {/* 出力パス表示 */}
          {outputPath && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                出力先: {outputPath}
              </Typography>
            </Box>
          )}
          
          {/* エラーメッセージ */}
          {error && (
            <Box>
              <Alert severity="error">{error}</Alert>
            </Box>
          )}
          
          {/* 進捗状況表示エリア */}
          {isExporting && (
            <Box className="export-progress">
              <Box className="progress-info">
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {getProgressText()}
                </Typography>
                {progressDetails?.currentStep && progressDetails?.totalSteps && (
                  <Typography variant="caption" display="block" sx={{ color: 'text.secondary', mb: 0.5 }}>
                    進行状況: ステップ {progressDetails.currentStep}/{progressDetails.totalSteps}
                  </Typography>
                )}
              </Box>
              
              <Box className="progress-bar-container" sx={{ 
                position: 'relative', 
                height: 20, 
                bgcolor: 'background.paper',
                borderRadius: 1,
                border: 1,
                borderColor: 'divider',
                mb: 2
              }}>
                <Box 
                  className="progress-bar" 
                  sx={{ 
                    width: `${progress}%`, 
                    height: '100%', 
                    bgcolor: 'primary.main',
                    borderRadius: 1,
                    transition: 'width 0.3s ease'
                  }}
                />
                <Typography 
                  variant="caption" 
                  sx={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%', 
                    transform: 'translate(-50%, -50%)',
                    color: 'text.primary'
                  }}
                >
                  {`${progress}%`}
                </Typography>
              </Box>
              
              {/* 詳細情報表示エリア */}
              {progressDetails && (
                <Box sx={{ 
                  p: 1, 
                  mb: 2, 
                  borderRadius: 1, 
                  bgcolor: 'action.hover',
                  fontSize: '0.75rem'
                }}>
                  <Typography variant="caption" display="block" sx={{ fontWeight: 'bold' }}>
                    現在の処理: {progressDetails.phaseName || progressDetails.phase || '処理中'}
                  </Typography>
                  
                  {progressDetails.fileName && (
                    <Typography variant="caption" display="block">
                      ファイル: {progressDetails.fileName}
                    </Typography>
                  )}
                  
                  {progressDetails.currentTime && progressDetails.totalDuration && (
                    <Typography variant="caption" display="block">
                      時間: {progressDetails.currentTime}/{progressDetails.totalDuration}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          )}
          
          {/* 成功メッセージ */}
          {exportResult && exportResult.success && (
            <Box>
              <Alert severity="success">
                エクスポート完了: {exportResult.outputPath}
              </Alert>
            </Box>
          )}
          
          {/* 書き出しボタン */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<Send />}
                onClick={handleExport}
                disabled={isExporting || !outputPath || mediaFiles.length === 0}
                size="large"
              >
                {isExporting ? '書き出し中...' : '書き出し'}
              </Button>
            </Box>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default ExportSettings;