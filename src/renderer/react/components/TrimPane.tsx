import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Box, Typography, CircularProgress } from '@mui/material';
import type { MediaFile } from '../types';

interface TrimPaneProps {
  selectedMedia: MediaFile | null;
  currentTime: number;
  onUpdateTrimPoints: (mediaId: string, trimStart: number | null, trimEnd: number | null) => void;
  onSeek: (time: number) => void; // Add onSeek prop for seeking
}

// --- Helper: Canvas Drawing Function ---
const drawCanvas = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  duration: number | undefined,
  waveformData: number[] | null,
  inPoint: number | null,
  outPoint: number | null,
  currentTime: number
) => {
  console.log('drawCanvas呼び出し:', {
    canvasSize: `${width}x${height}`,
    duration,
    dataPoints: waveformData?.length || 0,
    firstFewPoints: waveformData?.slice(0, 5) || []
  });

  // キャンバスをクリア
  ctx.clearRect(0, 0, width, height);

  // キャンバスの背景色をデフォルトで設定
  ctx.fillStyle = '#333333';
  ctx.fillRect(0, 0, width, height);
  
  // 必要なデータがない場合はダミーの波形を表示
  if (!waveformData || waveformData.length === 0) {
    console.log('波形データがありません。ダミー波形を表示します');
    
    // ダミーデータを作成
    const dummyPoints = 50;
    const dummyData = [];
    for (let i = 0; i < dummyPoints; i++) {
      dummyData.push(Math.sin(i / dummyPoints * Math.PI * 2) * 0.3 + 0.5);
    }
    
    // ダミーの波形を描画（灰色で）
    const barWidth = width / dummyPoints;
    const centerY = height / 2;
    ctx.fillStyle = '#666666';  // グレーでダミーデータを表示
    
    for (let i = 0; i <dummyPoints; i++) {
      const x = i * barWidth;
      const value = dummyData[i];
      const barHeight = Math.max(2, value * height * 0.6);
      ctx.fillRect(x, centerY - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
    }
    
    // テキスト表示
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('波形データを読み込み中...', width / 2, height / 2 + 30);
    return;
  }

  if (!duration || duration <= 0) {
    console.log('動画の長さがありません。標準の波形のみ表示します。', { duration });
    // 継続して波形を描画（durationなしでも波形だけは表示）
  } else {
    console.log(`波形を描画します: ${waveformData.length}ポイント, 幅=${width}, 高さ=${height}, 長さ: ${duration?.toFixed(2)}秒, 現在位置: ${currentTime}秒`, 
      waveformData.slice(0, 5));
  }

  try {
    // キャンバスの背景色
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, width, height);
    
    // --- 1. Waveform ---
    const barWidth = width / waveformData.length;
    const centerY = height / 2;
    ctx.fillStyle = '#4fc3f7';  // より明るい青に変更
    
    // maxValueが0の場合のフォールバック値を設定
    const maxValue = Math.max(...waveformData.map(v => Math.abs(v)), 0.1);
    console.log(`波形描画パラメータ: barWidth=${barWidth.toFixed(2)}, maxValue=${maxValue.toFixed(2)}`);
    
    // スケーリングファクター（高さの70%を使用）
    const scaleFactor = (height * 0.7) / maxValue; 
    
    // 各データポイントごとに棒グラフを描画
    for (let i = 0; i < waveformData.length; i++) {
      const x = i * barWidth;
      const value = waveformData[i];
      // 値の検証
      if (typeof value !== 'number' || isNaN(value)) {
        console.warn(`無効な波形データ: index=${i}, value=${value}`);
        continue;
      }
      
      const barHeight = Math.max(2, value * scaleFactor); // 最小高さ2ピクセル
      
      // 中央から上下に拡張する波形を描画
      ctx.fillRect(x, centerY - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
    }
    
    // --- 2. 時間マーカーの描画関数 ---
    const timeToX = (time: number): number => {
      if (!duration || duration <= 0) return 0;
      return Math.max(0, Math.min(width, (time / duration) * width));
    };

    // 編集ポイントの表示
    const inX = typeof inPoint === 'number' ? timeToX(inPoint) : -1;
    const outX = typeof outPoint === 'number' ? timeToX(outPoint) : -1;

    // 選択範囲外を暗くする
    if (inX !== -1 && outX !== -1 && inX < outX) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, inX, height);
      ctx.fillRect(outX, 0, width - outX, height);
    }

    // IN点マーカー
    if (inX !== -1) {
      ctx.fillStyle = 'rgba(76, 175, 80, 0.9)';  // より鮮明な緑
      ctx.fillRect(inX - 2, 0, 4, height);
    }

    // OUT点マーカー
    if (outX !== -1) {
      ctx.fillStyle = 'rgba(244, 67, 54, 0.9)';  // より鮮明な赤
      ctx.fillRect(outX - 2, 0, 4, height);
    }

    // --- 3. 現在位置インジケータ ---
    if (currentTime >= 0) {
      const currentX = timeToX(currentTime);
      ctx.strokeStyle = '#ffeb3b';  // 明るい黄色
      ctx.lineWidth = 3;  // 太さを増加
      ctx.beginPath();
      ctx.moveTo(currentX, 0);
      ctx.lineTo(currentX, height);
      ctx.stroke();
    }
    
    console.log('波形の描画が完了しました');
  } catch (error) {
    console.error('波形描画中にエラーが発生しました:', error);
  }
};

// APIレスポンスの型定義
interface TaskStatusResponse {
  id: string;
  status: "error" | "pending" | "processing" | "completed" | "cancelled";
  progress: number;
  type: string;
  task?: {
    status: "error" | "pending" | "processing" | "completed" | "cancelled";
    progress: number;
  };
}

interface WaveformDataResponse {
  success?: boolean;
  data?: {
    waveform?: number[];
  } | number[];
  waveform?: number[];
  taskId?: string;
}

interface TaskIdByMediaPathResponse {
  success?: boolean;
  taskId?: string;
}

// APIからのnullableな結果を型安全に処理するための型
type TaskIdResponse = TaskIdByMediaPathResponse | string | null;

interface GenerateWaveformResponse {
  success: boolean;
  taskId?: string;
}

const TrimPane: React.FC<TrimPaneProps> = ({ 
  selectedMedia, 
  currentTime, 
  onUpdateTrimPoints,
  onSeek // Destructure onSeek prop
}) => {
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [waveformData, setWaveformData] = useState<number[] | null>(null);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchAttempts, setFetchAttempts] = useState(0);
  const [taskRequestId, setTaskRequestId] = useState<string | null>(null); // 既にリクエスト中のタスクIDを追跡
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const isInitialRender = useRef(true);

  // Refs to hold the latest values for the animation loop
  const latestProps = useRef({ selectedMedia, currentTime, inPoint, outPoint, waveformData });

  // 波形データを取得する関数 - 無限ループを防止するためにuseCallback内でtaskRequestIdを使用
  const fetchWaveformData = useCallback(async (taskId: string) => {
    // 既に同じタスクをリクエスト中なら重複リクエストを防止
    if (taskId === taskRequestId && isLoadingWaveform) {
      console.log(`既に同じタスク(${taskId})をリクエスト中のため、重複リクエストをスキップします`);
      return;
    }
    
    console.log(`波形データを取得します（タスクID: ${taskId}）`);
    setTaskRequestId(taskId);
    
    if (!window.api) {
      console.error('API が利用できません');
      setTaskRequestId(null);
      return;
    }

    try {
      // タスク状態の確認
      const taskStatusResponse = await window.api.getTaskStatus(taskId) as TaskStatusResponse;
      console.log(`タスク状態: ${JSON.stringify(taskStatusResponse)}`);
      
      // レスポンス構造の確認ログ
      console.log('タスク状態レスポンス構造:', typeof taskStatusResponse, Object.keys(taskStatusResponse));
      
      // task プロパティの有無をチェック
      const taskStatus = taskStatusResponse.task?.status || taskStatusResponse.status;
      console.log(`解析されたタスク状態: ${taskStatus}`);
      
      // タスクが完了していない場合は終了
      if (taskStatus !== 'completed') {
        console.log(`タスクはまだ完了していません (status: ${taskStatus})`);
        
        // タスクが処理中の場合は再試行をスケジュール
        if (taskStatus === 'processing' || taskStatus === 'pending') {
          setFetchAttempts(prevAttempts => {
            const newAttempts = prevAttempts + 1;
            
            // 最大5回まで再試行（回数を減らしました）
            if (newAttempts < 5) {
              console.log(`${newAttempts}回目の再試行をスケジュールします (3秒後)`);
              // タイムアウトIDを保存して必要に応じてクリアできるように
              const timeoutId = setTimeout(() => {
                console.log(`${newAttempts}回目の再試行を実行します`);
                fetchWaveformData(taskId);
              }, 3000); // 間隔を3秒に増やしました
              
              // コンポーネントのアンマウント時などにタイムアウトをクリア
              return newAttempts;
            } else {
              console.error('最大再試行回数に達しました');
              setError('波形データの取得がタイムアウトしました。');
              setIsLoadingWaveform(false);
              setTaskRequestId(null); // リクエスト状態をリセット
            }
            
            return newAttempts;
          });
        } else {
          // 処理中でもペンディングでもない場合（エラーなど）
          setIsLoadingWaveform(false);
          setTaskRequestId(null);
          setError(`タスクの状態が異常です: ${taskStatus}`);
        }
        
        return;
      }
      
      // このタスクの波形データを取得
      const waveformDataResponse = await window.api.getWaveformData(taskId) as WaveformDataResponse | null;
      console.log('波形データを取得しました:', waveformDataResponse ? 'データあり' : 'データなし');
      
      if (!waveformDataResponse) {
        console.error('波形データレスポンスがnullです');
        setError('波形データを取得できませんでした。');
        setIsLoadingWaveform(false);
        setTaskRequestId(null);
        return;
      }
      
      // レスポンスの詳細をログ出力
      console.log('波形データレスポンス完全構造:', JSON.stringify(waveformDataResponse, null, 2));
      
      // デバッグのため、すべてのプロパティを表示
      console.log('波形データレスポンスのプロパティ一覧:');
      if (waveformDataResponse) {
        for (const key of Object.keys(waveformDataResponse)) {
          const value = (waveformDataResponse as any)[key];
          console.log(`- ${key}: ${typeof value}`, 
            Array.isArray(value) 
              ? `(配列長: ${value.length})` 
              : value
          );
        }
      }
      
      // 波形データを抽出するユーティリティ関数
      const extractWaveformData = (response: any): number[] | null => {
        if (!response) return null;
        
        console.log('波形データ抽出開始:', typeof response);
        console.log('波形データ構造詳細:', JSON.stringify(response, null, 2));
        
        // 直接waveformプロパティを持つケース (最新の形式)
        if (Array.isArray(response.waveform)) {
          console.log(`直接waveformプロパティ形式のデータ抽出: ${response.waveform.length}ポイント`);
          return response.waveform;
        }
        
        // 成功レスポンスの標準形式
        if (response.success === true) {
          // response.data.data.waveform形式 (新しい形式)
          if (response.data && response.data.data && Array.isArray(response.data.data.waveform)) {
            console.log(`data.data.waveform形式のデータ抽出: ${response.data.data.waveform.length}ポイント`);
            return response.data.data.waveform;
          }
          
          // response.data.waveform形式
          if (response.data && response.data.waveform && Array.isArray(response.data.waveform)) {
            console.log(`data.waveform形式のデータ抽出: ${response.data.waveform.length}ポイント`);
            return response.data.waveform;
          }
        }
        
        // taskResult.data.data.waveform形式
        if (response.data && response.data.data && Array.isArray(response.data.data.waveform)) {
          console.log(`data.data.waveform形式のデータ抽出: ${response.data.data.waveform.length}ポイント`);
          return response.data.data.waveform;
        }
        
        // data.waveform 形式
        if (response.data && Array.isArray(response.data.waveform)) {
          console.log(`data.waveform 形式のデータ抽出: ${response.data.waveform.length}ポイント`);
          return response.data.waveform;
        }
        
        // data が直接配列
        if (response.data && Array.isArray(response.data)) {
          console.log(`data配列形式のデータ抽出: ${response.data.length}ポイント`);
          return response.data;
        }
        
        // waveform が直接プロパティ
        if (response.waveform && Array.isArray(response.waveform)) {
          console.log(`waveformプロパティ形式のデータ抽出: ${response.waveform.length}ポイント`);
          return response.waveform;
        }
        
        // success.data.waveform 形式
        if (response.success && response.data && Array.isArray(response.data.waveform)) {
          console.log(`success.data.waveform形式のデータ抽出: ${response.data.waveform.length}ポイント`);
          return response.data.waveform;
        }

        // 直接ファイルからJSON読み込み
        if (response.filePath) {
          console.log(`ファイルパス情報あり: ${response.filePath}`);
          // ファイルからの読み込みはElectronのメインプロセスでのみ可能なので、
          // この場合は別途APIで取得する必要があります
        }
        
        console.warn('波形データ抽出失敗: 該当する形式が見つかりません', response);
        return null;
      };
      
      // 波形データの抽出
      const extractedWaveform = extractWaveformData(waveformDataResponse);
      
      console.log('抽出された波形データ:', {
        isNull: extractedWaveform === null,
        length: extractedWaveform?.length || 0,
        sample: extractedWaveform?.slice(0, 5) || 'なし'
      });
      
      if (extractedWaveform && extractedWaveform.length > 0) {
        console.log(`抽出された波形データを設定します: ${extractedWaveform.length}ポイント`);
        setWaveformData(extractedWaveform);
        setIsLoadingWaveform(false);
        setTaskRequestId(null);
        setError(null);
        return;
      }
      
      // ここまで来たら抽出失敗
      console.error('有効な波形データが見つかりませんでした');
      setError('波形データの形式が無効です。');
      setIsLoadingWaveform(false);
      setTaskRequestId(null);
    } catch (error) {
      console.error('波形データ取得エラー:', error);
      setError(`波形データの取得中にエラーが発生しました: ${(error as Error).message || '不明なエラー'}`);
      setIsLoadingWaveform(false);
      setTaskRequestId(null);
    }
  }, [isLoadingWaveform, taskRequestId]); // isLoadingWaveformとtaskRequestIdに依存

  // 波形データ生成関数
  const generateWaveform = async (filePath: string) => {
    console.log(`波形データの生成を開始します: ${filePath}`);
    
    try {
      setIsLoadingWaveform(true);
      
      // 波形生成APIの呼び出し
      console.log('波形生成APIを呼び出します');
      const response = await window.api.generateWaveform(filePath) as GenerateWaveformResponse;
      console.log('波形生成APIの応答:', response);
      
      if (response && typeof response === 'object' && 
          'success' in response && response.success === true && 
          'taskId' in response && response.taskId) {
        const taskId = response.taskId;
        console.log(`新しい波形タスクID: ${taskId}`);
        fetchWaveformData(taskId);
      } else {
        console.error('波形タスク作成に失敗:', response);
        setError('波形データの生成に失敗しました。');
        setIsLoadingWaveform(false);
        return;
      }
    } catch (error) {
      console.error('波形データ生成エラー:', error);
      setError('波形データの生成中にエラーが発生しました。');
      setIsLoadingWaveform(false);
    }
  };

  useEffect(() => {
    latestProps.current = { selectedMedia, currentTime, inPoint, outPoint, waveformData };
  }, [selectedMedia, currentTime, inPoint, outPoint, waveformData]);

  // Canvas初期化と波形描画のための専用Effect
  useEffect(() => {
    console.log('キャンバス初期化Effect実行');
    const canvas = waveformCanvasRef.current;
    if (!canvas) {
      console.warn('キャンバス要素が見つかりません');
      return;
    }

    // キャンバスのサイズを設定
    const resizeCanvas = () => {
      if (!canvas) return;
      
      const parent = canvas.parentElement;
      if (!parent) {
        console.warn('キャンバスの親要素が見つかりません');
        return;
      }

      // 親要素のサイズを取得
      const displayWidth = parent.clientWidth || 300;
      const displayHeight = parent.clientHeight || 100;
      
      console.log(`キャンバスサイズ設定: ${displayWidth}x${displayHeight}`);
      
      // キャンバスのサイズを設定
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      
      // 描画を実行
      redrawCanvas();
    };

    // 波形データを実際に描画する関数
    const redrawCanvas = () => {
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('2Dコンテキストを取得できません');
        return;
      }
      
      console.log('波形再描画を実行します', {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        hasWaveformData: !!waveformData,
        waveformDataLength: waveformData?.length || 0,
        duration: selectedMedia?.duration
      });
      
      drawCanvas(
        ctx,
        canvas.width,
        canvas.height,
        selectedMedia?.duration,
        waveformData,
        inPoint,
        outPoint,
        currentTime
      );
    };

    // 初期化時とリサイズ時に実行
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // クリーンアップ関数
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [selectedMedia]); // selectedMediaだけに依存

  // 波形データや表示関連の状態が変わったときに再描画するEffect
  useEffect(() => {
    console.log('波形データ更新Effect実行:', {
      hasWaveformData: !!waveformData,
      dataLength: waveformData?.length || 0,
      currentTime,
      isLoading: isLoadingWaveform,
      selectedMedia: selectedMedia ? {
        id: selectedMedia.id,
        duration: selectedMedia.duration,
        path: selectedMedia.path
      } : null
    });
    
    const canvas = waveformCanvasRef.current;
    if (!canvas) {
      console.warn('再描画: キャンバス要素が見つかりません');
      return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('再描画: 2Dコンテキストを取得できません');
      return;
    }
    
    // 波形データがあり、ローディング中でなければ描画
    if (waveformData && waveformData.length > 0 && !isLoadingWaveform) {
      console.log(`波形データが利用可能なため描画を実行: ${waveformData.length}ポイント`, waveformData.slice(0, 5));
      drawCanvas(
        ctx,
        canvas.width, 
        canvas.height,
        selectedMedia?.duration,
        waveformData,
        inPoint,
        outPoint,
        currentTime
      );
    } else {
      console.log('波形データがないか、ロード中のため描画をスキップ', { 
        hasData: !!waveformData, 
        dataLength: waveformData?.length || 0, 
        isLoading: isLoadingWaveform
      });
      
      // データがない場合はシンプルな表示をする
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#333333';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      
      if (isLoadingWaveform) {
        ctx.fillText('波形データを読み込み中...', canvas.width / 2, canvas.height / 2);
      } else if (error) {
        ctx.fillStyle = '#ff6666';
        ctx.fillText(error, canvas.width / 2, canvas.height / 2);
      } else {
        ctx.fillText('波形データがありません', canvas.width / 2, canvas.height / 2);
      }
    }
  }, [waveformData, currentTime, inPoint, outPoint, isLoadingWaveform, selectedMedia?.duration, error]);

  // メディアが変更されたときに波形データを読み込む
  useEffect(() => {
    if (!selectedMedia || !selectedMedia.path) {
      console.log('有効なメディアファイルがありません');
      return;
    }
    
    // 既に同じメディアの波形データがある場合は再度リクエストしない
    if (waveformData && waveformData.length > 0 && latestProps.current.selectedMedia?.id === selectedMedia.id) {
      console.log('既に同じメディアの波形データがあるため新規リクエストはスキップします:', {
        mediaId: selectedMedia.id,
        dataLength: waveformData.length
      });
      return;
    }

    console.log('メディア選択検出:', {
      id: selectedMedia.id,
      path: selectedMedia.path,
      duration: selectedMedia.duration,
      previousMediaId: latestProps.current.selectedMedia?.id
    });
    
    // ローディング状態をリセット
    setIsLoadingWaveform(true);
    setError(null);
    setFetchAttempts(0);
    // 波形データをクリアしない - 新しいデータが取得されるまで古いデータを表示
    // setWaveformData(null);
    
    // ファイルパス確認
    console.log('選択メディアパス:', selectedMedia.path);
    
    // ファイルパスに対応する既存の波形データを確認してから生成する
    (async () => {
      try {
        // 波形データの取得を試みる
        const existingTaskIdResponse = await window.api.getTaskIdByMediaPath(selectedMedia.path, 'waveform') as TaskIdResponse;
        console.log('既存の波形データタスクID:', existingTaskIdResponse);
        
        let existingTaskId: string | undefined = undefined;
        
        if (typeof existingTaskIdResponse === 'string') {
          // 直接文字列が返された場合
          existingTaskId = existingTaskIdResponse;
        } else if (existingTaskIdResponse && typeof existingTaskIdResponse === 'object' && 'taskId' in existingTaskIdResponse) {
          // オブジェクトが返された場合
          existingTaskId = existingTaskIdResponse.taskId;
        }
        
        if (existingTaskId) {
          // 既存のタスクIDがある場合はそのタスクの結果を取得する
          console.log('既存の波形データタスクを使用します:', existingTaskId);
          fetchWaveformData(existingTaskId);
        } else {
          // 既存のタスクがない場合は新しいタスクを生成する
          console.log('新しい波形データタスクを生成します');
          generateWaveform(selectedMedia.path);
        }
      } catch (error) {
        console.error('波形データ確認中にエラーが発生しました:', error);
        setError(`波形データの確認に失敗しました: ${(error as Error).message || '不明なエラー'}`);
        setIsLoadingWaveform(false);
        setTaskRequestId(null);
      }
    })();
  }, [selectedMedia, fetchWaveformData, generateWaveform, waveformData]); // waveformDataを依存配列に追加

  const handleSetInPoint = useCallback(() => {
    if (!selectedMedia) return;
    const newInPoint = latestProps.current.currentTime; // Use latest time from ref
    const currentOut = latestProps.current.outPoint; // Use latest outPoint from ref
    if (currentOut !== null && newInPoint >= currentOut) {
      console.warn("IN point cannot be after OUT point.");
      return;
    }
    setInPoint(newInPoint);
    onUpdateTrimPoints(selectedMedia.id, newInPoint, currentOut);
  }, [selectedMedia, onUpdateTrimPoints]); // Dependencies: props needed to update state/call parent

  const handleSetOutPoint = useCallback(() => {
    if (!selectedMedia) return;
    const newOutPoint = latestProps.current.currentTime; // Use latest time from ref
    const currentIn = latestProps.current.inPoint; // Use latest inPoint from ref
    if (currentIn !== null && newOutPoint <= currentIn) {
      console.warn("OUT point cannot be before IN point.");
      return;
    }
    setOutPoint(newOutPoint);
    onUpdateTrimPoints(selectedMedia.id, currentIn, newOutPoint);
  }, [selectedMedia, onUpdateTrimPoints]); // Dependencies: props needed to update state/call parent

  // Handle clicks on the canvas to seek
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    // Use waveformCanvasRef consistently
    if (!waveformCanvasRef.current || !selectedMedia?.duration) return;

    const canvas = waveformCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const displayWidth = rect.width; // Use display width from getBoundingClientRect

    // Ensure displayWidth is not zero to prevent division by zero
    if (displayWidth <= 0) return;

    // Calculate the time corresponding to the click position using display width
    const clickedTime = (x / displayWidth) * selectedMedia.duration;

    // Call the onSeek prop passed from App.tsx
    onSeek(clickedTime);
  };

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Typography variant="body2" gutterBottom>トリミング</Typography>
      <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          onClick={handleSetInPoint}
          disabled={!selectedMedia}
          size="small"
          sx={{ fontSize: '0.75rem' }}
        >
          IN点を設定 {inPoint !== null ? `(${inPoint.toFixed(2)}s)` : ''}
        </Button>
        <Button
          variant="contained"
          onClick={handleSetOutPoint}
          disabled={!selectedMedia}
          size="small"
          sx={{ fontSize: '0.75rem' }}
        >
          OUT点を設定 {outPoint !== null ? `(${outPoint.toFixed(2)}s)` : ''}
        </Button>
      </Box>
      <Box 
        sx={{ 
          flexGrow: 1, 
          position: 'relative', 
          backgroundColor: '#1e1e1e', 
          minHeight: '120px',
          maxHeight: 'calc(100% - 50px)', // ボタン部分の高さを差し引いた最大高さ
          border: '1px solid #444',
          borderRadius: '4px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 1 // 下部にマージンを追加
        }}
      >
        {isLoadingWaveform && (
          <Box sx={{ 
            position: 'absolute', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)',
            zIndex: 2,
            bgcolor: 'rgba(0,0,0,0.5)',
            p: 2,
            borderRadius: '4px'
          }}>
            <CircularProgress color="primary" size={32} />
            <Typography variant="caption" sx={{ ml: 1, color: 'white' }}>
              波形データを読み込み中...
            </Typography>
          </Box>
        )}
        {error && (
          <Box sx={{ 
            position: 'absolute', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)',
            color: 'error.main',
            bgcolor: 'rgba(0,0,0,0.7)',
            p: 2,
            borderRadius: '4px'
          }}>
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          </Box>
        )}
        <canvas
          ref={waveformCanvasRef}
          style={{ 
            display: 'block', 
            width: '100%', 
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0
          }}
          onClick={handleCanvasClick}
        />
      </Box>
    </Box>
  );
};

export default TrimPane;