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
     * フォルダーを再帰的に処理してメディアファイルを取得する
     * @param folderPath 処理するフォルダーのパス
     * @returns 処理結果を通知するPromise
     */
    const processFolder = async (folderPath: string): Promise<string[]> => {
      try {
        // メインプロセスにフォルダー内のメディアファイルを再帰的に検索するよう要求
        const mediaFiles = await window.api.invoke('scan-folder-for-media', folderPath);
        return mediaFiles;
      } catch (error) {
        console.error('フォルダー処理エラー:', error);
        return [];
      }
    };

    /**
     * ドロップ時の処理
     */
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      
      // ファイルがドロップされた場合
      if (e.dataTransfer?.files?.length) {
        const files = e.dataTransfer.files;
        let filePaths: string[] = [];
        
        // FileSystemFileEntryを取得できる場合
        if (e.dataTransfer.items) {
          const processPromises: Promise<string[]>[] = [];
          
          for (let i = 0; i < e.dataTransfer.items.length; i++) {
            const item = e.dataTransfer.items[i];
            if (item.kind === 'file') {
              const file = item.getAsFile();
              if (file && 'path' in file) {
                const path = (file as any).path;
                
                // フォルダーかファイルかを判断
                try {
                  const stats = await window.api.invoke('get-path-stats', path);
                  
                  if (stats.isDirectory) {
                    // フォルダーの場合は再帰的に処理
                    processPromises.push(processFolder(path));
                  } else {
                    // 通常のファイルの場合はそのまま追加
                    filePaths.push(path);
                  }
                } catch (error) {
                  console.error('パス解析エラー:', error);
                  // エラーが発生してもファイルとして扱おうとする
                  filePaths.push(path);
                }
              }
            }
          }
          
          // すべてのフォルダー処理が完了するのを待つ
          if (processPromises.length > 0) {
            try {
              const folderResults = await Promise.all(processPromises);
              // フォルダーから取得したファイルを結合
              for (const result of folderResults) {
                filePaths = [...filePaths, ...result];
              }
            } catch (error) {
              console.error('フォルダー処理中にエラーが発生しました:', error);
            }
          }
        }
        
        if (filePaths.length) {
          // 重複を除去して渡す
          onDropFiles([...new Set(filePaths)]);
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
