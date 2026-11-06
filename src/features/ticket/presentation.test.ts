import assert from "node:assert/strict";
import { test } from "node:test";
import { isRentalBundleOffer, TICKET_SECTIONS } from "./presentation";

const data = {
  products: [
    { id: "prod-day", included_items: [] },
    { id: "prod-lunch", included_items: [{ type: "meal" }] },
    { id: "prod-pack", included_items: [{ type: "rental" }] },
  ],
  offers: [
    { id: "offer-day", product_id: "prod-day" },
    { id: "offer-lunch", product_id: "prod-lunch" },
    { id: "offer-pack", product_id: "prod-pack" },
    { id: "offer-new", product_id: "" },
  ],
};

const idsIn = (sectionId: string) => {
  const section = TICKET_SECTIONS.find(item => item.id === sectionId);
  const filter = section?.itemFilter;
  assert.ok(filter);
  return data.offers
    .filter(offer => filter(offer, data))
    .map(offer => offer.id);
};

test("レンタル付き券種の料金だけをセット料金に分ける", () => {
  assert.equal(isRentalBundleOffer(data.offers[2], data), true);
  assert.deepEqual(idsIn("bundle_offers"), ["offer-pack"]);
  // 食事付きや券種未設定の料金はリフト料金に残す
  assert.deepEqual(idsIn("offers"), ["offer-day", "offer-lunch", "offer-new"]);
});
