import React, { ReactNode } from 'react';
import { TaskProvider } from './TaskContext';
import { MediaProvider } from './MediaContext';
import { WaveformProvider } from './WaveformContext';
import { ThumbnailProvider } from './ThumbnailContext';

/**
 * アプリケーション全体のコンテキストプロバイダー
 * すべてのコンテキストを階層的に提供します
 */
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <TaskProvider>
      <WaveformProvider>
        <ThumbnailProvider>
          <MediaProvider>
            {children}
          </MediaProvider>
        </ThumbnailProvider>
      </WaveformProvider>
    </TaskProvider>
  );
};

/**
 * コンテキストの全エクスポート
 * 使いやすいようにすべてのコンテキストフックをまとめてエクスポート
 */
export { useTasks } from './TaskContext';
export { useMedia } from './MediaContext';
export { useWaveform } from './WaveformContext';
export { useThumbnail } from './ThumbnailContext';
