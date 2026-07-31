/** カタカナをひらがなに変換する（ヴ・小書き文字含む） */
export const katakanaToHiragana = (input: string) =>
  input.replace(/[ァ-ヶ]/g, char =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  );

/**
 * 検索比較用にテキストを正規化する。
 * NFKC（全角英数→半角、半角カナ→全角カナ）→ 小文字化 → カタカナ→ひらがな。
 */
export const normalizeSearchText = (input: string) =>
  katakanaToHiragana(input.normalize("NFKC").toLowerCase());

/** 検索キーワードを正規化済みトークン（空白区切り）に分割する */
export const toSearchTokens = (keyword: string) =>
  normalizeSearchText(keyword)
    .split(/\s+/u)
    .filter(token => token !== "");
