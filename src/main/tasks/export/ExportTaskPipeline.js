/**
 * 書き出しパイプラインの実行管理クラス
 * 複数のExportStepを順番に実行する
 */
class ExportTaskPipeline {
  /**
   * @param {Object} config - パイプラインの設定
   */
  constructor(config = {}) {
    this.steps = [];
    this.config = config;
    this.currentStep = null;
    this.cancelled = false;
    this.context = null;
  }

  /**
   * パイプラインにステップを追加
   * @param {ExportStep} step - 追加するステップ
   * @returns {ExportTaskPipeline} - チェーン用にthisを返す
   */
  addStep(step) {
    this.steps.push(step);
    return this;
  }

  /**
   * 条件付きでステップを追加
   * @param {ExportStep} step - 追加するステップ
   * @param {Function} condition - 実行条件を判定する関数 (context) => boolean
   * @returns {ExportTaskPipeline} - チェーン用にthisを返す
   */
  addConditionalStep(step, condition) {
    this.steps.push({
      step,
      condition
    });
    return this;
  }

  /**
   * パイプラインを実行
   * @param {ExportContext} initialContext - 初期コンテキスト
   * @param {Function} progressCallback - 進捗コールバック (progress, details) => void
   * @returns {Promise<ExportContext>} - 最終的なコンテキスト
   */
  async execute(initialContext, progressCallback = () => {}) {
    this.context = initialContext;
    
    if (this.steps.length === 0) {
      throw new Error('パイプラインにステップが追加されていません');
    }

    let stepIndex = 0;
    let overallProgress = 0;
    
    for (const stepItem of this.steps) {
      if (this.cancelled) {
        throw new Error('パイプラインがキャンセルされました');
      }
      
      const step = stepItem.step || stepItem;
      const condition = stepItem.condition;
      
      // 条件付きステップの場合、条件を評価
      if (condition && !condition(this.context)) {
        console.log(`ステップ ${step.name} はスキップされました: 条件を満たしていません`);
        continue;
      }
      
      // ステップが実行可能か確認
      if (!step.canExecute(this.context)) {
        console.log(`ステップ ${step.name} はスキップされました: 実行条件を満たしていません`);
        continue;
      }
      
      this.currentStep = step;
      
      console.log(`ステップ ${step.name} を実行します (${stepIndex + 1}/${this.steps.length})`);
      
      // 各ステップの進捗を全体の進捗に変換するためのラッパー
      const stepProgressCallback = (stepProgress, details = {}) => {
        // ステップの重みに応じて調整可能
        const stepWeight = 1 / this.steps.length;
        const weightedStepProgress = stepProgress * stepWeight;
        const base = stepIndex * stepWeight * 100;
        
        overallProgress = base + weightedStepProgress;
        
        progressCallback(overallProgress, {
          ...details,
          phase: step.name,
          currentStep: stepIndex + 1,
          totalSteps: this.steps.length
        });
      };
      
      try {
        // ステップを実行して、更新されたコンテキストを受け取る
        this.context = await step.execute(this.context, stepProgressCallback);
      } catch (error) {
        console.error(`ステップ ${step.name} の実行中にエラーが発生しました:`, error);
        throw error;
      }
      
      stepIndex++;
    }
    
    progressCallback(100, { phase: 'completed' });
    return this.context;
  }

  /**
   * パイプラインをキャンセル
   * @returns {Promise<boolean>} - キャンセル結果
   */
  async cancel() {
    this.cancelled = true;
    
    if (this.currentStep) {
      await this.currentStep.cancel();
    }
    
    return true;
  }
}

module.exports = ExportTaskPipeline;
