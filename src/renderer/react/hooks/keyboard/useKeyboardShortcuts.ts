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
          const player = videoPlayerRef.current;
          if (!player) break;
          
          if (!player.isPlaying) {
            // 停止時は等速で逆再生
            player.changePlaybackRate(-1);
            player.togglePlayback();
          } else {
            const currentRate = player.playbackRate;
            if (currentRate > 0) {
              // 順方向再生中は速度を半分に
              const newRate = currentRate / 2;
              if (newRate < 0.25) {
                // 一定以下になったら逆方向に切り替え
                player.changePlaybackRate(-1);
              } else {
                player.changePlaybackRate(newRate);
              }
            } else {
              // 逆方向再生中は速度を2倍に
              const newRate = currentRate * 2;
              if (newRate < -2) {
                // 一定以上になったら順方向に切り替え
                player.changePlaybackRate(1);
              } else {
                player.changePlaybackRate(newRate);
              }
            }
          }
          break;
        case 'l':
          e.preventDefault();
          // 再生速度を速める
          const activePlayer = videoPlayerRef.current;
          if (!activePlayer) break;
          
          if (!activePlayer.isPlaying) {
            // 停止時は等速で順再生
            activePlayer.changePlaybackRate(1);
            activePlayer.togglePlayback();
          } else {
            const currentRate = activePlayer.playbackRate;
            if (currentRate < 0) {
              // 逆方向再生中は速度を半分に
              const newRate = currentRate / 2;
              if (newRate > -0.25) {
                // 一定以下になったら順方向に切り替え
                activePlayer.changePlaybackRate(1);
              } else {
                activePlayer.changePlaybackRate(newRate);
              }
            } else {
              // 順方向再生中は速度を2倍に
              const newRate = currentRate * 2;
              if (newRate > 2) {
                // 上限は2倍まで
                activePlayer.changePlaybackRate(2);
              } else {
                activePlayer.changePlaybackRate(newRate);
              }
            }
          }
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
