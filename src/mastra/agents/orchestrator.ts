import { Agent } from '@mastra/core/agent';
import { ORCHESTRATOR_SYSTEM_PROMPT } from './prompts';
import { sourceListTool, querySourceTool } from '../tools/sourcesTools';
import { AgentManager, createAgent } from './config/agent';

const ORCHESTRATOR_NAME = 'orchestrator';

/**
 * オーケストレーターエージェントを取得または作成する
 * シングルトンパターンで管理し、必要に応じて初期化する
 */
export const getOrchestrator = (): Agent => {
  try {
    // 既存のインスタンスがあれば返す
    const existingAgent = AgentManager.getInstance(ORCHESTRATOR_NAME);
    if (existingAgent) {
      return existingAgent;
    }

    // 新規インスタンスを作成
    const agent = createAgent({
      name: ORCHESTRATOR_NAME,
      instructions: ORCHESTRATOR_SYSTEM_PROMPT,
      tools: {
        sourceListTool,
        querySourceTool,
      },
      memoryConfig: {
        lastMessages: 40,
        semanticRecall: false,
        threads: {
          generateTitle: true,
        },
        workingMemory: {
          enabled: true,
          use: 'text-stream',
          tmplate: `
# ユーザの質問内容
## 質問内容
- 例: javaの特徴は？どのような開発案件で利用されますか？
## キーワード
- 例: javaの特徴
- 例: 開発案件
# 作業手順
- 例: javaの特徴を調べるために、ソースを検索する
- 例: javaがどのような開発案件で利用されているか、ソースを検索する
# 作業メモ
- 例: javaの特徴
  - 例: javaはオブジェクト指向プログラミング言語であり、プラットフォームに依存しない
  - 例: javaはオープンソースであり、広く使用されている
- 例: javaと開発案件
  - 例: javaはWebアプリケーション開発やAndroidアプリ開発に利用されることが多い
  - 例: javaは大規模なエンタープライズシステムでも使用される
# 回答メモ
- 例: まず、javaの特徴を以下に挙げます
  - 例: javaはオブジェクト指向プログラミング言語であり、プラットフォームに依存しない
  - 例: javaはオープンソースであり、広く使用されている  
- 例: 次にjavaと開発案件についてですが、javaは以下のような開発案件で利用されます...
`,
        },
      },
    });

    // インスタンスを保存
    AgentManager.setInstance(ORCHESTRATOR_NAME, agent);

    return agent;
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : '不明なエラー';
    throw new Error(
      `オーケストレーターエージェントの初期化に失敗しました: ${errorMessage}`,
    );
  }
};

export default getOrchestrator;
