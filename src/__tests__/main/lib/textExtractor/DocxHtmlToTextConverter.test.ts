/**
 * DocxHtmlToTextConverter のテスト
 * @jest-environment node
 */

import { DocxHtmlToTextConverter } from '@/main/lib/textExtractor/DocxHtmlToTextConverter';

describe('DocxHtmlToTextConverter', () => {
  let converter: DocxHtmlToTextConverter;

  beforeEach(() => {
    converter = new DocxHtmlToTextConverter();
  });

  describe('convert', () => {
    describe('正常系', () => {
      describe('段落', () => {
        it('段落タグがテキスト + 改行2つに変換されること', () => {
          const html = '<p>Hello World</p>';
          const result = converter.convert(html);
          expect(result).toBe('Hello World\n\n');
        });

        it('複数の段落が正しく変換されること', () => {
          const html = '<p>First</p><p>Second</p>';
          const result = converter.convert(html);
          expect(result).toBe('First\n\nSecond\n\n');
        });
      });

      describe('見出し', () => {
        it.each([
          ['h1', '#'],
          ['h2', '##'],
          ['h3', '###'],
          ['h4', '####'],
          ['h5', '#####'],
          ['h6', '######'],
        ])('<%s>タグが "%s テキスト" 形式に変換されること', (tag, prefix) => {
          const html = `<${tag}>Heading</${tag}>`;
          const result = converter.convert(html);
          expect(result).toBe(`${prefix} Heading\n\n`);
        });
      });

      describe('テーブル', () => {
        it('単純なテーブルがカンマ区切りに変換されること', () => {
          const html = `
            <table>
              <tr><td>A</td><td>B</td></tr>
              <tr><td>C</td><td>D</td></tr>
            </table>
          `;
          const result = converter.convert(html);
          expect(result).toContain('A,B\n');
          expect(result).toContain('C,D\n');
        });

        it('thead/tbodyを含むテーブルが正しく変換されること', () => {
          const html = `
            <table>
              <thead><tr><th>Header1</th><th>Header2</th></tr></thead>
              <tbody><tr><td>Data1</td><td>Data2</td></tr></tbody>
            </table>
          `;
          const result = converter.convert(html);
          expect(result).toContain('Header1,Header2\n');
          expect(result).toContain('Data1,Data2\n');
        });

        it('tfootを含むテーブルが正しく変換されること', () => {
          const html = `
            <table>
              <tbody><tr><td>Data</td></tr></tbody>
              <tfoot><tr><td>Footer</td></tr></tfoot>
            </table>
          `;
          const result = converter.convert(html);
          expect(result).toContain('Data\n');
          expect(result).toContain('Footer\n');
        });
      });

      describe('画像', () => {
        it('imgタグがMarkdownのイメージリンクに変換されること', () => {
          const html = '<img src="image1.png" />';
          const result = converter.convert(html);
          expect(result).toBe('![image](image1.png)');
        });

        it('srcが空のimgタグがスキップされること', () => {
          const html = '<img />';
          const result = converter.convert(html);
          expect(result).toBe('');
        });

        it('src属性が空文字列のimgタグがスキップされること', () => {
          const html = '<img src="" />';
          const result = converter.convert(html);
          expect(result).toBe('');
        });
      });

      describe('順序なしリスト', () => {
        it('ulタグが "- item" 形式に変換されること', () => {
          const html = '<ul><li>Item1</li><li>Item2</li></ul>';
          const result = converter.convert(html);
          expect(result).toContain('- Item1\n');
          expect(result).toContain('- Item2\n');
        });
      });

      describe('順序付きリスト', () => {
        it('olタグが "1. item" 形式に変換されること', () => {
          const html = '<ol><li>First</li><li>Second</li><li>Third</li></ol>';
          const result = converter.convert(html);
          expect(result).toContain('1. First\n');
          expect(result).toContain('2. Second\n');
          expect(result).toContain('3. Third\n');
        });
      });

      describe('改行', () => {
        it('brタグが改行に変換されること', () => {
          const html = '<p>Line1<br>Line2</p>';
          const result = converter.convert(html);
          expect(result).toBe('Line1\nLine2\n\n');
        });
      });

      describe('インライン要素', () => {
        it('strongタグのテキスト内容のみが出力されること', () => {
          const html = '<p><strong>Bold</strong> text</p>';
          const result = converter.convert(html);
          expect(result).toBe('Bold text\n\n');
        });

        it('emタグのテキスト内容のみが出力されること', () => {
          const html = '<p><em>Italic</em> text</p>';
          const result = converter.convert(html);
          expect(result).toBe('Italic text\n\n');
        });

        it('spanタグのテキスト内容のみが出力されること', () => {
          const html = '<p><span>Span</span> content</p>';
          const result = converter.convert(html);
          expect(result).toBe('Span content\n\n');
        });

        it('aタグのテキスト内容のみが出力されること', () => {
          const html = '<p><a href="http://example.com">Link</a></p>';
          const result = converter.convert(html);
          expect(result).toBe('Link\n\n');
        });
      });

      describe('未知のタグ', () => {
        it('未知のタグはテキスト内容のみが出力されること', () => {
          const html = '<div>Content in div</div>';
          const result = converter.convert(html);
          expect(result).toBe('Content in div');
        });
      });

      describe('CSVエスケープ', () => {
        it('セル内にカンマを含む場合、ダブルクォートで囲まれること', () => {
          const html = '<table><tr><td>A,B</td><td>C</td></tr></table>';
          const result = converter.convert(html);
          expect(result).toContain('"A,B",C\n');
        });

        it('セル内にダブルクォートを含む場合、エスケープされてダブルクォートで囲まれること', () => {
          const html =
            '<table><tr><td>Say &quot;Hello&quot;</td><td>OK</td></tr></table>';
          const result = converter.convert(html);
          expect(result).toContain('"Say ""Hello""",OK\n');
        });

        it('セル内にカンマとダブルクォートの両方を含む場合、正しくエスケープされること', () => {
          const html = '<table><tr><td>A,&quot;B&quot;</td></tr></table>';
          const result = converter.convert(html);
          expect(result).toContain('"A,""B"""\n');
        });

        it('セル内改行をダブルクォートで囲んで保持する', () => {
          const html = '<table><tr><td>行1\n行2</td><td>値2</td></tr></table>';
          const result = converter.convert(html);
          expect(result).toBe('"行1\n行2",値2\n\n');
        });

        it('セル内に複数段落がある場合に改行が保持される', () => {
          const html =
            '<table><tr><td><p>段落1</p><p>段落2</p></td><td>値2</td></tr></table>';
          const result = converter.convert(html);
          expect(result).toBe('"段落1\n段落2",値2\n\n');
        });

        it('セル内に改行とカンマの両方を含む場合にダブルクォートで囲んで保持する', () => {
          const html =
            '<table><tr><td><p>項目A,項目B</p><p>項目C</p></td><td>値2</td></tr></table>';
          const result = converter.convert(html);
          // 改行とカンマの両方を含むセルがダブルクォートで囲まれ、改行・カンマがそのまま保持される
          expect(result).toBe('"項目A,項目B\n項目C",値2\n\n');
        });
      });

      describe('連続空行の圧縮', () => {
        it('3つ以上の連続改行が2つに圧縮されること', () => {
          const html = '<p>A</p><p></p><p></p><p>B</p>';
          const result = converter.convert(html);
          // 連続する\nが3つ以上にならないことを確認
          expect(result).not.toMatch(/\n{3,}/);
        });
      });

      describe('複合的なHTML', () => {
        it('見出し・段落・リスト・テーブル・画像が混在するHTMLが正しく変換されること', () => {
          const html = `
            <h1>Title</h1>
            <p>Description</p>
            <ul><li>Item1</li><li>Item2</li></ul>
            <table><tr><td>A</td><td>B</td></tr></table>
            <img src="photo.png" />
          `;
          const result = converter.convert(html);
          expect(result).toContain('# Title\n\n');
          expect(result).toContain('Description\n\n');
          expect(result).toContain('- Item1\n');
          expect(result).toContain('- Item2\n');
          expect(result).toContain('A,B\n');
          expect(result).toContain('![image](photo.png)');
        });

        it('ネストされたインライン要素が正しく処理されること', () => {
          const html = '<p><strong><em>Bold and Italic</em></strong></p>';
          const result = converter.convert(html);
          expect(result).toBe('Bold and Italic\n\n');
        });

        it('段落内に画像が含まれる場合、テキストと画像の両方が出力されること', () => {
          const html = '<p>Before <img src="inline.png" /> After</p>';
          const result = converter.convert(html);
          expect(result).toBe('Before ![image](inline.png) After\n\n');
        });
      });

      describe('コメントノード', () => {
        it('HTMLコメントが無視されること', () => {
          const html = '<p>Before</p><!-- This is a comment --><p>After</p>';
          const result = converter.convert(html);
          expect(result).toBe('Before\n\nAfter\n\n');
          expect(result).not.toContain('comment');
        });
      });

      describe('CSVエスケープ - カンマもクォートも含まないセル', () => {
        it('特殊文字を含まないセルがそのまま出力されること', () => {
          const html = '<table><tr><td>Simple</td></tr></table>';
          const result = converter.convert(html);
          expect(result).toContain('Simple\n');
          // ダブルクォートで囲まれていないこと
          expect(result).not.toContain('"Simple"');
        });
      });
    });

    describe('異常系', () => {
      it('空文字列の場合、空文字列が返ること', () => {
        const result = converter.convert('');
        expect(result).toBe('');
      });

      it('空白文字のみの場合、空文字列が返ること', () => {
        const result = converter.convert('   \t\n  ');
        expect(result).toBe('');
      });

      it('undefinedに相当する空値の場合、空文字列が返ること', () => {
        // TypeScriptの型制約上、実際にはundefinedを渡せないが、
        // 実行時に空文字列相当の入力が来るケースをテスト
        const result = converter.convert('' as string);
        expect(result).toBe('');
      });

      it('HTMLタグを含まないプレーンテキストの場合、そのまま出力されること', () => {
        const result = converter.convert('Just plain text');
        expect(result).toBe('Just plain text');
      });
    });
  });
});

describe('DocxHtmlToTextConverter - colspan/rowspan対応', () => {
  const converter = new DocxHtmlToTextConverter();

  it('colspanで列方向にマージされたセルを空セルで補完する', () => {
    const html =
      '<table><tr><td colspan="2">マージ</td><td>通常</td></tr><tr><td>A2</td><td>B2</td><td>C2</td></tr></table>';
    const result = converter.convert(html);
    expect(result).toBe('マージ,,通常\nA2,B2,C2\n\n');
  });

  it('rowspanで行方向にマージされたセルを空セルで補完する', () => {
    const html =
      '<table><tr><td rowspan="2">マージ</td><td>B1</td></tr><tr><td>B2</td></tr></table>';
    const result = converter.convert(html);
    expect(result).toBe('マージ,B1\n,B2\n\n');
  });

  it('colspanとrowspanが混在するテーブルを正しく処理する', () => {
    const html =
      '<table><tr><td colspan="2" rowspan="2">2x2マージ</td><td>C1</td></tr><tr><td>C2</td></tr><tr><td>A3</td><td>B3</td><td>C3</td></tr></table>';
    const result = converter.convert(html);
    expect(result).toBe('2x2マージ,,C1\n,,C2\nA3,B3,C3\n\n');
  });

  it('rowspanが3行にまたがる場合を正しく処理する', () => {
    const html =
      '<table><tr><td rowspan="3">3行マージ</td><td>B1</td></tr><tr><td>B2</td></tr><tr><td>B3</td></tr></table>';
    const result = converter.convert(html);
    expect(result).toBe('3行マージ,B1\n,B2\n,B3\n\n');
  });
});

describe('DocxHtmlToTextConverter - ネストリストのインデント対応', () => {
  const converter = new DocxHtmlToTextConverter();

  it('ネストされた順序なしリストをインデント付きで変換する', () => {
    const html =
      '<ul><li>項目1<ul><li>子項目1</li><li>子項目2</li></ul></li><li>項目2</li></ul>';
    const result = converter.convert(html);
    expect(result).toContain('- 項目1');
    expect(result).toContain('  - 子項目1');
    expect(result).toContain('  - 子項目2');
    expect(result).toContain('- 項目2');
  });

  it('ネストされた順序付きリストをインデント付きで変換する', () => {
    const html =
      '<ol><li>手順1<ol><li>サブ手順1</li><li>サブ手順2</li></ol></li><li>手順2</li></ol>';
    const result = converter.convert(html);
    expect(result).toContain('1. 手順1');
    expect(result).toContain('  1. サブ手順1');
    expect(result).toContain('  2. サブ手順2');
    expect(result).toContain('2. 手順2');
  });

  it('3段階ネストのリストを正しくインデントする', () => {
    const html = '<ul><li>L1<ul><li>L2<ul><li>L3</li></ul></li></ul></li></ul>';
    const result = converter.convert(html);
    expect(result).toContain('- L1');
    expect(result).toContain('  - L2');
    expect(result).toContain('    - L3');
  });
});

describe('DocxHtmlToTextConverter - バージョン互換性テスト', () => {
  const converter = new DocxHtmlToTextConverter();

  it('tfoot付きテーブルを処理する', () => {
    const html =
      '<table><thead><tr><th>ヘッダ1</th></tr></thead><tbody><tr><td>本体</td></tr></tbody><tfoot><tr><td>フッター</td></tr></tfoot></table>';
    const result = converter.convert(html);
    expect(result).toContain('ヘッダ1');
    expect(result).toContain('本体');
    expect(result).toContain('フッター');
  });

  it('3段ネストテーブルを処理する', () => {
    const html = [
      '<table>',
      '  <tr><td>',
      '    <table>',
      '      <tr><td>',
      '        <table><tr><td>最深層</td></tr></table>',
      '      </td></tr>',
      '    </table>',
      '  </td></tr>',
      '</table>',
    ].join('');
    const result = converter.convert(html);
    expect(result).toContain('最深層');
  });

  it('ol/ul交互ネストリストを処理する', () => {
    const html =
      '<ol><li>手順1<ul><li>補足A</li><li>補足B</li></ul></li><li>手順2</li></ol>';
    const result = converter.convert(html);
    expect(result).toContain('1. 手順1');
    expect(result).toContain('  - 補足A');
    expect(result).toContain('  - 補足B');
    expect(result).toContain('2. 手順2');
  });

  it('src属性なしimg要素を安全に処理する', () => {
    const html = '<p>テキスト<img>後続テキスト</p>';
    const result = converter.convert(html);
    expect(result).toContain('テキスト');
    expect(result).toContain('後続テキスト');
  });

  it('sup/sub要素のテキストを抽出する', () => {
    const html = '<p>H<sub>2</sub>O と x<sup>2</sup></p>';
    const result = converter.convert(html);
    expect(result).toContain('H2O');
    expect(result).toContain('x2');
  });

  it('style付きspan要素のテキストを抽出する', () => {
    const html =
      '<p><span style="color:red;font-weight:bold">赤い太字</span>通常テキスト</p>';
    const result = converter.convert(html);
    expect(result).toContain('赤い太字');
    expect(result).toContain('通常テキスト');
  });

  it('figure/figcaption要素のテキストを抽出する', () => {
    const html =
      '<figure><img src="image_1.png"><figcaption>図の説明</figcaption></figure>';
    const result = converter.convert(html);
    expect(result).toContain('![image](image_1.png)');
    expect(result).toContain('図の説明');
  });

  it('colspanが列数を超える場合でもエラーにならない', () => {
    const html =
      '<table><tr><td colspan="10">広いセル</td></tr><tr><td>A</td><td>B</td></tr></table>';
    const result = converter.convert(html);
    expect(result).toContain('広いセル');
    expect(result).toContain('A');
    expect(result).toContain('B');
  });

  it('空行のみのテーブルを処理する', () => {
    const html =
      '<table><tr><td></td><td></td></tr><tr><td></td><td></td></tr></table>';
    const result = converter.convert(html);
    // 空セルだけのテーブルでもエラーにならない
    expect(result).toBeDefined();
  });
});
