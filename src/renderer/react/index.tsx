import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';
import './styles.css';

// レンダリングのエントリーポイント
document.addEventListener('DOMContentLoaded', () => {
  const rootElement = document.getElementById('react-root');
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<App />);
  }
}); 