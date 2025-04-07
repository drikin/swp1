# FFmpegサービス修正状況

## 2025-04-07 修正完了内容

### 1. IPC通信ハンドラの重複登録問題を解決

- media-api.jsに`safeRegisterHandler`関数を実装
  - 既存のハンドラを削除してから新規登録することで重複を防止
  - get-media-info、get-media-list、check-media-existsの各ハンドラに適用
- main.jsの重複登録コードを削除

### 2. TaskManager関連のイベント処理問題を修正

- TaskManagerのイベントリスナー設定ロジックを修正
  - `taskManager.on`から`taskManager.eventEmitter.on`への変更
  - setupTaskEventsとsetupTaskEventListeners関数を両方修正
  - エラーチェックを追加してより堅牢に

### 3. FFmpegサービスマネージャーの信頼性向上

- サービス起動プロセスを完全に改良
  - 起動時に既存のFFmpegプロセスを常に終了して確実に再起動
  - 複数のヘルスチェック方法を組み合わせ
  - 詳細なログ出力を追加して診断を容易に
- taskId生成ロジックを改善
  - 独自のIDを生成し、リクエストごとに一意性を確保

### 4. VideoToolboxハードウェアエンコード検出の改善

- FFmpegのハードウェアアクセラレーション検出ロジックを強化
  - `-hwaccels`コマンドで直接サポート状況を確認
  - 複数の検出方法を組み合わせたフォールバック機構の実装
  - macOSのVideoToolboxを確実に検出
- バージョン表示の強化
  - ハードウェアエンコード対応時は「FFmpeg 7.1.1 (HW)」と表示
  - ソフトウェアエンコードのみの場合は「FFmpeg 7.1.1 (SW)」と表示

## 解決された問題

1. アプリ起動時のエラー `TypeError: globalTaskManager.on is not a function`
2. FFmpegサービスへの接続エラー `AxiosError: Request failed with status code 400`
3. VideoToolboxの検出が正しく行われない問題
4. ハードウェアエンコーディング対応状況が表示されない問題

## 今後の課題

1. 長時間使用時のメモリリーク対策
2. エラーハンドリングのさらなる改善
3. FFmpegサービスのパフォーマンス最適化
