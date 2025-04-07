#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// main.jsファイルのパス
const mainJsPath = path.join(__dirname, 'src', 'main', 'main.js');

// ファイルを読み込む
let content = fs.readFileSync(mainJsPath, 'utf8');

// 重複している部分を削除
const startMarker = "// タスクキャンセル\nipcMain.handle('cancel-task'";
const endMarker = "function measureLoudnessInternal";

// 重複部分を削除するための処理
const startIndex = content.indexOf(startMarker);
if (startIndex !== -1) {
  const endIndex = content.indexOf(endMarker, startIndex);
  if (endIndex !== -1) {
    // 重複部分を削除し、直接次の関数につなげる
    content = content.substring(0, startIndex) + 
              "\n\n// 内部関数：ラウドネス測定タスクを作成\n" + 
              content.substring(endIndex);
    
    // 修正したファイルを書き込む
    fs.writeFileSync(mainJsPath, content, 'utf8');
    console.log('main.jsファイルの重複コードを削除しました');
  } else {
    console.error('終了マーカーが見つかりません');
  }
} else {
  console.error('開始マーカーが見つかりません');
}
