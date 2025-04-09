/**
 * 波形データ管理フック（コンテキストベース）
 */
import { useWaveform as useWaveformContext } from '../contexts/WaveformContext';
import { WaveformContextValue } from '../types/media';

/**
 * 波形データ管理のためのカスタムフック
 * コンテキストを使用した実装
 */
export const useWaveform = (): WaveformContextValue => {
  const waveformContext = useWaveformContext();
  
  // コンテキストからすべての機能を提供
  return {
    ...waveformContext
  };
};
