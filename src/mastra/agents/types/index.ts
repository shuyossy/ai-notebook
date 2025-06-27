// Mastra AgentにてAIモデルを動的に作成するためのRuntimeContext
// runtimeContextはmodel, tools, promptの設定やworkflowで活用可能
// https://mastra.ai/ja/docs/agents/dynamic-agents
export type BaseRuntimeContext = {
  model: {
    key: string;
    url: string;
    modelName: string;
  };
};
