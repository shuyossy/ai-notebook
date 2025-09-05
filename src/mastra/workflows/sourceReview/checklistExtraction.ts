/* eslint-disable prefer-template */
import { APICallError, NoObjectGeneratedError } from 'ai';
// @ts-ignore
import { createStep, createWorkflow } from '@mastra/core/workflows';
// @ts-ignore
import { MastraError } from '@mastra/core/error';
import { z } from 'zod';
import { getReviewRepository } from '@/db/repository/reviewRepository';
import { getSourceRepository } from '@/db/repository/sourceRepository';
import FileExtractor from '@/main/lib/fileExtractor';
import { baseStepOutputSchema } from '../schema';
import { stepStatus } from '../types';
import {
  ChecklistExtractionAgentRuntimeContext,
  TopicExtractionAgentRuntimeContext,
  TopicChecklistAgentRuntimeContext,
} from '../../agents/workflowAgents';
import { createRuntimeContext } from '../../agents/lib';
import { UploadFile } from '@/types';

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
        pdfProcessMode: z.enum(['text', 'image']).optional(),
        pdfImageMode: z.enum(['merged', 'pages']).optional(),
        imageData: z.array(z.string()).optional(),
      }),
    )
    .describe('アップロードファイルのリスト'),
  documentType: z
    .enum(['checklist', 'general'])
    .default('checklist')
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
        file: triggerSchema.shape.files.element,
        content: z.string().optional(),
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

// === チェックリストドキュメント用ステップ ===

const checklistDocumentExtractionStep = createStep({
  id: 'checklistDocumentExtractionStep',
  description: 'チェックリストドキュメントから既存項目を抽出するステップ',
  inputSchema: triggerSchema,
  outputSchema: checklistDocumentStepOutputSchema,
  execute: async ({ inputData, mastra }) => {
    // レビュー用のリポジトリを取得
    const reviewRepository = getReviewRepository();
    const sourceRepository = getSourceRepository();
    // トリガーから入力を取得
    const { reviewHistoryId, files } = inputData;
    const errorMessages: string[] = [
      'チェックリスト抽出処理中に以下エラーが発生しました',
    ];

    try {
      // 既存のシステム作成チェックリストを削除
      await reviewRepository.deleteSystemCreatedChecklists(reviewHistoryId);

      // 各ファイルを並行して処理
      const extractionPromises = files.map(async (file: UploadFile) => {
        try {
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

          let message;

          // PDFで画像として処理する場合
          if (
            file.type === 'application/pdf' &&
            file.pdfProcessMode === 'image' &&
            file.imageData &&
            file.imageData.length > 0
          ) {
            if (file.imageData.length > 1) {
              // ページ別画像モード: すべてのページを含むメッセージを作成
              const imageMessage = {
                role: 'user' as const,
                content: [
                  {
                    type: 'text' as const,
                    text: `Please extract checklist items from this document: ${file.name} (All ${file.imageData.length} pages)`,
                  },
                  // すべてのページ画像を含める
                  ...file.imageData.map((imageData) => ({
                    type: 'image' as const,
                    image: imageData,
                    mimeType: 'image/png',
                  })),
                ],
              };

              message = imageMessage;
            } else {
              // 統合画像モード: 単一メッセージ
              const imageMessage = {
                role: 'user' as const,
                content: [
                  {
                    type: 'text' as const,
                    text: `Please extract checklist items from this document: ${file.name}`,
                  },
                  {
                    type: 'image' as const,
                    image: file.imageData[0],
                    mimeType: 'image/png',
                  },
                ],
              };

              message = imageMessage;
            }
            // 画像化PDF以外はテキスト抽出処理
          } else {
            // テキスト抽出処理
            const { content } = await FileExtractor.extractText(file.path, {
              useCache: false,
            });
            message = content;
          }

          // 最大試行回数
          const MAX_ATTEMPTS = 5;
          let attempts = 0;

          while (attempts < MAX_ATTEMPTS) {
            let isCompleted = true;
            const runtimeContext =
              createRuntimeContext<ChecklistExtractionAgentRuntimeContext>();
            // これまでに抽出したチェックリスト項目
            runtimeContext.set('extractedItems', accumulated);
            const extractionResult = await checklistExtractionAgent.generate(
              message,
              {
                output: outputSchema,
                runtimeContext,
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
                    throw new Error(
                      'チェックリストの抽出結果がAIモデルの最大出力トークン数を超え、不正な出力となった為修正を試みましたが失敗しました。抽出結果が最大出力トークン内に収まるようにチェックリストのファイル分割を検討してください。',
                    );
                  }
                  return repairedText;
                },
              },
            );

            // チェックリストドキュメントでない場合はエラー
            if (!extractionResult.object.isChecklistDocument) {
              throw new Error(
                `チェックリスト抽出に適さないドキュメントとして判定されたため処理を終了しました`,
              );
            }

            if (
              accumulated.length === 0 &&
              (!extractionResult.object.newChecklists ||
                extractionResult.object.newChecklists.length === 0)
            ) {
              throw new Error(`チェックリストが抽出されませんでした`);
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
              throw new Error(
                `チェックリスト抽出処理の実行回数が一定数を超えました。チェックリストのファイル分割を検討してください。`,
              );
            }
          }
        } catch (error) {
          let errorMessage = '';
          let errorDetail: string;
          if (
            error instanceof MastraError &&
            APICallError.isInstance(error.cause)
          ) {
            // APIコールエラーの場合はresponseBodyの内容を取得
            errorDetail = error.cause.message;
            if (error.cause.responseBody) {
              errorDetail += `:\n${error.cause.responseBody}`;
            }
          } else if (
            NoObjectGeneratedError.isInstance(error) &&
            error.finishReason === 'length'
          ) {
            errorDetail =
              'AIモデルが生成できる文字数を超えています。チェックリストをファイル分割して再実行してください。';
          } else if (error instanceof Error) {
            errorDetail = error.message;
          } else {
            errorDetail = JSON.stringify(error);
          }
          errorMessage += `- ${file.name}のチェックリスト抽出でエラー: ${errorDetail}`;
          errorMessages.push(errorMessage);
        }
      });

      // 全ての抽出処理が完了するまで待機
      await Promise.all(extractionPromises);

      // エラーがあれば失敗として返す
      if (errorMessages.length > 1) {
        return {
          status: 'failed' as stepStatus,
          errorMessage: errorMessages.join('\n'),
        };
      }

      return {
        status: 'success' as stepStatus,
      };
    } catch (error) {
      if (error instanceof Error && error.message) {
        if (errorMessages.length > 1) {
          errorMessages.push(''); // エラーメッセージの区切り
        }
        errorMessages.push(`${error.message}`);
      }
      return {
        status: 'failed' as stepStatus,
        errorMessage: errorMessages.join('\n'),
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
  execute: async ({ inputData, mastra, bail }) => {
    const reviewRepository = getReviewRepository();
    const { files, reviewHistoryId, checklistRequirements } = inputData;
    const errorMessages: string[] = [
      'チェックリスト作成処理中にエラーが発生しました',
    ];

    try {
      const allTopics: Array<{
        title: string;
        file: z.infer<typeof triggerSchema.shape.files.element>;
        content?: string;
      }> = [];

      // 各ファイルからトピックを抽出
      const extractionPromises = files.map(async (file: UploadFile) => {
        try {
          let message;
          let outputContent: string | undefined = undefined;

          // PDFで画像として処理する場合
          if (
            file.type === 'application/pdf' &&
            file.pdfProcessMode === 'image' &&
            file.imageData &&
            file.imageData.length > 0
          ) {
            if (file.imageData.length > 1) {
              // ページ別画像モード: すべてのページを含むメッセージを作成
              const imageMessage = {
                role: 'user' as const,
                content: [
                  {
                    type: 'text' as const,
                    text: `Please extract topics from this document: ${file.name} (All ${file.imageData.length} pages)`,
                  },
                  // すべてのページ画像を含める
                  ...file.imageData.map((imageData) => ({
                    type: 'image' as const,
                    image: imageData,
                    mimeType: 'image/png',
                  })),
                ],
              };
              message = imageMessage;
            } else {
              // 統合画像モード: 単一メッセージ
              const imageMessage = {
                role: 'user' as const,
                content: [
                  {
                    type: 'text' as const,
                    text: `Please extract topics from this document: ${file.name}`,
                  },
                  {
                    type: 'image' as const,
                    image: file.imageData[0],
                    mimeType: 'image/png',
                  },
                ],
              };
              message = imageMessage;
            }
          } else {
            // テキスト抽出処理
            const { content } = await FileExtractor.extractText(file.path, {
              useCache: false,
            });
            message = content;
            outputContent = content;
          }

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
            createRuntimeContext<TopicExtractionAgentRuntimeContext>();
          if (checklistRequirements) {
            runtimeContext.set('checklistRequirements', checklistRequirements);
          }

          const extractionResult = await topicExtractionAgent.generate(
            message,
            {
              output: outputSchema,
              runtimeContext,
            },
          );

          mastra
            .getLogger()
            .debug(
              `document(${file.name}) extracted topics for creating checklist:`,
              JSON.stringify(extractionResult.object.topics, null, 2),
            );

          allTopics.push(
            ...extractionResult.object.topics.map((t) => ({
              title: t.topic,
              file,
              content: outputContent,
            })),
          );
        } catch (error) {
          let errorDetail: string;
          if (error instanceof Error) {
            errorDetail = error.message;
          } else {
            errorDetail = JSON.stringify(error);
          }
          errorMessages.push(
            `- ${file.name}のトピック抽出でエラー: ${errorDetail}`,
          );
        }
      });

      await Promise.all(extractionPromises);

      // エラーがあれば失敗として返す
      if (errorMessages.length > 1) {
        return bail({
          status: 'failed' as stepStatus,
          errorMessage: errorMessages.join('\n'),
        });
      }

      if (allTopics.length === 0) {
        return bail({
          status: 'failed' as stepStatus,
          errorMessage: 'トピックが抽出されませんでした',
        });
      }

      // 既存のシステム作成チェックリストを削除
      await reviewRepository.deleteSystemCreatedChecklists(reviewHistoryId);

      return {
        status: 'success' as stepStatus,
        topics: allTopics,
      };
    } catch (error) {
      if (error instanceof Error && error.message) {
        if (errorMessages.length > 1) {
          errorMessages.push(''); // エラーメッセージの区切り
        }
        errorMessages.push(`${error.message}`);
      }
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: errorMessages.join('\n'),
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
    file: triggerSchema.shape.files.element,
    content: z.string().optional(),
    reviewHistoryId: z.string(),
    checklistRequirements: z.string().optional(),
  }),
  outputSchema: topicChecklistStepOutputSchema,
  execute: async ({ inputData, mastra, bail }) => {
    const { title, file, content, reviewHistoryId, checklistRequirements } =
      inputData;
    const reviewRepository = getReviewRepository();
    const errorMessages: string[] = [
      'チェックリスト作成処理中にエラーが発生しました',
    ];

    try {
      let message;

      // PDFで画像として処理する場合
      if (
        file.type === 'application/pdf' &&
        file.pdfProcessMode === 'image' &&
        file.imageData &&
        file.imageData.length > 0
      ) {
        if (file.imageData.length > 1) {
          // ページ別画像モードの場合、すべてのページを統合したメッセージを作成
          // (このステップでは特定のトピックに基づいてチェックリスト作成するため、全ページを含める)
          const imageMessage = {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: `Please create checklist items from this document: ${file.name} (All ${file.imageData.length} pages) for topic: ${title}`,
              },
              // すべてのページ画像を含める
              ...file.imageData.map((imageData) => ({
                type: 'image' as const,
                image: imageData,
                mimeType: 'image/png',
              })),
            ],
          };
          message = imageMessage;
        } else {
          // 統合画像モード: 単一メッセージ
          const imageMessage = {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: `Please create checklist items from this document: ${file.name}`,
              },
              {
                type: 'image' as const,
                image: file.imageData[0],
                mimeType: 'image/png',
              },
            ],
          };
          message = imageMessage;
        }
      } else {
        // テキスト抽出処理
        message = content!;
      }
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
        createRuntimeContext<TopicChecklistAgentRuntimeContext>();
      runtimeContext.set('topic', { title });
      if (checklistRequirements) {
        runtimeContext.set('checklistRequirements', checklistRequirements);
      }

      const result = await topicChecklistAgent.generate(message, {
        output: outputSchema,
        runtimeContext,
      });
      mastra
        .getLogger()
        .debug(
          `document(${file.name}) topic(${title}) generated checklist items:`,
          JSON.stringify(result.object.checklistItems, null, 2),
        );

      if (
        !result.object.checklistItems ||
        result.object.checklistItems.length === 0
      ) {
        return bail({
          status: 'failed' as stepStatus,
          errorMessage: `トピック「${title}」に対するチェックリスト項目が生成されませんでした`,
        });
      }

      // 抽出されたチェックリストをDBに保存
      for (const c of result.object.checklistItems) {
        await reviewRepository.createChecklist(
          reviewHistoryId,
          c.checklistItem,
          'system',
        );
      }

      return {
        status: 'success' as stepStatus,
        checklistItems: result.object.checklistItems.map(
          (item) => item.checklistItem,
        ),
      };
    } catch (error) {
      if (error instanceof Error && error.message) {
        if (errorMessages.length > 1) {
          errorMessages.push(''); // エラーメッセージの区切り
        }
        errorMessages.push(`トピック「${title}」: ${error.message}`);
      }
      return bail({
        status: 'failed' as stepStatus,
        errorMessage: errorMessages.join('\n'),
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

//       // const result = await checklistIntegrationAgent.generate(
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

// === メインワークフロー ===

export const checklistExtractionWorkflow = createWorkflow({
  id: 'checklistExtractionWorkflow',
  inputSchema: triggerSchema,
  outputSchema: baseStepOutputSchema,
})
  .branch([
    // チェックリストドキュメントの場合
    [
      async ({ inputData }) => inputData.documentType === 'checklist',
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
            file: topic.file,
            content: topic.content,
            reviewHistoryId: initData.reviewHistoryId,
            checklistRequirements: initData.checklistRequirements,
          }));
        })
        // Step2: 各トピックに対してチェックリスト作成（foreachでループ）
        .foreach(topicChecklistCreationStep)
        // Step2でDB保存を行うため、Step3はコメントアウト
        // .map(async ({ getInitData, inputData }) => {
        //   const initData = getInitData();
        //   const allChecklistItems = inputData
        //     .map((i) => {
        //       if (i.status !== 'success' || !i.checklistItems) {
        //         throw new Error(
        //           i?.errorMessage ||
        //             'トピック別チェックリスト作成に失敗しました',
        //         );
        //       }
        //       return i.checklistItems;
        //     })
        //     .flat();

        //   return {
        //     reviewHistoryId: initData.reviewHistoryId,
        //     allChecklistItems,
        //   };
        // })
        // // Step3: チェックリスト統合(保存)
        // .then(checklistIntegrationStep)
        .commit(),
    ],
  ])
  .commit();
