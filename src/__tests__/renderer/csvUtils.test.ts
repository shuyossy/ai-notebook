/**
 * csvUtils.ts のテスト
 */
import { convertReviewResultsToCSV } from '@/renderer/lib/csvUtils';
import type { ReviewChecklistResult, RevieHistory } from '@/types';

describe('convertReviewResultsToCSV', () => {
  describe('正常系', () => {
    test('チェックリストのみの場合、正しくCSV形式に変換されること', () => {
      const checklistResults: ReviewChecklistResult[] = [
        {
          id: 1,
          content: 'チェック項目1',
          sourceEvaluation: {
            evaluation: 'A',
            comment: '良好です',
          },
        },
        {
          id: 2,
          content: 'チェック項目2',
          sourceEvaluation: {
            evaluation: 'B',
            comment: '改善が必要',
          },
        },
      ];

      const result = convertReviewResultsToCSV(checklistResults);

      const lines = result.split('\n');
      expect(lines).toHaveLength(3); // ヘッダー + 2データ行

      // ヘッダー行の確認
      expect(lines[0]).toBe(
        'チェックリスト,評定結果,レビュー結果,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID',
      );

      // 1行目のデータ確認
      expect(lines[1]).toBe('チェック項目1,A,良好です,,,,,,,');

      // 2行目のデータ確認
      expect(lines[2]).toBe('チェック項目2,B,改善が必要,,,,,,,');
    });

    test('評定結果がない場合、評定結果とレビュー結果が空文字になること', () => {
      const checklistResults: ReviewChecklistResult[] = [
        {
          id: 1,
          content: 'チェック項目1',
        },
      ];

      const result = convertReviewResultsToCSV(checklistResults);

      const lines = result.split('\n');
      expect(lines[1]).toBe('チェック項目1,,,,,,,,,');
    });

    test('評定設定がある場合、各行に分散配置されること', () => {
      const checklistResults: ReviewChecklistResult[] = [
        {
          id: 1,
          content: 'チェック項目1',
          sourceEvaluation: {
            evaluation: 'A',
            comment: '良好です',
          },
        },
        {
          id: 2,
          content: 'チェック項目2',
        },
      ];

      const reviewHistory: RevieHistory = {
        id: 'review-1',
        title: 'テストレビュー',
        targetDocumentName: 'test.pdf',
        additionalInstructions: null,
        commentFormat: null,
        evaluationSettings: {
          items: [
            { label: 'A', description: '基準を満たす' },
            { label: 'B', description: '一部改善が必要' },
            { label: 'C', description: '基準未達' },
          ],
        },
        processingStatus: 'idle',
        createdAt: '2025-05-01T12:00:00.000Z',
        updatedAt: '2025-05-01T12:00:00.000Z',
      };

      const result = convertReviewResultsToCSV(checklistResults, reviewHistory);

      const lines = result.split('\n');
      expect(lines).toHaveLength(4); // ヘッダー + 3データ行（評定設定が3つあるため）

      // 1行目: チェック項目1 + 評定設定A
      expect(lines[1]).toBe('チェック項目1,A,良好です,A,基準を満たす,,,,,');

      // 2行目: チェック項目2 + 評定設定B
      expect(lines[2]).toBe('チェック項目2,,,B,一部改善が必要,,,,,');

      // 3行目: 評定設定Cのみ
      expect(lines[3]).toBe(',,,C,基準未達,,,,,');
    });

    test('追加指示、コメントフォーマット、API設定が1行目に配置されること', () => {
      const checklistResults: ReviewChecklistResult[] = [
        {
          id: 1,
          content: 'チェック項目1',
          sourceEvaluation: {
            evaluation: 'A',
            comment: '良好です',
          },
        },
        {
          id: 2,
          content: 'チェック項目2',
        },
      ];

      const reviewHistory: RevieHistory = {
        id: 'review-1',
        title: 'テストレビュー',
        targetDocumentName: 'test.pdf',
        additionalInstructions: '厳格にレビューすること',
        commentFormat: '評価理由を記載', // 改行なし
        evaluationSettings: {
          items: [{ label: 'A', description: '基準を満たす' }],
        },
        processingStatus: 'idle',
        createdAt: '2025-05-01T12:00:00.000Z',
        updatedAt: '2025-05-01T12:00:00.000Z',
      };

      const apiSettings = {
        url: 'http://localhost:11434/v1',
        key: 'test-api-key',
        model: 'llama3',
      };

      const result = convertReviewResultsToCSV(
        checklistResults,
        reviewHistory,
        apiSettings,
      );

      // CSV全体を文字列として確認（改行を含む場合があるため）
      expect(result).toContain('厳格にレビューすること');
      expect(result).toContain('評価理由を記載');
      expect(result).toContain('http://localhost:11434/v1');
      expect(result).toContain('test-api-key');
      expect(result).toContain('llama3');

      // 2行目以降は設定が空であることを確認
      const lines = result.split('\n');
      const lastLine = lines[lines.length - 1];
      expect(lastLine).toBe('チェック項目2,,,,,,,,,');
    });

    test('CSV特殊文字のエスケープが正しく行われること', () => {
      const checklistResults: ReviewChecklistResult[] = [
        {
          id: 1,
          content: 'テスト項目,カンマ含む',
          sourceEvaluation: {
            evaluation: 'A',
            comment: 'カンマ,を含むコメント',
          },
        },
        {
          id: 2,
          content: 'ダブルクォート"含む',
          sourceEvaluation: {
            evaluation: 'B',
            comment: 'クォート"含むコメント',
          },
        },
      ];

      const result = convertReviewResultsToCSV(checklistResults);

      // CSV全体で特殊文字のエスケープを確認
      // カンマを含む場合はクォートで囲まれる
      expect(result).toContain('"テスト項目,カンマ含む"');
      expect(result).toContain('"カンマ,を含むコメント"');

      // ダブルクォートを含む場合はエスケープされてクォートで囲まれる
      expect(result).toContain('"ダブルクォート""含む"');
      expect(result).toContain('"クォート""含むコメント"');
    });

    test('チェックリスト数より評定設定数が多い場合、評定設定のみの行が追加されること', () => {
      const checklistResults: ReviewChecklistResult[] = [
        {
          id: 1,
          content: 'チェック項目1',
        },
      ];

      const reviewHistory: RevieHistory = {
        id: 'review-1',
        title: 'テストレビュー',
        targetDocumentName: 'test.pdf',
        additionalInstructions: null,
        commentFormat: null,
        evaluationSettings: {
          items: [
            { label: 'A', description: '優秀' },
            { label: 'B', description: '良好' },
            { label: 'C', description: '要改善' },
          ],
        },
        processingStatus: 'idle',
        createdAt: '2025-05-01T12:00:00.000Z',
        updatedAt: '2025-05-01T12:00:00.000Z',
      };

      const result = convertReviewResultsToCSV(checklistResults, reviewHistory);

      const lines = result.split('\n');
      expect(lines).toHaveLength(4); // ヘッダー + 3データ行

      // 1行目: チェック項目1 + 評定A
      expect(lines[1]).toContain('チェック項目1');
      expect(lines[1]).toContain('A');

      // 2行目: 評定Bのみ
      expect(lines[2]).toBe(',,,B,良好,,,,,');

      // 3行目: 評定Cのみ
      expect(lines[3]).toBe(',,,C,要改善,,,,,');
    });
  });

  describe('異常系・エッジケース', () => {
    test('空のチェックリストの場合、ヘッダーのみ返されること', () => {
      const checklistResults: ReviewChecklistResult[] = [];

      const result = convertReviewResultsToCSV(checklistResults);

      const lines = result.split('\n');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe(
        'チェックリスト,評定結果,レビュー結果,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID',
      );
    });

    test('reviewHistoryがnullの場合、エラーにならないこと', () => {
      const checklistResults: ReviewChecklistResult[] = [
        {
          id: 1,
          content: 'チェック項目1',
        },
      ];

      const result = convertReviewResultsToCSV(checklistResults, null);

      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toBe('チェック項目1,,,,,,,,,');
    });

    test('apiSettingsがundefinedの場合、エラーにならないこと', () => {
      const checklistResults: ReviewChecklistResult[] = [
        {
          id: 1,
          content: 'チェック項目1',
        },
      ];

      const result = convertReviewResultsToCSV(
        checklistResults,
        undefined,
        undefined,
      );

      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toBe('チェック項目1,,,,,,,,,');
    });

    test('評定設定が空配列の場合、エラーにならないこと', () => {
      const checklistResults: ReviewChecklistResult[] = [
        {
          id: 1,
          content: 'チェック項目1',
        },
      ];

      const reviewHistory: RevieHistory = {
        id: 'review-1',
        title: 'テストレビュー',
        targetDocumentName: 'test.pdf',
        additionalInstructions: null,
        commentFormat: null,
        evaluationSettings: {
          items: [],
        },
        processingStatus: 'idle',
        createdAt: '2025-05-01T12:00:00.000Z',
        updatedAt: '2025-05-01T12:00:00.000Z',
      };

      const result = convertReviewResultsToCSV(checklistResults, reviewHistory);

      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toBe('チェック項目1,,,,,,,,,');
    });
  });

  describe('複雑なシナリオ', () => {
    test('すべての機能を統合した複雑なケース', () => {
      const checklistResults: ReviewChecklistResult[] = [
        {
          id: 1,
          content: 'セキュリティチェック,重要',
          sourceEvaluation: {
            evaluation: 'A',
            comment: '問題なし',
          },
        },
        {
          id: 2,
          content: 'パフォーマンステスト',
          sourceEvaluation: {
            evaluation: 'B',
            comment: '改善の余地あり',
          },
        },
        {
          id: 3,
          content: 'ドキュメント整備',
        },
      ];

      const reviewHistory: RevieHistory = {
        id: 'review-1',
        title: 'テストレビュー',
        targetDocumentName: 'test.pdf',
        additionalInstructions: '厳格に実施すること',
        commentFormat: '評価と詳細を記載',
        evaluationSettings: {
          items: [
            { label: 'A', description: '優秀' },
            { label: 'B', description: '良好' },
            { label: 'C', description: '要改善' },
            { label: '-', description: '対象外' },
          ],
        },
        processingStatus: 'idle',
        createdAt: '2025-05-01T12:00:00.000Z',
        updatedAt: '2025-05-01T12:00:00.000Z',
      };

      const apiSettings = {
        url: 'http://localhost:11434/v1',
        key: 'test-key-123',
        model: 'llama3',
      };

      const result = convertReviewResultsToCSV(
        checklistResults,
        reviewHistory,
        apiSettings,
      );

      const lines = result.split('\n');
      expect(lines).toHaveLength(5); // ヘッダー + 4データ行

      // ヘッダー確認
      expect(lines[0]).toBe(
        'チェックリスト,評定結果,レビュー結果,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID',
      );

      // 1行目: すべての設定が含まれる
      expect(lines[1]).toContain('セキュリティチェック');
      expect(lines[1]).toContain('A');
      expect(lines[1]).toContain('問題なし');
      expect(lines[1]).toContain('優秀');
      expect(lines[1]).toContain('厳格に実施すること');
      expect(lines[1]).toContain('http://localhost:11434/v1');
      expect(lines[1]).toContain('test-key-123');
      expect(lines[1]).toContain('llama3');

      // 2行目: 設定情報なし
      expect(lines[2]).toContain('パフォーマンステスト');
      expect(lines[2]).toContain('B');
      expect(lines[2]).not.toContain('厳格に実施すること');

      // 3行目: 評価なし
      expect(lines[3]).toContain('ドキュメント整備');
      expect(lines[3]).toContain('C');

      // 4行目: チェックリストなし、評定のみ
      expect(lines[4]).toContain('-');
      expect(lines[4]).toContain('対象外');
    });
  });
});
