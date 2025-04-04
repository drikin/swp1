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
UI	Electron + HTML/CSS/JS（将来的にVue/React）
動画処理	FFmpeg（ffmpeg-static or Apple最適化ビルド）
エンコード	VideoToolbox（HW支援） + ProRes
波形描画	PCM（s16le） → Int16Array → Canvas
タスク管理	Node.js非同期 + フロント同期通知

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
- 動画結合・出力機能を実装:
  - 2段階エクスポートプロセス：
    1. 各素材を統一フォーマットに変換（互換性向上）
    2. 変換済みファイルを再エンコードなしで結合（高速化）
  - Appleシリコン向けハードウェアエンコード対応:
    - VideoToolboxエンコーダー（h264_videotoolbox/hevc_videotoolbox）を使用
    - ハードウェア非対応環境ではソフトウェアエンコードに自動フォールバック
  - 解像度、フレームレート、コーデック設定のカスタマイズ
  - 出力先フォルダの選択（デフォルトはデスクトップ）
  - デフォルトでH.265/HEVCコーデックを使用
  - 進捗表示の実装（変換段階と結合段階で別々の進捗表示）
  - 特殊形式への対応:
    - DJI Osmoなどの特殊なHEVC動画
    - 静止画の自動動画化（5秒間）
    - 10ビット色深度の処理
  - エラーハンドリングの強化

✅ タイムラインペインの完成（2025-03-31）
- タイムラインベースのクリップ操作機能を実装完了
- 波形表示とトリミング機能の統合
- 複数クリップの管理と操作
- シークバーと波形カーソルの同期
- ドラッグ＆ドロップによるクリップ配置
- クリップ間の時間調整機能
- 以後のコード改変は慎重に行いタイムラインペインのデグレードを防ぐ

✅ グローバルキーボードショートカット実装完了（2025-03-31）
- 再生制御: スペース（再生/一時停止）、K（停止）
- 速度変更: J（スロー/逆再生）、L（高速再生）
- 素材選択: 上下矢印キー、PとNキー（前/次の素材）
- コマンドショートカット: 
  - Cmd/Ctrl+E（書き出し設定）
  - Cmd/Ctrl+A（素材追加）
- 以後のコード改変では既存のショートカット機能を維持し、デグレードさせないこと

✅ サムネイル表示とファイルサイズ表示の問題解決（2025-04-04）
- メディアファイルのサムネイル生成と表示機能の完全実装
- ファイルサイズの正確な表示機能の実装
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

📋 次のステップ (フェーズ3&4の残り実装)
- ラウドネス正規化機能の実装
- クロスフェード結合機能の実装
- タイムラインから選択した範囲のみを書き出す機能
- 書き出し条件管理の強化
- バックグラウンドインジケータの実装
