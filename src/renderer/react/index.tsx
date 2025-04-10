import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, CssBaseline } from '@mui/material';
import App from './components/App';
import { AppProvider } from './contexts/AppContext';
import theme from './theme';
import './styles.css';

// レンダリングのエントリーポイント
document.addEventListener('DOMContentLoaded', () => {
  const rootElement = document.getElementById('react-root');
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppProvider>
          <App />
        </AppProvider>
      </ThemeProvider>
    );
  }
});