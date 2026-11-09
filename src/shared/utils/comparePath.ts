const MAX_COMPARE_IDS = 2000;
const MAX_COMPARE_QUERY_LENGTH = 402_000;
const RESORT_ID_PATTERN = /^[a-z0-9-]{1,200}$/;

/** 比較URLのクエリ名。`?c=` の後ろにスキー場の番号を2文字ずつ連結する。 */
export const COMPARE_PARAM = "c";
const URL_CODE_RADIX = 36;
const URL_CODE_WIDTH = 2;
const MAX_URL_CODE = URL_CODE_RADIX ** URL_CODE_WIDTH - 1;
const URL_CODES_PATTERN = /^(?:[0-9a-z]{2})+$/;

/** 比較URLの読み書きに必要な、スキー場IDと番号の対応。 */
export type CompareUrlResort = { id: string; urlCode: number };

export function encodeUrlCode(code: number): string | null {
  if (!Number.isInteger(code) || code < 1 || code > MAX_URL_CODE) return null;
  return code.toString(URL_CODE_RADIX).padStart(URL_CODE_WIDTH, "0");
}

/** 共有・メタデータ用。番号のないスキー場は飛ばす。 */
export function encodeCompareCodes(resorts: readonly CompareUrlResort[]) {
  const seen = new Set<string>();
  let value = "";
  for (const resort of resorts) {
    const code = encodeUrlCode(resort.urlCode);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    value += code;
  }
  return value;
}

export type CompareUrlCodec = {
  /** `?c=` が無ければ null。不正・未知だけなら空配列。 */
  read: (url: URL) => string[] | null;
  /** `?c=` の値からスキー場IDを順番どおり重複なしで返す。 */
  decode: (value: string) => string[];
  write: (url: URL, ids: readonly string[]) => URL;
};

export function createCompareUrlCodec(
  resorts: readonly CompareUrlResort[],
): CompareUrlCodec {
  const idByCode = new Map<string, string>();
  const codeById = new Map<string, string>();
  for (const resort of resorts) {
    const code = encodeUrlCode(resort.urlCode);
    if (!code) continue;
    idByCode.set(code, resort.id);
    codeById.set(resort.id, code);
  }
  const decode = (raw: string) => {
    const value = raw.toLowerCase();
    if (!URL_CODES_PATTERN.test(value)) return [];
    const unique = new Set<string>();
    for (let i = 0; i < value.length; i += URL_CODE_WIDTH) {
      const id = idByCode.get(value.slice(i, i + URL_CODE_WIDTH));
      if (id) unique.add(id);
    }
    return [...unique];
  };
  return {
    decode,
    read(url) {
      const value = url.searchParams.get(COMPARE_PARAM);
      return value === null ? null : decode(value);
    },
    write(url, ids) {
      url.searchParams.delete(COMPARE_PARAM);
      const codes = new Set<string>();
      for (const id of ids) {
        const code = codeById.get(id);
        if (code) codes.add(code);
      }
      if (codes.size > 0)
        url.searchParams.set(COMPARE_PARAM, [...codes].join(""));
      return url;
    },
  };
}

/** 共有画像APIの `ids` のように、スキー場IDを直接並べた値を検証して読む。 */
export function parseCompareIds(
  value: string | string[] | null | undefined,
  knownIds?: ReadonlySet<string>,
): string[] {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  if (
    values.reduce((length, item) => length + item.length + 1, 0) >
    MAX_COMPARE_QUERY_LENGTH
  )
    return [];

  const unique = new Set<string>();
  for (const id of values.join(",").split(",").slice(0, MAX_COMPARE_IDS)) {
    if (RESORT_ID_PATTERN.test(id) && (!knownIds || knownIds.has(id)))
      unique.add(id);
  }
  return [...unique];
}
