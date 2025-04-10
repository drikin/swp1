import { useState, useEffect, RefObject } from 'react';

/**
 * ファイルドラッグ＆ドロップを管理するカスタムフック
 * 
 * @param containerRef ドラッグ＆ドロップを検知するコンテナ要素への参照
 * @param onDropFiles ファイルがドロップされた時に呼び出すコールバック関数
 * @returns 現在のドラッグ状態
 */
export const useFileDragDrop = (
  containerRef: RefObject<HTMLElement>,
  onDropFiles: (filePaths: string[]) => void
) => {
  // ドラッグ状態
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /**
     * ドラッグオーバー時の処理
     */
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      // すでにドラッグ中ならスキップ
      if (isDragging) return;
      
      // ファイルがドラッグされているか確認
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    /**
     * ドラッグリーブ時の処理
     */
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      // ドラッグカーソルがコンテナの外に出た場合のみリセット
      if (e.relatedTarget === null || !container.contains(e.relatedTarget as Node)) {
        setIsDragging(false);
      }
    };

    /**
     * ドロップ時の処理
     */
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      
      // ファイルがドロップされた場合
      if (e.dataTransfer?.files?.length) {
        const files = e.dataTransfer.files;
        const filePaths: string[] = [];
        
        // FileSystemFileEntryを取得できる場合
        if (e.dataTransfer.items) {
          for (let i = 0; i < e.dataTransfer.items.length; i++) {
            const item = e.dataTransfer.items[i];
            if (item.kind === 'file') {
              const file = item.getAsFile();
              if (file && 'path' in file) {
                // Electron環境ではファイルパスが取得できる
                filePaths.push((file as any).path);
              }
            }
          }
        }
        
        if (filePaths.length) {
          onDropFiles(filePaths);
        }
      }
    };

    // イベントリスナーを登録
    container.addEventListener('dragover', handleDragOver as EventListener);
    container.addEventListener('dragleave', handleDragLeave as EventListener);
    container.addEventListener('drop', handleDrop as EventListener);

    // クリーンアップ関数
    return () => {
      container.removeEventListener('dragover', handleDragOver as EventListener);
      container.removeEventListener('dragleave', handleDragLeave as EventListener);
      container.removeEventListener('drop', handleDrop as EventListener);
    };
  }, [containerRef, isDragging, onDropFiles]);

  return isDragging;
};

export default useFileDragDrop;
