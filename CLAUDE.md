# Super Watarec - Appleシリコン最適化動画編集アプリ

## 概要

このアプリは、Electron + FFmpegをベースに構築する、Appleシリコン（M1/M2/M3）向け最適化済みの直感的な動画編集アプリケーションです。

### 主な特徴

- タイムラインベースの直感的なクリップ操作
- 音声波形による高精度なトリミング
- ラウドネス正規化（-14 LUFS）
- 音声のクロスフェード結合
- ハードウェア支援による高速書き出し
- 最終的に全ての動画を一つの動画に書き出し
- 書き出し対応フォーマット：H.264 / H.265 / ProRes HQ

## 技術スタック

| 機能 | 使用技術 |
| --- | --- |
| UI | Electron + HTML/CSS/JS（React） |
| 動画処理 | FFmpeg（ffmpeg-static） |
| エンコード | VideoToolbox（HW支援） + ProRes |
| 波形描画 | PCM（s16le） → Int16Array → Canvas |
| タスク管理 | Node.js非同期 + フロント同期通知 |
| バックエンド | マイクロサービスアーキテクチャ + Express + Axios |

## 機能詳細

### 素材管理

- フォルダ・複数ファイルをドラッグ＆ドロップ or 選択追加
- 対応形式：動画（.mp4, .mov, .avi…）・静止画（.jpg, .png…）
- 静止画は自動で5秒動画化（アスペクト比維持で黒背景パディング）
- 撮影日時でソートしてタイムライン末尾に自動追加

### トリミング機能

- 波形はFFmpegでRAW PCM出力 → CanvasにInt16Arrayで描画
- マウス操作でトリム範囲を指定・削除・複数管理
- シークバーと波形カーソルは同期
- 波形から不要な発話や無音区間を視覚的に見つけやすい

### ラウドネス正規化（YouTube基準）

- loudnorm フィルタでITU-R BS.1770-3準拠の-14 LUFSに正規化

### クロスフェード結合

- acrossfade（音声）/ xfade（映像）で0.5秒のスムーズな繋ぎ
- ノイズ防止・自然なつながりの実現

### バックグラウンド処理

- 波形生成 / ラウドネス解析 / 静止画変換などは非同期実行
- ヘッダーにインジケータ「処理中：X件」
- 書き出しはすべての処理完了後でなければ実行不可

### 書き出し（中間変換 + 結合）

- 出力設定：解像度（720p/1080p/2K/4K）、fps（24/30/60）、コーデック（H.264/H.265/ProRes HQ）
- ステップ1：クリップごとに中間フォーマットに再エンコード（統一仕様）
- ステップ2：concat モードで最終結合（-c copyで高速）

## プロジェクト構成

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

## 開発方針と進捗

### 開発フェーズ

1. **フェーズ1：基盤構築**
   - Electron環境セットアップ
   - ElectronからFFmpegが呼び出せることを確認
   - 動画再生 / ファイル読み込み / タイムライン表示
   - 波形抽出 + Canvas描画のベース

2. **フェーズ2：コア機能**
   - 波形表示とトリミング
   - タイムラインでの複数クリップ管理
   - 切り替え点のプレビュー

3. **フェーズ3：高度な機能**
   - ラウドネス正規化
   - クロスフェード
   - 高度な書き出し設定
   - 結合動画の途中チェック

4. **フェーズ4：最適化**
   - パフォーマンスチューニング
   - Macでの高速化を考慮し、可能な限りVideoToolboxで処理

### 進捗状況

#### ✅ フェーズ1の基盤構築（2025-03-30）

- Electronアプリケーションの基本構造を設定
- FFmpegとの連携を確認
- 主要なUIコンポーネントを実装:
  - 素材リスト
  - プレビュープレーヤー
  - タイムライン
  - 波形表示
  - トリミング機能のUI
  - 書き出し設定UI

#### ✅ フェーズ2&3の一部実装

- 波形表示機能の動作を確認
- タイムライン上での素材の追加・削除・順序変更機能
- サムネイル生成処理を強化
- IPC通信でのエラーハンドリングとデバッグ機能

#### ✅ IPC通信のリファクタリング（2025-04-06）

- ElectronとFFmpeg間の通信を改善し、より信頼性の高い構造に修正:

1. **マイクロサービスアーキテクチャの導入**:
   - `ffmpeg-service.js`: FFmpegをExpressベースのマイクロサービスとして実装
   - REST APIによるFFmpeg操作（タスク作成/状態取得/ヘルスチェック）
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

#### ✅ タスク管理システムのデバッグと修正（2025-04-06）

- **タスク管理ビューの改善**:

1. **ファイル名表示問題の修正**:
   - 「不明なファイル」と表示される問題を解決
   - ファイル名取得ロジックの強化:
     ```javascript
     // ファイル名の取得を改善（3段階の検索プロセス）
     let fileName = null;
     
     // 1. 直接指定されたファイル名があればそれを使用
     if (options.fileName) {
       fileName = options.fileName;
     } 
     // 2. 入力ファイルパスがあれば、そのファイル名を抽出
     else if (options.input) {
       fileName = path.basename(options.input);
     } 
     // 3. commandから入力ファイルを推測（-i オプションの後の引数）
     else if (options.command) {
       const inputMatch = options.command.match(/-i\s+["']?([^"'\s]+)["']?/);
       if (inputMatch && inputMatch[1]) {
         fileName = path.basename(inputMatch[1]);
       }
     }
     ```

2. **UI表示の改善**:
   - システムタスク（初期化処理など）ではファイル名を表示しないように修正
   - ファイル処理タスクのみファイル名を表示し、ユーザー体験を向上
   - `TaskItem`コンポーネントの条件判定強化:
     ```jsx
     {task.fileName && task.fileName.trim() !== '' && (
       <Typography component="span" variant="caption">
         {task.fileName}
       </Typography>
     )}
     ```

## リファクタリングの成果

1. **安定性の向上**:
   - プロセス分離による影響範囲の局所化
   - エラー発生時も他の機能に影響が波及しない構造

2. **デバッグの容易さ**:
   - 詳細なログ出力による問題特定の迅速化
   - 明確なエラーメッセージの提供

3. **スケーラビリティの向上**:
   - 複数のFFmpegタスクを順次処理できる構造
   - 将来的な機能拡張に対応しやすい設計

## 実装サンプル

### Expressサーバーの活用

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

### タスク管理システム

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

### 波形生成の改善

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

### レンダラープロセスからのAPI呼び出し例

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

## 今後の課題

1. タスク再試行機能の実装
2. タスクのフィルタリングとソート機能
3. タスク履歴の保存と復元
4. タスク管理システムとFFmpegサービスの統合強化
5. ユーザーインターフェースの一貫性向上
6. ラウドネス正規化機能の実装
7. クロスフェード結合機能の実装
8. タイムラインから選択した範囲のみを書き出す機能
9. 書き出し条件管理の強化
10. バックグラウンドインジケータの実装

## システムアーキテクチャ

```
[レンダラープロセス] <--IPC--> [メインプロセス] <--HTTP--> [FFmpegサービス]
    (React UI)                (Electron)                (Express)
```

## 開発環境

- Node.js: 18.x
- Electron: 27.x
- React: 18.x
- TypeScript: 5.x
- FFmpeg: 7.1.1

## 現在の開発状況

現在、タスク管理システムのデバッグと実装が進行中です。特にFFmpegタスクとの連携や正確なステータス表示、エラー処理の改善を重点的に行っています。最終的には安定したタスク処理基盤を構築し、その上でラウドネス正規化やクロスフェード結合などの高度な機能を実装していく予定です。
