✅ Electron + FFmpeg による Appleシリコン最適化 動画編集GUIアプリ：仕様書

⸻

■ 概要

このアプリは、Electron + FFmpeg をベースに構築する、Appleシリコン（M1/M2/M3）向け最適化済みの直感的な動画編集アプリケーションです。
	•	タイムラインベースの直感的なクリップ操作
	•	音声波形による高精度なトリミング
	•	ラウドネス正規化（-14 LUFS）
	•	音声のクロスフェード結合
	•	ハードウェア支援による高速書き出し
	•	最終的に全ての動画を一つの動画に書き出し
	•	書き出し対応フォーマット：H.264 / H.265 / ProRes HQ

⸻

■ UI構成（4エリア）

​添付写真を参照

⸻

■ 主な機能

🎞️ 素材管理
	•	フォルダ・複数ファイルをドラッグ＆ドロップ or 選択追加
	•	対応形式：動画（.mp4, .mov, .avi…）・静止画（.jpg, .png…）
	•	静止画は自動で5秒動画化（アスペクト比維持で黒背景パディング）
	•	撮影日時でソートしてタイムライン末尾に自動追加

🔊 トリミング機能
	•	波形はFFmpegでRAW PCM出力 → CanvasにInt16Arrayで描画
	•	マウス操作でトリム範囲を指定・削除・複数管理
	•	シークバーと波形カーソルは同期
	•	波形から不要な発話や無音区間を視覚的に見つけやすい

📏 ラウドネス正規化（YouTube基準）
	•	loudnorm フィルタでITU-R BS.1770-3準拠の-14 LUFSに正規化

🔄 クロスフェード結合
	•	acrossfade（音声）/ xfade（映像）で0.5秒のスムーズな繋ぎ
	•	ノイズ防止・自然なつながりの実現

🧠 バックグラウンド処理
	•	波形生成 / ラウドネス解析 / 静止画変換などは非同期実行
	•	ヘッダーにインジケータ「処理中：X件」
	•	書き出しはすべての処理完了後でなければ実行不可

📤 書き出し（中間変換 + 結合）
	•	出力設定：解像度（720p/1080p/2K/4K）、fps（24/30/60）、コーデック（H.264/H.265/ProRes HQ）
	•	ステップ1：クリップごとに中間フォーマットに再エンコード（統一仕様）
	•	ステップ2：concat モードで最終結合（-c copyで高速）

⸻

■ 技術スタック

機能	使用技術
UI	Electron + HTML/CSS/JS（React）
動画処理	FFmpeg（ffmpeg-static）
エンコード	VideoToolbox（HW支援） + ProRes
波形描画	PCM（s16le） → Int16Array → Canvas
タスク管理	Node.js非同期 + フロント同期通知
バックエンド	マイクロサービスアーキテクチャ + Express + Axios

⸻

■ プロジェクト構成

```
swp1/
├── package.json           # 依存関係と設定
├── src/
│   ├── main/              # メインプロセス
│   │   ├── main.js        # エントリーポイント
│   │   ├── preload.js     # レンダラーとのIPC通信橋渡し役
│   │   ├── ffmpeg-service-manager.js  # FFmpegサービス管理
│   │   └── ffmpeg-service.js          # FFmpegマイクロサービス
│   └── renderer/          # レンダラープロセス
│       ├── index.html     # メインHTML
│       └── react/         # Reactコンポーネント
│           ├── App.tsx    # メインアプリケーション
│           ├── components/
│           │   ├── MediaPane.tsx      # メディアリスト
│           │   ├── PlayerPane.tsx     # プレビュープレーヤー
│           │   ├── TimelinePane.tsx   # タイムライン
│           │   ├── TrimPane.tsx       # トリミング/波形
│           │   └── ExportPane.tsx     # 書き出し設定
│           └── types/     # 型定義
└── dist/                  # ビルド済みアプリ
```

⸻

■ アプリの起動方法

**開発モード**
```bash
# 依存関係のインストール
npm install

# 開発モードでの実行
npm start
```

**ビルド**
```bash
# macOS向けビルド
npm run build:mac
```

⸻

🧩 開発方針：段階的開発（ステップバイステップ）

✅ フェーズ1：基盤構築
	•	Electron環境セットアップ
	•	Electronからffmpegが呼び出せることを確認
	•	動画再生 / ファイル読み込み / タイムライン表示
	•	波形抽出 + Canvas描画のベース

✅ フェーズ2：編集機能
	•	トリム範囲のインタラクション
	•	音声クロスフェード、タイムラインUI操作
	•	複数クリップ連結、再生との連動確認

✅ フェーズ3：処理機能の統合
	•	ラウドネス正規化（loudnorm）
	•	書き出し設定UI（解像度 / fps / コーデック）
	•	中間変換処理 / concat結合処理

✅ フェーズ4：UI/UX強化
	•	バックグラウンドインジケータ
	•	書き出し条件管理（処理中はボタン無効化）
	•	処理ステータスの可視化とリトライ機能

⸻

🧠 開発のポイント
	•	ユーザーは常に「いま何が行われているか」を把握できるUI
	•	編集中もバックグラウンド処理が並行実行可能
	•	書き出しは「最終処理」として位置づけ、すべての整合性を取る
	•	Macでの高速化を考慮し、可能な限りVideoToolboxで処理

⸻

📝 進捗報告 (2025-03-30)

✅ フェーズ1の基盤構築完了
- Electronアプリケーションの基本構造を設定
- FFmpegとの連携を確認
- 主要なUIコンポーネントを実装:
  - 素材リスト
  - プレビュープレーヤー
  - タイムライン
  - 波形表示
  - トリミング機能のUI
  - 書き出し設定UI

✅ フェーズ2&3の一部実装完了
- 動画の読み込み機能
- 波形抽出とCanvas描画の基本実装
- トリミング範囲の指定と保存
- タイムラインでのクリップ管理
- 基本的な書き出し機能

✅ タイムラインペインの完成（2025-03-31）
- タイムラインベースのクリップ操作機能を実装完了
- 波形表示とトリミング機能の統合
- 複数クリップの管理と操作
- シークバーと波形カーソルの同期
- ドラッグ＆ドロップによるクリップ配置
- クリップ間の時間調整機能
- 以後のコード改変は慎重に行いタイムラインペインのデグレードを防ぐ

✅ サムネイル生成機能の修正（2025-04-02）
- サムネイル生成フローの修正により、タイムラインでのサムネイル表示機能を改善
- thumbnail-generatedイベントを活用した非同期通知の実装
- ElectronのIPC通信における重要な修正:
  - preload.jsでのサムネイル生成APIの公開
  - main.jsでのサムネイル生成関数の強化
  - 複数のパラメータ形式に対応するAPIの柔軟な設計

- **修正内容の詳細**:
  1. **プリロードスクリプトの強化**:
     - `generateThumbnail`関数をレンダラープロセスに公開するよう`preload.js`を修正
     - 許可されたIPCチャンネルリストに`generate-thumbnail`を追加
     - オブジェクト形式と個別パラメータ形式の両方に対応できるよう柔軟な実装を追加
     ```javascript
     generateThumbnail: (pathOrOptions, fileId) => {
       if (typeof pathOrOptions === 'string') {
         // 個別のパラメータとして呼び出された場合
         return ipcRenderer.invoke('generate-thumbnail', { 
           filePath: pathOrOptions, 
           fileId: fileId 
         });
       } else {
         // オブジェクトとして呼び出された場合
         return ipcRenderer.invoke('generate-thumbnail', pathOrOptions);
       }
     }
     ```

  2. **App.tsxの改善**:
     - サムネイル生成ヘルパー関数を追加して、コード重複を削減
     - メディアオブジェクトロード時に自動的にサムネイル生成を要求するuseEffectを実装
     - 明示的なエラーハンドリングと型チェックの追加

  3. **TimelinePaneのデバッグ強化**:
     - サムネイル受信・表示プロセスにデバッグログを追加
     - イベントリスナーの確実な初期化と解除を確認

- **教訓**:
  1. **Electron IPCの設計パターン**:
     - プリロードスクリプト（preload.js）はレンダラープロセスとメインプロセスの「橋渡し」役であり、セキュリティの観点から明示的な設定が必要
     - 新機能を追加する際は、preload.jsでの公開と許可リストへの追加を忘れないこと
     - API設計時には、呼び出し側の利便性と型安全性のバランスを考慮する

  2. **デバッグの重要性と手法**:
     - 複雑なプロセス間通信では、各段階でのロギングが問題特定に不可欠
     - データの流れを追跡できるよう、ログポイントを戦略的に配置する
     - 受信したデータの形式と内容を常に検証し、想定通りか確認する

  3. **エラーハンドリングの徹底**:
     - 条件付きロジックを使用して、無効なデータや状態に対する堅牢性を確保
     - エラーをキャッチして詳細を記録し、デバッグを容易にする
     - ユーザー体験を損なわないよう、エラー発生時も可能な限り機能を維持する

- TimelinePaneコンポーネントの機能強化:
  - ドラッグ＆ドロップ機能の実装:
    ```typescript
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      
      // ファイルのドロップ処理
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const filePaths: string[] = [];
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const file = e.dataTransfer.files[i] as ElectronFile;
          if (file.path) {
            filePaths.push(file.path);
          }
        }
        
        // ドロップされたファイルパスを直接処理
        if (filePaths.length > 0 && onDropFiles) {
          await onDropFiles(filePaths);
        }
      }
    };
    ```
  - サムネイル表示とラウドネス測定の連携
  - イベントベースのサムネイル更新メカニズム
  - 詳細なデバッグロギングの実装
  
- 開発時の教訓:
  - Electronアプリにおけるプリロードスクリプトの重要性
  - IPC通信の設計とデバッグ手法
  - レンダラープロセスとメインプロセス間のデータ受け渡しのベストプラクティス

✅ IPC通信のリファクタリング（2025-04-06）
- ElectronとFFmpeg間の通信を改善し、より信頼性の高い構造に修正:
  1. **マイクロサービスアーキテクチャの導入**:
     - `ffmpeg-service.js`: FFmpegをExpressベースのマイクロサービスとして実装
     - RESTful APIエンドポイントでFFmpegタスクを処理（/process, /status/:taskId, /health）
     - タスクキューによる複数FFmpegタスクの順次処理
  
  2. **FFmpegサービスマネージャーの実装**:
     - `ffmpeg-service-manager.js`: FFmpegサービスのライフサイクル管理
     - サービスの起動、停止、監視機能
     - Axios APIクライアントによるサービスとの通信
  
  3. **IPC通信の改善**:
     - `main.js`の更新: FFmpegサービスマネージャーとの統合
     - FFmpegバージョン確認、タスク状態確認、タスクキャンセル用のIPC通信ハンドラー
     - 進捗監視とレンダラープロセスへの更新通知
  
  4. **preload.jsの更新**:
     - FFmpegタスク管理のための新しいAPI公開
     - タスク状態取得とタスクキャンセル機能の追加
  
  5. **FFprobeコマンドの最適化**:
     - `runFFprobeCommand`関数の改善: 直接実行方式による信頼性向上
     - メタデータ取得の精度向上とエラーハンドリング強化
  
  6. **波形表示機能の修正**:
     - `generate-waveform`ハンドラーの改善: 直接FFmpegプロセス実行方式への変更
     - ファイルパスのバリデーション強化
     - 一時ファイル管理の改善とエラーハンドリングの強化
     - 詳細なログ出力によるデバッグ性の向上

- **リファクタリングの成果**:
  1. **安定性の向上**:
     - プロセス分離による影響範囲の局所化
     - エラー発生時も他の機能に影響が波及しない構造
  
  2. **デバッグの容易さ**:
     - 詳細なログ出力による問題特定の迅速化
     - 明確なエラーメッセージの提供
  
  3. **スケーラビリティの向上**:
     - 複数のFFmpegタスクを順次処理できる構造
     - 将来的な機能拡張に対応しやすい設計

- **技術的なポイント**:
  1. **Expressサーバーの活用**:
     ```javascript
     // RESTful API設計
     app.post('/process', async (req, res) => {
       const { command, taskId } = req.body;
       // タスク処理ロジック
     });
     
     app.get('/status/:taskId', (req, res) => {
       const { taskId } = req.params;
       // タスク状態取得ロジック
     });
     
     app.get('/health', (req, res) => {
       // ヘルスチェックロジック
     });
     ```
  
  2. **タスク管理システム**:
     ```javascript
     // タスクキュー管理
     const taskQueue = [];
     const activeTasks = {};
     
     function processNextTask() {
       if (taskQueue.length === 0 || isProcessing) return;
       
       isProcessing = true;
       const nextTask = taskQueue.shift();
       // タスク実行ロジック
     }
     ```
  
  3. **波形生成の改善**:
     ```javascript
     // 直接プロセス実行による波形生成
     const process = spawn(ffmpegPath, [
       '-i', filePath,
       '-f', 's16le',
       '-acodec', 'pcm_s16le',
       '-ac', '1',
       '-ar', '44100',
       pcmOutputPath
     ]);
     ```

📋 次のステップ (フェーズ3&4の残り実装)
- ラウドネス正規化機能の実装
- クロスフェード結合機能の実装
- タイムラインから選択した範囲のみを書き出す機能
- 書き出し条件管理の強化
- バックグラウンドインジケータの実装

⸻

■ その他の情報

**開発環境**
- Node.js: 18.x
- Electron: 27.x
- React: 18.x
- TypeScript: 5.x
- FFmpeg: 7.1.1

**アーキテクチャ図**
```
[レンダラープロセス] <--IPC--> [メインプロセス] <--HTTP--> [FFmpegサービス]
    (React UI)                (Electron)                (Express)
```

**レンダラープロセスからのAPI呼び出し例**
```javascript
// トリミングビュー波形生成
const waveformResult = await window.api.generateWaveform(selectedMedia.path);
if (waveformResult.success) {
  setWaveformData(waveformResult.waveform);
}

// FFmpegタスク進捗監視
window.api.on('ffmpeg-task-progress', (progress) => {
  updateProgressIndicator(progress);
});
```
