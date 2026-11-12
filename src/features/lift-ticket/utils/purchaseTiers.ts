import type {
  LiftTicketData,
  LiftTicketOffer,
  LiftTicketSearchInput,
} from "../types";
import { addDays, lastPurchaseDateOf } from "./calculateLiftTicket";

/**
 * 料金の買い方の段階。安い順に並ぶ。
 *
 * advance … 早割。利用日の2日以上前に締め切る料金（「11/30まで」「3日前まで」）
 * web     … Web・前売。当日か前日まで買える料金
 * counter … 現地の窓口でそのまま買う料金
 */
export type PurchaseTierKey = "advance" | "web" | "counter";

export const PURCHASE_TIER_KEYS: PurchaseTierKey[] = [
  "advance",
  "web",
  "counter",
];

const PURCHASE_METHOD_REASONS = ["online_purchase", "advance_purchase"];

type Purchasable = Pick<LiftTicketOffer, "sales_period" | "purchase_deadline">;

/**
 * 利用日の2日以上前に締め切る料金か。「前日まで」は Web・前売の段階に入れる
 * （前日に買えるなら、早く決めて買う料金ではない）
 */
const isEarly = (item: Purchasable, visitDate: string) => {
  const last = lastPurchaseDateOf(item, visitDate);
  return last != null && last < addDays(visitDate, -1);
};

/** 購入ページのある販売経路で売る料金か */
const hasOnlineChannel = (data: LiftTicketData, channelIds?: string[]) =>
  (channelIds ?? []).some(channelId =>
    Boolean(data.channels.find(channel => channel.id === channelId)?.url),
  );

const tierOf = (
  purchaseMethod: boolean,
  item: Purchasable,
  visitDate: string,
): PurchaseTierKey =>
  !purchaseMethod ? "counter" : isEarly(item, visitDate) ? "advance" : "web";

/** リフト券の料金の段階。Web・前売の割引理由が付いた料金が Web・早割 */
export const purchaseTierOfOffer = (
  offer: LiftTicketOffer,
  visitDate: string,
): PurchaseTierKey =>
  tierOf(
    (offer.discount_reasons ?? []).some(reason =>
      PURCHASE_METHOD_REASONS.includes(reason),
    ),
    offer,
    visitDate,
  );

/** レンタル・同行者パックの段階。購入ページのある経路か、事前の期限がある料金が Web・早割 */
const tierOfChannelItem = (
  data: LiftTicketData,
  item: Purchasable & { channel_ids?: string[]; purchase_url?: string | null },
  visitDate: string,
): PurchaseTierKey =>
  tierOf(
    Boolean(item.purchase_url) ||
      hasOnlineChannel(data, item.channel_ids) ||
      lastPurchaseDateOf(item, visitDate) != null,
    item,
    visitDate,
  );

/** 段階の並び。数字が小さいほど早く買う必要がある */
const rankOf = (tier: PurchaseTierKey) => PURCHASE_TIER_KEYS.indexOf(tier);

/**
 * その段階で買える料金だけを残したデータ。
 * advance は全部、web は早割を除く、counter は Web・前売・早割を除く。
 * Web料金が無いデータを counter だけで計算するときは、何も除かれない。
 * 利用日は一番早い日で判定する（「11/30まで」の早割は全日に同じように効く）
 */
export const dataForPurchaseTier = (
  data: LiftTicketData,
  tier: PurchaseTierKey,
  visitDate: string,
): LiftTicketData => {
  // Web・早割の段階では、窓口と同額のWeb料金もWebの料金として出す
  if (tier === "advance") return { ...data, prefersPurchaseMethodOnTie: true };
  const allowed = (itemTier: PurchaseTierKey) =>
    rankOf(itemTier) >= rankOf(tier);
  return {
    ...data,
    prefersPurchaseMethodOnTie: tier === "web",
    offers: data.offers.filter(offer =>
      allowed(purchaseTierOfOffer(offer, visitDate)),
    ),
    party_rules: data.party_rules.filter(rule =>
      allowed(tierOfChannelItem(data, rule, visitDate)),
    ),
    rentals: data.rentals?.filter(rental =>
      allowed(tierOfChannelItem(data, rental, visitDate)),
    ),
  };
};

/** 一番早い利用日（未入力の日は除く） */
export const firstVisitDateOf = (input: LiftTicketSearchInput) =>
  [...(input.days ?? []).map(day => day.date), input.visitDate]
    .filter((date): date is string => Boolean(date))
    .sort()[0] ?? "";

/**
 * このデータで計算を分ける段階。Web・前売の料金が無ければ counter だけ、
 * 早割が無ければ web と counter だけを返す（同じ計算を繰り返さない）
 */
export const purchaseTierKeysOf = (
  data: LiftTicketData,
  visitDate: string,
): PurchaseTierKey[] => {
  const tiers = new Set<PurchaseTierKey>([
    ...data.offers.map(offer => purchaseTierOfOffer(offer, visitDate)),
    ...data.party_rules.map(rule => tierOfChannelItem(data, rule, visitDate)),
    ...(data.rentals ?? []).map(rental =>
      tierOfChannelItem(data, rental, visitDate),
    ),
  ]);
  return PURCHASE_TIER_KEYS.filter(
    tier => tier === "counter" || tiers.has(tier),
  );
};
