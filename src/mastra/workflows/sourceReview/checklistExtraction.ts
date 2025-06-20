import { APICallError, NoObjectGeneratedError } from 'ai';
import { Step, Workflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import path from 'path';
import { getReviewRepository } from '../../../db/repository/reviewRepository';
import { getSourceRepository } from '../../../db/repository/sourceRepository';
import { getChecklistExtractionPrompt } from '../../agents/prompts';
import { Source } from '../../../db/schema';
import FileExtractor from '../../../main/utils/fileExtractor';
import { baseStepOutputSchema } from '../schema';
import { stepStatus } from '../types';
import openAICompatibleModel from '../../agents/model/openAICompatible';

// ワークフローの入力スキーマ
const triggerSchema = z.object({
  reviewHistoryId: z.string().describe('レビュー履歴ID'),
  sourceIds: z
    .array(z.number())
    .describe('チェックリストを抽出するソースのIDリスト'),
});

const checklistExtractionStep = new Step({
  id: 'checklistExtractionStep',
  description: '各ソースからチェックリストを抽出するステップ',
  outputSchema: baseStepOutputSchema,
  execute: async ({ context }) => {
    // レビュー用のリポジトリを取得
    const reviewRepository = getReviewRepository();
    const sourceRepository = getSourceRepository();
    // トリガーから入力を取得
    const { reviewHistoryId, sourceIds } = context.triggerData as z.infer<
      typeof triggerSchema
    >;
    const errorMessages: string[] = [
      'チェックリスト抽出処理で以下エラーが発生しました',
    ];

    try {
      // 既存のシステム作成チェックリストを削除
      await reviewRepository.deleteSystemCreatedChecklists(reviewHistoryId);

      // 各ソースを並行して処理
      const extractionPromises = sourceIds.map(async (sourceId) => {
        let source: Source | null = null;
        try {
          source = await sourceRepository.getSourceById(sourceId);

          if (source === null) {
            throw new Error(`ソースID ${sourceId} が見つかりません`);
          }

          // ファイル内容を抽出
          const { content } = await FileExtractor.extractText(source.path);

          const checklistExtractionAgent = new Agent({
            name: 'checklistExtractionAgent',
            instructions: '',
            model: openAICompatibleModel(),
          });
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
            const extractionResult = await checklistExtractionAgent.generate(
              content,
              {
                output: outputSchema,
                instructions: getChecklistExtractionPrompt(accumulated),
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
                    throw new Error(
                      'チェックリストの抽出結果がAIモデルの最大出力トークン数を超え、不正な出力となった為修正を試みましたが失敗しました。抽出結果が最大出力トークン内に収まるようにチェックリストのファイル分割を検討してください。',
                    );
                  }
                  return repairedText;
                },
              },
            );

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
            const newChecklists = extractionResult.object.newChecklists.filter(
              (item) => !accumulated.includes(item),
            );
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
          if (APICallError.isInstance(error)) {
            // APIコールエラーの場合はresponseBodyの内容を取得
            errorDetail = error.message;
            if (error.responseBody) {
              errorDetail += `:\n${error.responseBody}`;
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
          if (source) {
            errorMessage += `- ${path.basename(source.path)}のチェックリスト抽出でエラー: ${errorDetail}`;
          } else {
            errorMessage += `- チェックリスト抽出処理でエラーが発生しました: ${errorDetail}`;
          }
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

/**
 * 各ソースからチェックリストを抽出するワークフロー
 */
export const checklistExtractionWorkflow = new Workflow({
  name: 'checklistExtractionWorkflow',
  triggerSchema,
});

// ワークフローを構築
// eslint-disable-next-line
checklistExtractionWorkflow.step(checklistExtractionStep).commit();
