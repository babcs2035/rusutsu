/** 料金・レンタル・セット券の根拠を，共通の出典番号と引用へ変換する． */
import type {
  LiftTicketData,
  LiftTicketSourceQuote,
  PriceReference,
} from "../types";

/**
 * 出典番号を引くための対応表。**URLごとに1番号**にする
 * （同じページのHTMLとスクリーンショットは同じ出典）。
 */
export function buildReferences(data: LiftTicketData) {
  const numberByUrl = new Map<string, number>();
  const references: PriceReference[] = [];
  for (const source of data.sources ?? []) {
    const url = source.url;
    if (!url || numberByUrl.has(url)) continue;
    const number = references.length + 1;
    numberByUrl.set(url, number);
    references.push({ number, url, title: source.page_title ?? null });
  }
  const numberBySourceId = new Map<string, number>();
  for (const source of data.sources ?? []) {
    const number = source.url ? numberByUrl.get(source.url) : undefined;
    if (number != null) numberBySourceId.set(source.id, number);
  }
  return { references, numberBySourceId };
}

/** offer の料金記載場所 → 出典番号ごとの引用（出典リンクのハイライト用） */
export const sourceQuotesOf = (
  offer: { source_quotes?: LiftTicketSourceQuote[] },
  numberBySourceId: Map<string, number>,
) => {
  const quotes: Record<number, LiftTicketSourceQuote> = {};
  for (const quote of offer.source_quotes ?? []) {
    const number = numberBySourceId.get(quote.source_id);
    if (number != null && quotes[number] == null) quotes[number] = quote;
  }
  return Object.keys(quotes).length > 0 ? quotes : undefined;
};

/** offer の根拠資料 → 出典番号（料金表と同じ番号を使う） */
export const sourceNumbersOf = (
  offer: { source_refs?: string[] },
  numberBySourceId: Map<string, number>,
) =>
  [
    ...new Set(
      (offer.source_refs ?? [])
        .map(id => numberBySourceId.get(id))
        .filter((number): number is number => number != null),
    ),
  ].sort((left, right) => left - right);
