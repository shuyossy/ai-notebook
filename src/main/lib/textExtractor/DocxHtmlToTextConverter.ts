import * as cheerio from 'cheerio';
import { escapeCsvCell as escapeCsvCellUtil } from './csvUtils';

/**
 * mammothのHTML出力をプレーンテキストに変換するユーティリティクラス
 * テーブルはカンマ区切り、画像はMarkdownリンク形式に変換する
 */
export class DocxHtmlToTextConverter {
  /**
   * HTML文字列をテキストに変換する
   * @param html mammothから出力されたHTML
   * @returns 変換後のテキスト
   */
  convert(html: string): string {
    if (!html || !html.trim()) {
      return '';
    }

    const $ = cheerio.load(html, { xml: false });
    let result = '';

    // body直下の要素を順に処理
    const body = $('body');
    body.contents().each((_, node) => {
      result += this.processNode($, node);
    });

    // 連続空行を2行（\n\n）に制限
    result = result.replace(/\n{3,}/g, '\n\n');

    return result;
  }

  /**
   * DOMノードを再帰的に処理してテキストに変換する
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processNode($: cheerio.CheerioAPI, node: any): string {
    // テキストノード
    if (node.type === 'text') {
      return node.data || '';
    }

    // 要素ノード
    if (node.type !== 'tag') {
      return '';
    }

    const tagName = (node.tagName || node.name || '').toLowerCase();

    // テーブル
    if (tagName === 'table') {
      return this.processTable($, node);
    }

    // 画像（srcが空の場合はスキップ: AI非互換画像のフィルタリングによる孤立参照防止）
    if (tagName === 'img') {
      const src = $(node).attr('src') || '';
      if (!src) {
        return '';
      }
      return `![image](${src})`;
    }

    // 見出し
    const headingMatch = tagName.match(/^h([1-6])$/);
    if (headingMatch) {
      const level = parseInt(headingMatch[1], 10);
      const prefix = '#'.repeat(level) + ' ';
      const innerText = this.processChildren($, node);
      return `${prefix}${innerText}\n\n`;
    }

    // 段落
    if (tagName === 'p') {
      const innerText = this.processChildren($, node);
      return `${innerText}\n\n`;
    }

    // 改行
    if (tagName === 'br') {
      return '\n';
    }

    // 順序なしリスト
    if (tagName === 'ul') {
      return this.processUnorderedList($, node);
    }

    // 順序付きリスト
    if (tagName === 'ol') {
      return this.processOrderedList($, node);
    }

    // インライン要素およびその他未知のタグはテキスト内容のみ
    return this.processChildren($, node);
  }

  /**
   * 子ノードを再帰的に処理する
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processChildren($: cheerio.CheerioAPI, el: any): string {
    let result = '';
    $(el)
      .contents()
      .each((_, child) => {
        result += this.processNode($, child);
      });
    return result;
  }

  /**
   * テーブルをカンマ区切り行に変換する
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processTable($: cheerio.CheerioAPI, el: any): string {
    let result = '';

    // 直接子のtr、またはthead/tbody/tfoot直下のtrのみ取得（ネストテーブルの混入を防ぐ）
    const rows = $(el)
      .children('tr')
      .add($(el).children('thead, tbody, tfoot').children('tr'));
    rows.each((_, tr) => {
      const cells: string[] = [];

      $(tr)
        .children('td, th')
        .each((_, cell) => {
          let cellText = this.processChildren($, cell);
          // 末尾改行除去 + 連続改行を単一改行に圧縮
          cellText = cellText.replace(/\n+$/, '').replace(/\n{2,}/g, '\n');
          cells.push(this.escapeCsvCell(cellText));
        });

      result += cells.join(',') + '\n';
    });

    result += '\n';
    return result;
  }

  /**
   * CSVセルをRFC 4180準拠でエスケープする
   * - 改行・カンマ・ダブルクォートを含む場合はダブルクォートで囲む
   * - 改行はそのまま保持する
   */
  private escapeCsvCell(value: string): string {
    return escapeCsvCellUtil(value);
  }

  /**
   * 順序なしリストを処理する
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processUnorderedList($: cheerio.CheerioAPI, el: any): string {
    let result = '';

    $(el)
      .children('li')
      .each((_, li) => {
        const text = this.processChildren($, li);
        result += `- ${text}\n`;
      });

    result += '\n';
    return result;
  }

  /**
   * 順序付きリストを処理する
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processOrderedList($: cheerio.CheerioAPI, el: any): string {
    let result = '';

    $(el)
      .children('li')
      .each((i, li) => {
        const text = this.processChildren($, li);
        result += `${i + 1}. ${text}\n`;
      });

    result += '\n';
    return result;
  }
}
