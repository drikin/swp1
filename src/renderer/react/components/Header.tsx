import React from 'react';
import { AppBar, Toolbar, Typography, Button, Box, useTheme } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PublishIcon from '@mui/icons-material/Publish';

interface HeaderProps {
  onAddFiles: () => void;
  onToggleExport: () => void;
}

// ヘッダーコンポーネント
const Header: React.FC<HeaderProps> = ({ onAddFiles, onToggleExport }) => {
  const theme = useTheme();
  
  return (
    <AppBar 
      position="static" 
      color="default" 
      elevation={0}
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        zIndex: theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar variant="dense" sx={{ minHeight: '48px', px: 2 }}>
        <Typography variant="h6" component="h1" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
          Super Watarec
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button 
            size="small"
            variant="contained" 
            color="primary" 
            onClick={onAddFiles}
            startIcon={<AddIcon />}
          >
            素材を追加
          </Button>
          <Button 
            size="small"
            variant="contained" 
            color="secondary" 
            onClick={onToggleExport}
            startIcon={<PublishIcon />}
          >
            書き出し設定
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;