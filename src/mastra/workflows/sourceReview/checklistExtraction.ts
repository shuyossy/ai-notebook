/* eslint-disable prefer-template */
import { NoObjectGeneratedError } from 'ai';
// @ts-ignore
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { getReviewRepository } from '@/adapter/db';
import { baseStepOutputSchema } from '../schema';
import { stepStatus } from '../types';
import {
  ChecklistExtractionAgentRuntimeContext,
  ChecklistRefinementAgentRuntimeContext,
  TopicExtractionAgentRuntimeContext,
  TopicChecklistAgentRuntimeContext,
} from '../../agents/workflowAgents';
import {
  createRuntimeContext,
  getModelSpecificGenerateOptions,
} from '../../lib/agentUtils';
import { normalizeUnknownError, internalError } from '@/main/lib/error';
import { getMainLogger } from '@/main/lib/logger';
import { publishEvent } from '@/main/lib/eventPayloadHelper';
import { IpcChannels } from '@/types';
import { createCombinedMessage } from './lib';
import { buildDocumentFormatContext } from '../../lib/extractionFormatDescription';

const logger = getMainLogger();

// ワークフローの入力スキーマ
const triggerSchema = z.object({
  reviewHistoryId: z.string().describe('レビュー履歴ID'),
  files: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        path: z.string(),
        type: z.string(),
        processMode: z.enum(['text', 'image']).optional(),
        imageMode: z.enum(['merged', 'pages']).optional(),
        imageData: z.array(z.string()).optional(),
        includeImages: z.boolean().optional(), // テキスト抽出時にファイル内画像を含めるか
      }),
    )
    .describe('アップロードファイルのリスト'),
  documentType: z
    .enum(['checklist-ai', 'general'])
    .default('checklist-ai')
    .describe(
      'ドキュメント種別: checklist=チェックリストドキュメント, general=一般ドキュメント',
    ),
  checklistRequirements: z
    .string()
    .optional()
    .describe('一般ドキュメント用のチェックリスト作成要件'),
});

// チェックリストドキュメント用のステップ出力スキーマ
const checklistDocumentStepOutputSchema = baseStepOutputSchema.extend({
  extractedItems: z.array(z.string()).optional(),
});

// 一般ドキュメント用のトピック出力スキーマ
const topicExtractionStepOutputSchema = baseStepOutputSchema.extend({
  topics: z
    .array(
      z.object({
        title: z.string(),
      }),
    )
    .optional(),
});

// トピック別チェックリスト作成の出力スキーマ
const topicChecklistStepOutputSchema = baseStepOutputSchema.extend({
  checklistItems: z.array(z.string()).optional(),
});

// チェックリスト統合の出力スキーマ
// const checklistIntegrationStepOutputSchema = baseStepOutputSchema;

// チェックリストブラッシュアップの出力スキーマ
const checklistRefinementStepOutputSchema = baseStepOutputSchema.extend({
  refinedItems: z.array(z.string()).optional(),
});

// === チェックリストドキュメント用ステップ ===

const checklistDocumentExtractionStep = createStep({
  id: 'checklistDocumentExtractionStep',
  description: 'チェックリストドキュメントから既存項目を抽出するステップ',
  inputSchema: triggerSchema,
  outputSchema: checklistDocumentStepOutputSchema,
  execute: async ({ inputData, mastra, abortSignal }) => {
    // レビュー用のリポジトリを取得
    const reviewRepository = getReviewRepository();
    // トリガーから入力を取得
    const { reviewHistoryId, files } = inputData;

    try {
      // 既存のシステム作成チェックリストを削除
      await reviewRepository.deleteSystemCreatedChecklists(reviewHistoryId);

      // 複数ファイルを統合してメッセージを作成
      const { fileFormatInfos, ...message } = await createCombinedMessage(
        files,
        'Please extract checklist items from this document',
        (currentIndex, fileName) => {
          publishEvent(IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS, {
            reviewHistoryId,
            currentFileName: fileName,
            currentFileIndex: currentIndex,
            totalFiles: files.length,
            phase: 'processing',
          });
        },
      );

      // ドキュメントフォーマットコンテキストを構築
      const documentFormatContext = buildDocumentFormatContext(fileFormatInfos);

      // ファイル処理完了を通知
      publishEvent(IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS, {
        reviewHistoryId,
        currentFileName: '',
        currentFileIndex: files.length,
        totalFiles: files.length,
        phase: 'completed',
      });

      const checklistExtractionAgent = mastra.getAgent(
        'checklistExtractionAgent',
      );
      const outputSchema = z.object({
        isChecklistDocument: z
          .boolean()
          .describe('Whether the given source is a checklist document'),
        newChecklists: z
          .array(z.string().describe('Checklist item'))
          .describe('Newly extracted checklist items'),
      });

      // これまでに抽出したチェックリスト項目を蓄積する配列
      const accumulated: string[] = [];

      // 最大試行回数
      const MAX_ATTEMPTS = 5;
      let attempts = 0;

      while (attempts < MAX_ATTEMPTS) {
        let isCompleted = true;
        const runtimeContext =
          await createRuntimeContext<ChecklistExtractionAgentRuntimeContext>();
        // これまでに抽出したチェックリスト項目
        runtimeContext.set('extractedItems', accumulated);
        // ドキュメントフォーマットコンテキストを設定
        if (documentFormatContext) {
          runtimeContext.set('documentFormatContext', documentFormatContext);
        }
        const extractionResult = await checklistExtractionAgent.generateLegacy(
          message,
          {
            output: outputSchema,
            runtimeContext,
            abortSignal,
            maxRetries: 0, // リトライ回数を0に設定（社内AIモデルの利用制限対応）
            ...getModelSpecificGenerateOptions(runtimeContext),
            // AIの限界生成トークン数を超えた場合のエラーを回避するための設定
            experimental_repairText: async (options) => {
              isCompleted = false;
              const { text } = options;
              let repairedText = text;
              let deleteLastItemFlag = false;
              try {
                const lastChar = text.charAt(text.length - 1);
                if (lastChar === '"') {
                  repairedText = text + ']}';
                } else if (lastChar === ']') {
                  repairedText = text + '}';
                } else if (lastChar === ',') {
                  // 最後のカンマを削除してから ']} を追加
                  repairedText = text.slice(0, -1) + ']}';
                } else {
                  // その他のケースでは強制的に ']} を追加
                  repairedText = text + '"]}';
                  deleteLastItemFlag = true;
                }
                // JSONに変換してみて、エラーが出ないか確かめる
                // deleteLastItemFlagがtrueの場合は最後の項目を削除する
                const parsedJson = JSON.parse(repairedText) as z.infer<
                  typeof outputSchema
                >;
                if (deleteLastItemFlag) {
                  parsedJson.newChecklists.pop(); // 最後の項目を削除
                }
                repairedText = JSON.stringify(parsedJson);
              } catch (error) {
                console.error(
                  `チェックリスト抽出の修正に失敗しました: ${error}`,
                );
                throw internalError({
                  expose: true,
                  messageCode: 'REVIEW_CHECKLIST_EXTRACTION_OVER_MAX_TOKENS',
                });
              }
              return repairedText;
            },
          },
        );

        // チェックリストドキュメントでない場合はエラー
        if (!extractionResult.object.isChecklistDocument) {
          throw internalError({
            expose: true,
            messageCode: 'REVIEW_CHECKLIST_EXTRACTION_NOT_CHECKLIST_DOCUMENT',
          });
        }

        if (
          accumulated.length === 0 &&
          (!extractionResult.object.newChecklists ||
            extractionResult.object.newChecklists.length === 0)
        ) {
          throw internalError({
            expose: true,
            messageCode: 'AI_API_ERROR',
            messageParams: { detail: 'チェックリストが抽出されませんでした' },
          });
        }

        // 抽出されたチェックリストから新規のものを蓄積
        const newChecklists =
          extractionResult.object.newChecklists?.filter(
            (item: string) => !accumulated.includes(item),
          ) || [];
        accumulated.push(...newChecklists);

        // 抽出されたチェックリストをDBに保存
        for (const checklistItem of newChecklists) {
          await reviewRepository.createChecklist(
            reviewHistoryId,
            checklistItem,
            'system',
          );
        }
        // 抽出が完了した場合はループを抜ける
        if (isCompleted) {
          break;
        }
        attempts++;
        if (attempts >= MAX_ATTEMPTS) {
          throw internalError({
            expose: true,
            messageCode: 'REVIEW_CHECKLIST_EXTRACTION_OVER_MAX_TOKENS',
          });
        }
      }

      return {
        status: 'success' as stepStatus,
      };
    } catch (error) {
      logger.error(error, 'チェックリスト抽出処理に失敗しました');
      let errorMessage = '';
      if (
        NoObjectGeneratedError.isInstance(error) &&
        error.finishReason === 'length'
      ) {
        errorMessage =
          'AIの大量出力の補正に失敗しました、チェックリストをファイルの分割を検討してください';
      } else {
        const normalizedError = normalizeUnknownError(error);
        errorMessage = normalizedError.message;
      }
      return {
        status: 'failed' as stepStatus,
        errorMessage: errorMessage,
      };
    }
  },
});

// === 一般ドキュメント用ステップ群 ===

// Step1: トピック抽出ステップ
const topicExtractionStep = createStep({
  id: 'topicExtractionStep',
  description: '一般ドキュメントから独立したトピックを抽出するステップ',
  inputSchema: triggerSchema,
  outputSchema: topicExtractionStepOutputSchema,
  execute: async ({ inputData, mastra, bail, abortSignal }) => {
    const reviewRepository = getReviewRepository();
    const { files, reviewHistoryId, checklistRequirements } = inputData;

    try {
      // 複数ファイルを統合してトピックを抽出
      const { fileFormatInfos, ...message } = await createCombinedMessage(
        files,
        'Please extract topics from this document',
        (currentIndex, fileName) => {
          publishEvent(IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS, {
            reviewHistoryId,
            currentFileName: fileName,
            currentFileIndex: currentIndex,
            totalFiles: files.length,
            phase: 'processing',
          });
        },
      );

      // ファイル処理完了を通知
      publishEvent(IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS, {
        reviewHistoryId,
        currentFileName: '',
        currentFileIndex: files.length,
        totalFiles: files.length,
        phase: 'completed',
      });

      const topicExtractionAgent = mastra.getAgent('topicExtractionAgent');
      const outputSchema = z.object({
        topics: z
          .array(
            z.object({
              topic: z.string().describe('Extracted topic'),
              reason: z
                .string()
                .describe(
                  'The reason why that topic is necessary for creating checklist items',
                ),
            }),
          )
          .describe('Extracted topics from the document'),
      });
      const runtimeContext =
        await createRuntimeContext<TopicExtractionAgentRuntimeContext>();
      if (checklistRequirements) {
        runtimeContext.set('checklistRequirements', checklistRequirements);
      }

      // ドキュメントフォーマットコンテキストを設定
      const documentFormatContext = buildDocumentFormatContext(fileFormatInfos);
      if (documentFormatContext) {
        runtimeContext.set('documentFormatContext', documentFormatContext);
      }

      const extractionResult = await topicExtractionAgent.generateLegacy(
        message,
        {
          output: outputSchema,
          runtimeContext,
          abortSignal,
          maxRetries: 0, // リトライ回数を0に設定（社内AIモデルの利用制限対応）
          ...getModelSpecificGenerateOptions(runtimeContext),
        },
      );

      logger.debug(
        `Combined document extracted topics for creating checklist:`,
        JSON.stringify(extractionResult.object.topics, null, 2),
      );

      const allTopics = extractionResult.object.topics.map((t) => ({
        title: t.topic,
      }));

      // 既存のシステム作成チェックリストを削除
      await reviewRepository.deleteSystemCreatedChecklists(reviewHistoryId);

      return {
        status: 'success' as stepStatus,
        topics: allTopics,
      };
    } catch (error) {
      logger.error(error, 'チェックリスト作成のトピック抽出処理に失敗しました');
      const normalizedError = normalizeUnknownError(error);
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: normalizedError.message,
      });
    }
  },
});

// Step2: トピック別チェックリスト作成ステップ
const topicChecklistCreationStep = createStep({
  id: 'topicChecklistCreationStep',
  description: 'トピックに基づいてチェックリスト項目を作成するステップ',
  inputSchema: z.object({
    title: z.string(),
    files: triggerSchema.shape.files,
    reviewHistoryId: z.string(),
    checklistRequirements: z.string().optional(),
  }),
  outputSchema: topicChecklistStepOutputSchema,
  execute: async ({ inputData, mastra, bail, abortSignal }) => {
    const { title, files, reviewHistoryId, checklistRequirements } = inputData;

    try {
      // 複数ファイルを統合してメッセージを作成
      const { fileFormatInfos, ...message } = await createCombinedMessage(
        files,
        `Please create checklist items from this document for topic: ${title}`,
        (currentIndex, fileName) => {
          publishEvent(IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS, {
            reviewHistoryId,
            currentFileName: fileName,
            currentFileIndex: currentIndex,
            totalFiles: files.length,
            phase: 'processing',
          });
        },
      );

      // ファイル処理完了を通知
      publishEvent(IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS, {
        reviewHistoryId,
        currentFileName: '',
        currentFileIndex: files.length,
        totalFiles: files.length,
        phase: 'completed',
      });

      const topicChecklistAgent = mastra.getAgent('topicChecklistAgent');
      const outputSchema = z.object({
        checklistItems: z
          .array(
            z.object({
              checklistItem: z.string().describe('Checklist item'),
              reason: z
                .string()
                .describe(
                  'The reason why the checklist items based on the document are valuable',
                ),
            }),
          )
          .describe(
            'Generated checklist items for the given topic from the document',
          ),
      });

      const runtimeContext =
        await createRuntimeContext<TopicChecklistAgentRuntimeContext>();
      runtimeContext.set('topic', { title });
      if (checklistRequirements) {
        runtimeContext.set('checklistRequirements', checklistRequirements);
      }

      // ドキュメントフォーマットコンテキストを設定
      const documentFormatContext = buildDocumentFormatContext(fileFormatInfos);
      if (documentFormatContext) {
        runtimeContext.set('documentFormatContext', documentFormatContext);
      }

      const result = await topicChecklistAgent.generateLegacy(message, {
        output: outputSchema,
        runtimeContext,
        abortSignal,
        maxRetries: 0, // リトライ回数を0に設定（社内AIモデルの利用制限対応）
        ...getModelSpecificGenerateOptions(runtimeContext),
      });
      logger.debug(
        `Combined document topic(${title}) generated checklist items:`,
        JSON.stringify(result.object.checklistItems, null, 2),
      );

      if (
        !result.object.checklistItems ||
        result.object.checklistItems.length === 0
      ) {
        logger.error(
          `トピック「${title}」に対するチェックリスト項目が生成されませんでした`,
        );
        // 別トピックでも生成される可能性があるため、失敗とはせず成功で返す
        return {
          status: 'success' as stepStatus,
          checklistItems: [],
        };
      }

      // チェックリストをoutputとして返す（DB保存はchecklistRefinementStep完了後に行う）
      const checklistItems = result.object.checklistItems.map(
        (item) => item.checklistItem,
      );

      return {
        status: 'success' as stepStatus,
        checklistItems,
      };
    } catch (error) {
      logger.error(error, `チェックリスト作成処理に失敗しました: ${title}`);
      const normalizedError = normalizeUnknownError(error);
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: normalizedError.message,
      });
    }
  },
});

// Step3: チェックリスト統合ステップ
// const checklistIntegrationStep = createStep({
//   id: 'checklistIntegrationStep',
//   description: '各トピックから生成されたチェックリスト項目を統合するステップ',
//   inputSchema: z.object({
//     reviewHistoryId: z.string(),
//     allChecklistItems: z.array(z.string()),
//   }),
//   outputSchema: checklistIntegrationStepOutputSchema,
//   execute: async ({ inputData, mastra, bail }) => {
//     const { reviewHistoryId, allChecklistItems } = inputData;
//     const errorMessages: string[] = [
//       'チェックリスト作成処理中にエラーが発生しました',
//     ];

//     try {
//       const reviewRepository = getReviewRepository();

//       // 既存のシステム作成チェックリストを削除
//       await reviewRepository.deleteSystemCreatedChecklists(reviewHistoryId);

//       // const checklistIntegrationAgent = mastra.getAgent('checklistIntegrationAgent');
//       // const outputSchema = z.object({
//       //   integratedItems: z.array(z.string().describe('Integrated and deduplicated checklist item'))
//       //     .describe('Final integrated checklist items'),
//       // });

//       // const allItemsText = allChecklistItems.join('\n- ');

//       // const result = await checklistIntegrationAgent.generateLegacy(
//       //   allItemsText,
//       //   {
//       //     output: outputSchema,
//       //   },
//       // );

//       // if (!result.object.integratedItems || result.object.integratedItems.length === 0) {
//       //   return {
//       //     status: 'failed' as stepStatus,
//       //     errorMessage: 'チェックリスト項目の統合に失敗しました',
//       //   };
//       // }

//       // 統合されたチェックリストをDBに保存
//       for (const checklistItem of allChecklistItems) {
//         await reviewRepository.createChecklist(
//           reviewHistoryId,
//           checklistItem,
//           'system',
//         );
//       }

//       return {
//         status: 'success' as stepStatus,
//       };
//     } catch (error) {
//       if (error instanceof Error && error.message) {
//         if (errorMessages.length > 1) {
//           errorMessages.push(''); // エラーメッセージの区切り
//         }
//         errorMessages.push(`${error.message}`);
//       }
//       return bail({
//         status: 'failed' as stepStatus,
//         errorMessage: errorMessages.join('\n'),
//       });
//     }
//   },
// });

// Step3: チェックリストブラッシュアップステップ（重複削除・結合）
const checklistRefinementStep = createStep({
  id: 'checklistRefinementStep',
  description:
    '抽出されたチェックリスト項目を重複削除・結合してブラッシュアップするステップ',
  inputSchema: z.object({
    reviewHistoryId: z.string(),
    checklistRequirements: z.string().optional(),
    systemChecklists: z.array(z.string()),
  }),
  outputSchema: checklistRefinementStepOutputSchema,
  execute: async ({ inputData, mastra, bail, abortSignal }) => {
    const { reviewHistoryId, checklistRequirements, systemChecklists } =
      inputData;
    const reviewRepository = getReviewRepository();

    try {
      // チェックリストがない場合は成功で返す
      if (systemChecklists.length === 0) {
        return {
          status: 'success' as stepStatus,
          refinedItems: [],
        };
      }

      // AIでブラッシュアップ実行
      const checklistRefinementAgent = mastra.getAgent(
        'checklistRefinementAgent',
      );
      const outputSchema = z.object({
        refinedChecklists: z
          .array(z.string().describe('Refined checklist item'))
          .describe('Refined and consolidated checklist items'),
      });

      // これまでにブラッシュアップしたチェックリスト項目を蓄積する配列
      const accumulated: string[] = [];

      // 最大試行回数
      const MAX_ATTEMPTS = 5;
      let attempts = 0;

      while (attempts < MAX_ATTEMPTS) {
        let isCompleted = true;
        const runtimeContext =
          await createRuntimeContext<ChecklistRefinementAgentRuntimeContext>();
        // ユーザのチェックリスト生成要件を設定（指定されている場合）
        if (checklistRequirements) {
          runtimeContext.set('checklistRequirements', checklistRequirements);
        }

        // userプロンプトに全チェックリスト情報を含める
        const userPrompt = `ORIGINAL CHECKLIST ITEMS TO REFINE (${systemChecklists.length} items):
${systemChecklists.map((item, i) => `${i + 1}. ${item}`).join('\n')}

${
  accumulated.length > 0
    ? `ALREADY REFINED ITEMS (${accumulated.length} items):
${accumulated.map((item, i) => `${i + 1}. ${item}`).join('\n')}

Please continue refining the remaining items, avoiding duplicates with already refined items.`
    : 'Please refine these checklist items according to the guidelines.'
}`;

        const refinementResult = await checklistRefinementAgent.generateLegacy(
          userPrompt,
          {
            output: outputSchema,
            runtimeContext,
            abortSignal,
            maxRetries: 0, // リトライ回数を0に設定（社内AIモデルの利用制限対応）
            ...getModelSpecificGenerateOptions(runtimeContext),
            // AIの限界生成トークン数を超えた場合のエラーを回避するための設定
            experimental_repairText: async (options) => {
              isCompleted = false;
              const { text } = options;
              let repairedText = text;
              let deleteLastItemFlag = false;
              try {
                const lastChar = text.charAt(text.length - 1);
                if (lastChar === '"') {
                  repairedText = text + ']}';
                } else if (lastChar === ']') {
                  repairedText = text + '}';
                } else if (lastChar === ',') {
                  // 最後のカンマを削除してから ']} を追加
                  repairedText = text.slice(0, -1) + ']}';
                } else {
                  // その他のケースでは強制的に ']} を追加
                  repairedText = text + '"]}';
                  deleteLastItemFlag = true;
                }
                // JSONに変換してみて、エラーが出ないか確かめる
                // deleteLastItemFlagがtrueの場合は最後の項目を削除する
                const parsedJson = JSON.parse(repairedText) as z.infer<
                  typeof outputSchema
                >;
                if (deleteLastItemFlag) {
                  parsedJson.refinedChecklists.pop(); // 最後の項目を削除
                }
                repairedText = JSON.stringify(parsedJson);
              } catch (error) {
                console.error(
                  `チェックリストブラッシュアップの修正に失敗しました: ${error}`,
                );
                throw internalError({
                  expose: true,
                  messageCode: 'REVIEW_CHECKLIST_REFINEMENT_OVER_MAX_TOKENS',
                });
              }
              return repairedText;
            },
          },
        );

        // ブラッシュアップされたチェックリストから新規のものを蓄積
        const newRefinedItems =
          refinementResult.object.refinedChecklists?.filter(
            (item: string) => !accumulated.includes(item),
          ) || [];
        accumulated.push(...newRefinedItems);

        // ブラッシュアップが完了した場合はループを抜ける
        if (isCompleted) {
          break;
        }
        attempts++;
        if (attempts >= MAX_ATTEMPTS) {
          throw internalError({
            expose: true,
            messageCode: 'REVIEW_CHECKLIST_REFINEMENT_OVER_MAX_TOKENS',
          });
        }
      }

      // ブラッシュアップ後のチェックリストをDBに保存
      for (const refinedItem of accumulated) {
        await reviewRepository.createChecklist(
          reviewHistoryId,
          refinedItem,
          'system',
        );
      }

      logger.debug(
        `チェックリストブラッシュアップ完了: ${systemChecklists.length}件 → ${accumulated.length}件`,
      );

      return {
        status: 'success' as stepStatus,
        refinedItems: accumulated,
      };
    } catch (error) {
      logger.error(error, 'チェックリストブラッシュアップ処理に失敗しました');
      const normalizedError = normalizeUnknownError(error);
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: normalizedError.message,
      });
    }
  },
});

// === メインワークフロー ===

export const checklistExtractionWorkflow = createWorkflow({
  id: 'checklistExtractionWorkflow',
  inputSchema: triggerSchema,
  outputSchema: baseStepOutputSchema,
})
  .branch([
    // チェックリストドキュメントの場合
    [
      async ({ inputData }) => inputData.documentType === 'checklist-ai',
      checklistDocumentExtractionStep,
    ],
    // 一般ドキュメントの場合
    [
      async ({ inputData }) => inputData.documentType === 'general',
      createWorkflow({
        id: 'generalDocumentWorkflow',
        inputSchema: triggerSchema,
        outputSchema: baseStepOutputSchema,
      })
        // Step1: トピック抽出
        .then(topicExtractionStep)
        .map(async ({ getInitData, getStepResult }) => {
          const topicResult = getStepResult(topicExtractionStep);
          const initData = getInitData();

          // 前ステップでエラーの場合はbailで早期終了させているため、ここに来るのは成功時のみの想定
          if (topicResult?.status !== 'success' || !topicResult.topics) {
            throw new Error(
              topicResult?.errorMessage || 'トピック抽出に失敗しました',
            );
          }

          return topicResult.topics.map((topic) => ({
            title: topic.title,
            files: initData.files, // 統合されたファイル群を渡す
            reviewHistoryId: initData.reviewHistoryId,
            checklistRequirements: initData.checklistRequirements,
          }));
        })
        // Step2: 各トピックに対してチェックリスト作成（foreachでループ）
        .foreach(topicChecklistCreationStep)
        // Step3用入力データ変換（foreachの結果を統合してchecklistRefinementStepに渡す）
        .map(async ({ inputData, getInitData }) => {
          const initData = getInitData();
          // foreachの結果は配列で、各要素がtopicChecklistCreationStepのoutput
          // checklistItemsを統合する
          const allChecklistItems = (
            inputData as { checklistItems?: string[] }[]
          ).flatMap((topicResult) => topicResult.checklistItems || []);
          return {
            reviewHistoryId: initData.reviewHistoryId,
            checklistRequirements: initData.checklistRequirements,
            systemChecklists: allChecklistItems,
          };
        })
        // Step3: チェックリストブラッシュアップ（重複削除・結合）
        .then(checklistRefinementStep)
        .commit(),
    ],
  ])
  .commit();
