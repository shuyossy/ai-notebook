import { CsvParser } from '@/main/lib/csvParser';
import { AppError } from '@/main/lib/error';

describe('CsvParser - 新フォーマット対応', () => {
  describe('parseImportFormat', () => {
    it('新フォーマットのCSVを正しくパースできること', () => {
      const csvText = `チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
要件が明確に定義されているか,,,,,,
設計書に矛盾がないか,,,,,,
,A,優秀 - 問題なし,,,,,
,B,良好 - 軽微な改善推奨,,,,,
,,,レビューは厳格に実施してください。,"【評価】{evaluation}
【コメント】{comment}",http://localhost:11434/v1,test-api-key,llama3`;

      const result = CsvParser.parseImportFormat(csvText);

      // チェックリスト項目の検証
      expect(result.checklists).toEqual([
        '要件が明確に定義されているか',
        '設計書に矛盾がないか',
      ]);

      // 評定設定の検証
      expect(result.evaluationSettings).toBeDefined();
      expect(result.evaluationSettings?.items).toEqual([
        { label: 'A', description: '優秀 - 問題なし' },
        { label: 'B', description: '良好 - 軽微な改善推奨' },
      ]);

      // 追加指示の検証
      expect(result.additionalInstructions).toBe(
        'レビューは厳格に実施してください。',
      );

      // コメントフォーマットの検証
      expect(result.commentFormat).toBe(
        '【評価】{evaluation}\n【コメント】{comment}',
      );

      // API設定の検証
      expect(result.apiSettings).toEqual({
        url: 'http://localhost:11434/v1',
        key: 'test-api-key',
        model: 'llama3',
      });
    });

    it('チェックリスト項目のみのCSVを正しくパースできること', () => {
      const csvText = `チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
項目1,,,,,,
項目2,,,,,,
項目3,,,,,,`;

      const result = CsvParser.parseImportFormat(csvText);

      expect(result.checklists).toEqual(['項目1', '項目2', '項目3']);
      expect(result.evaluationSettings).toBeUndefined();
      expect(result.additionalInstructions).toBeUndefined();
      expect(result.commentFormat).toBeUndefined();
      expect(result.apiSettings).toBeUndefined();
    });

    it('評定設定のみのCSVを正しくパースできること', () => {
      const csvText = `チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
,A,優秀,,,,,
,B,良好,,,,,
,C,要改善,,,,,`;

      const result = CsvParser.parseImportFormat(csvText);

      expect(result.checklists).toEqual([]);
      expect(result.evaluationSettings?.items).toEqual([
        { label: 'A', description: '優秀' },
        { label: 'B', description: '良好' },
        { label: 'C', description: '要改善' },
      ]);
    });

    it('空のCSVでエラーをスローすること', () => {
      const csvText = '';

      expect(() => {
        CsvParser.parseImportFormat(csvText);
      }).toThrow(AppError);

      try {
        CsvParser.parseImportFormat(csvText);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).message).toContain('空です');
      }
    });

    it('不正なヘッダでエラーをスローすること', () => {
      const csvText = `invalid,header
データ1,データ2`;

      expect(() => {
        CsvParser.parseImportFormat(csvText);
      }).toThrow(AppError);

      try {
        CsvParser.parseImportFormat(csvText);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).message).toContain('フォーマットが不正');
      }
    });

    it('評定ラベルのみ（説明なし）は無視されること', () => {
      const csvText = `チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
,A,,,,,,`;

      const result = CsvParser.parseImportFormat(csvText);

      expect(result.evaluationSettings).toBeUndefined();
    });

    it('空のセルは無視されること', () => {
      const csvText = `チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
,,,,,,
項目1,,,,,,
,,,,,,`;

      const result = CsvParser.parseImportFormat(csvText);

      expect(result.checklists).toEqual(['項目1']);
    });

    it('セル内改行を正しく処理できること', () => {
      const csvText = `チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
"項目1
改行あり",,,,,,`;

      const result = CsvParser.parseImportFormat(csvText);

      expect(result.checklists).toEqual(['項目1\n改行あり']);
    });
  });
});
