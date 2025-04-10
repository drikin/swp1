import { useEffect, RefObject } from 'react';
import { VideoPlayerRef } from '../../components/VideoPlayer';

/**
 * キーボードショートカットを管理するカスタムフック
 * 
 * @param videoPlayerRef ビデオプレーヤーへの参照
 * @returns void
 */
export const useKeyboardShortcuts = (videoPlayerRef: RefObject<VideoPlayerRef>) => {
  useEffect(() => {
    /**
     * 再生速度を変更する共通関数
     * @param direction 1:順再生/-1:逆再生
     */
    const handlePlaybackRateChange = (direction: number) => {
      const player = videoPlayerRef.current;
      if (!player) return;
      
      if (!player.isPlaying) {
        // 停止時は等速で指定方向に再生
        player.changePlaybackRate(direction);
        player.togglePlayback();
        return;
      }
      
      const currentRate = player.playbackRate;
      const isReverse = currentRate < 0;
      
      // 現在の方向と指定方向が逆の場合
      if ((isReverse && direction > 0) || (!isReverse && direction < 0)) {
        // 速度を半分にする
        const newRate = currentRate / 2;
        const minThreshold = direction > 0 ? -0.25 : 0.25;
        
        // 閾値以下なら方向を反転
        if (Math.abs(newRate) < Math.abs(minThreshold)) {
          player.changePlaybackRate(direction);
        } else {
          player.changePlaybackRate(newRate);
        }
      } else {
        // 同じ方向なら速度を2倍にする
        const newRate = currentRate * 2;
        const maxThreshold = direction > 0 ? 2 : -2;
        
        // 閾値を超えたら上限に設定
        if (Math.abs(newRate) > Math.abs(maxThreshold)) {
          player.changePlaybackRate(maxThreshold);
        } else {
          player.changePlaybackRate(newRate);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // フォーム要素にフォーカスがある場合はショートカットを無視
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault(); // スクロールを防止
          videoPlayerRef.current?.togglePlayback();
          break;
        case 'k':
          videoPlayerRef.current?.stopPlayback();
          break;
        case 'j':
          e.preventDefault();
          handlePlaybackRateChange(-1); // 逆再生方向
          break;
        case 'l':
          e.preventDefault();
          handlePlaybackRateChange(1);  // 順再生方向
          break;
      }
    };

    // キーボードショートカットのイベントリスナーを登録
    window.addEventListener('keydown', handleKeyDown);

    // クリーンアップ関数
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [videoPlayerRef]);
};

export default useKeyboardShortcuts;
