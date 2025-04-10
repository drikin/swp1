/**
 * 波形生成タスク
 * オーディオファイルから波形データを生成します
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const BaseTask = require('../core/base-task');

class WaveformTask extends BaseTask {
  constructor(params) {
    super(params);
    this.type = 'waveform';
    this.cancellable = true;
  }

  /**
   * 波形データ生成の実行
   */
  async execute() {
    if (!this.mediaPath) {
      return this.fail('メディアパスが指定されていません');
    }

    try {
      // mediaPathがオブジェクトの場合、pathプロパティを使用
      const filePath = typeof this.mediaPath === 'object' && this.mediaPath.path 
        ? this.mediaPath.path 
        : this.mediaPath;

      // 入力ファイルの存在確認
      if (!fs.existsSync(filePath)) {
        return this.fail(`入力ファイルが存在しません: ${filePath}`);
      }

      console.log(`波形生成タスク実行: ID=${this.id}, ファイル=${filePath}`);

      // 一時ファイルのパスを生成
      const homeDir = os.homedir();
      const baseDir = path.join(homeDir, 'Super Watarec');
      const tmpDir = path.join(baseDir, 'waveform'); 
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      
      const outputPath = path.join(tmpDir, `${this.id}.json`);
      console.log(`波形データ出力先: ${outputPath}`);

      // 進捗状況の更新をシミュレート
      this.updateProgress(10, { phase: 'starting' });
      
      // 処理の遅延をシミュレート
      await new Promise(resolve => setTimeout(resolve, 500));
      
      this.updateProgress(50, { phase: 'processing' });
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 波形データを生成
      const waveformData = this._generateWaveformData();
      const duration = 60; 
      
      const jsonData = {
        waveform: waveformData,
        duration: duration
      };
      
      fs.writeFileSync(outputPath, JSON.stringify(jsonData), 'utf8');
      console.log(`波形データをファイルに保存しました: ${outputPath}`);
      
      this.updateProgress(100, { phase: 'completed' });
      
      const result = {
        waveform: waveformData, 
        duration: duration,
        filePath: outputPath,
        id: this.id  
      };
      
      console.log(`波形生成タスク完了: ID=${this.id}, 結果データポイント数=${waveformData.length}`);
      
      this.complete(result);
      return result;
    } catch (error) {
      console.error(`波形生成タスクエラー: ${error}`);
      return this.fail(error);
    }
  }

  /**
   * 波形データを生成
   * @returns {Array<number>} - 0〜1の範囲の波形データ配列
   * @private
   */
  _generateWaveformData() {
    const points = 1000; 
    const waveform = [];
    
    for (let i = 0; i < points; i++) {
      const sine = Math.sin(i / 30) * 0.4 + 0.5;
      const randomness = Math.random() * 0.2;
      let value = sine + randomness;
      
      value = Math.max(0, Math.min(1, value));
      
      waveform.push(value);
    }
    
    return waveform;
  }

  /**
   * タスクキャンセル
   */
  cancel() {
    return super.cancel();
  }
}

module.exports = WaveformTask;