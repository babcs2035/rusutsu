import { specResort } from "../../testing/specResort";

/**
 * 入力から確かめられない資格の割引（会員）と、基準料金からの差し引きで書かれた割引。
 * 会員料金は確定料金に使わず、条件付き候補に出す
 */
export const memberDiscountResort = (() => {
  const data = specResort({
    id: "spec-member-discount",
    tickets: [
      {
        id: "day",
        name: "1日券",
        validity: { mode: "calendar_day", days: 1 },
        covers: ["regular"],
        prices: { adult: 6000 },
      },
      {
        id: "day",
        name: "1日券（会員）",
        validity: { mode: "calendar_day", days: 1 },
        covers: ["regular"],
        reasons: ["membership"],
        qualification: "メンバーズカード会員",
        prices: { adult: null },
      },
    ],
  });
  // 会員料金は通常料金から500円引き（base_offer_id で表す）
  const base = data.offers.find(offer => offer.name_ja === "1日券");
  const member = data.offers.find(offer => offer.name_ja === "1日券（会員）");
  if (base && member)
    member.price = {
      currency: "JPY",
      base_offer_id: base.id,
      discount: { amount: 500 },
    };
  data.products = data.products.filter(
    (product, index, all) =>
      all.findIndex(other => other.id === product.id) === index,
  );
  return data;
})();
