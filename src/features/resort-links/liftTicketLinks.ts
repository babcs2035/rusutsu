import type { ResortLinkItem } from "./model";

/** リフト券データ（最新シーズン）のうち、リンク一覧に出すURLの部分 */
export type LiftTicketLinkSource = {
  main_links?: {
    lift_price_url?: string | null;
    lift_purchase_url?: string | null;
    rental_price_url?: string | null;
    rental_purchase_url?: string | null;
  } | null;
  sources?: Array<{ id: string; url?: string | null }>;
  channels?: Array<{ url?: string | null }>;
};

export const linkItem = (
  type: string,
  source: string,
  url: string | null | undefined,
  sortOrder = 0,
  label: string | null = null,
): ResortLinkItem[] =>
  url && /^https?:\/\//u.test(url)
    ? [{ type, source, category: null, label, url, note: null, sortOrder }]
    : [];

/**
 * リフト券データが持つリンク（料金・Web購入・レンタル）。画面のリンク一覧と、
 * 公式リンク・外部サイトのリンクを反映する前の「同じページ」の検査が同じものを使う。
 * 主なリンク（main_links）が未設定のデータでは、料金の出典の先頭と、URLのある販売経路で代える
 */
export const liftTicketLinkItems = (
  ticket: LiftTicketLinkSource | null | undefined,
): ResortLinkItem[] => {
  if (!ticket) return [];
  const main = ticket.main_links;
  return [
    ...linkItem(
      "liftTicketPrice",
      "official",
      main?.lift_price_url ?? ticket.sources?.[0]?.url,
    ),
    ...linkItem(
      "webPurchase",
      "official",
      main?.lift_purchase_url ??
        ticket.channels?.find(channel => channel.url)?.url,
    ),
    ...linkItem("rentalPrice", "official", main?.rental_price_url),
    ...linkItem(
      "rentalPrice",
      "official",
      main?.rental_purchase_url,
      1,
      "予約",
    ),
  ];
};
