// 時間を HH:MM:SS 形式にフォーマットする関数
export const formatDuration = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) {
    return '00:00:00'; // ミリ秒なしのデフォルト値
  }

  // 秒数を整数に丸める（ミリ秒は不要）
  const totalSeconds = Math.round(seconds);
  const sec = String(totalSeconds % 60).padStart(2, '0');
  const totalMinutes = Math.floor(totalSeconds / 60);
  const min = String(totalMinutes % 60).padStart(2, '0');
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');

  return `${hours}:${min}:${sec}`; // ミリ秒部分を削除
};
