#!/usr/bin/env node
/**
 * check-lift-ticket-coverage.mjs
 *
 * リフト券料金JSONの意味的検証（参照整合性・期間・年齢境界・証拠の網羅性）。
 *
 * 使い方:
 *   node check-lift-ticket-coverage.mjs <data.json> [...] [--strict]
 *
 * 終了コード: エラーが1件でもあれば 1（--strict時は警告でも 1）。
 */
import {
  Reporter,
  forEachCondition,
  parseArgs,
  periodInverted,
  readJson,
} from "./_lib.mjs";

const { files, opts } = parseArgs(process.argv.slice(2));

if (files.length === 0) {
  console.error("使い方: node check-lift-ticket-coverage.mjs <data.json> [...] [--strict]");
  process.exit(2);
}

const CONFIRMED_PRICE_MODES = ["fixed", "free", "date_table", "range", "derived_discount"];
const OUT_OF_SCOPE_DATA_PATTERN =
  /シーズン券|season(?:[-_\s]?)(?:pass|ticket|price)/iu;

function checkFile(file) {
  const reporter = new Reporter("coverage");
  let data;
  try {
    data = readJson(file);
  } catch (err) {
    reporter.error("/", err.message);
    reporter.print(file);
    return reporter;
  }

  const collections = [
    "sources",
    "geographic_areas",
    "audiences",
    "calendars",
    "areas",
    "products",
    "channels",
    "offers",
    "party_rules",
    "fees",
  ];
  for (const name of collections) {
    for (const [i, item] of (data[name] ?? []).entries()) {
      if (OUT_OF_SCOPE_DATA_PATTERN.test(JSON.stringify(item))) {
        reporter.error(
          `/${name}/${i}`,
          "収集対象外のシーズン券関連情報が含まれています",
        );
      }
    }
  }
  for (const [name, value] of [
    ["calculation_policy", data.calculation_policy],
    ["data_quality", data.data_quality],
  ]) {
    if (OUT_OF_SCOPE_DATA_PATTERN.test(JSON.stringify(value ?? {}))) {
      reporter.error(
        `/${name}`,
        "収集対象外のシーズン券関連情報が含まれています",
      );
    }
  }

  const idSets = {};
  for (const name of collections) {
    const seen = new Set();
    idSets[name] = seen;
    for (const [i, item] of (data[name] ?? []).entries()) {
      if (item.id == null) continue;
      if (seen.has(item.id)) {
        reporter.error(`/${name}/${i}/id`, `ID "${item.id}" が重複しています`);
      }
      seen.add(item.id);
    }
  }

  const sourceById = new Map((data.sources ?? []).map((s) => [s.id, s]));
  const offerById = new Map((data.offers ?? []).map((o) => [o.id, o]));
  const channelById = new Map((data.channels ?? []).map((c) => [c.id, c]));

  function checkRef(jsonPath, id, collectionName) {
    if (id == null) return;
    if (!idSets[collectionName].has(id)) {
      reporter.error(jsonPath, `参照先ID "${id}" が ${collectionName} に存在しません`);
    }
  }

  function checkRefArray(jsonPath, ids, collectionName) {
    for (const [i, id] of (ids ?? []).entries()) {
      checkRef(`${jsonPath}/${i}`, id, collectionName);
    }
  }

  function checkSourceRefs(jsonPath, refs) {
    checkRefArray(jsonPath, refs, "sources");
    for (const [i, refId] of (refs ?? []).entries()) {
      const src = sourceById.get(refId);
      if (!src) continue;
      if (["image", "pdf"].includes(src.type)) {
        if (!src.path) {
          reporter.error(
            `${jsonPath}/${i}`,
            `画像/PDFを根拠とする source "${refId}" に保存資料のパス (path) がありません`,
          );
        }
        if (src.capture_success === false) {
          reporter.error(
            `${jsonPath}/${i}`,
            `取得に失敗した source "${refId}" を確定情報の根拠にしています`,
          );
        }
      }
    }
  }

  // --- 参照整合性 ---
  for (const [i, g] of (data.geographic_areas ?? []).entries()) {
    checkRef(`/geographic_areas/${i}/parent_id`, g.parent_id, "geographic_areas");
    checkRefArray(`/geographic_areas/${i}/member_area_ids`, g.member_area_ids, "geographic_areas");
    checkSourceRefs(`/geographic_areas/${i}/source_refs`, g.source_refs);
  }
  for (const [i, a] of (data.audiences ?? []).entries()) {
    checkSourceRefs(`/audiences/${i}/source_refs`, a.source_refs);
  }
  for (const [i, c] of (data.calendars ?? []).entries()) {
    checkSourceRefs(`/calendars/${i}/source_refs`, c.source_refs);
    for (const [j, r] of (c.date_ranges ?? []).entries()) {
      if (r.start > r.end) {
        reporter.error(`/calendars/${i}/date_ranges/${j}`, `期間が逆転しています (${r.start} > ${r.end})`);
      }
    }
  }
  for (const [i, p] of (data.products ?? []).entries()) {
    checkRefArray(`/products/${i}/area_ids`, p.area_ids, "areas");
    checkSourceRefs(`/products/${i}/source_refs`, p.source_refs);
    for (const [j, item] of (p.included_items ?? []).entries()) {
      checkSourceRefs(`/products/${i}/included_items/${j}/source_refs`, item.source_refs);
    }
    for (const [j, sw] of (p.shared_with_resorts ?? []).entries()) {
      checkSourceRefs(`/products/${i}/shared_with_resorts/${j}/source_refs`, sw.source_refs);
    }
  }
  for (const [i, ch] of (data.channels ?? []).entries()) {
    checkSourceRefs(`/channels/${i}/source_refs`, ch.source_refs);
  }
  for (const [i, s] of (data.sources ?? []).entries()) {
    checkRef(`/sources/${i}/linked_from_source_id`, s.linked_from_source_id, "sources");
  }

  if (
    typeof data.season?.start_date === "string" &&
    typeof data.season?.end_date === "string" &&
    data.season.start_date > data.season.end_date
  ) {
    reporter.error("/season", `シーズン期間が逆転しています`);
  }

  // 「この料金がいつのものか」は最も重要な前提なので証拠を要求する。
  // ここが無検証だと、公式サイトが前シーズンの料金を表示していた場合に
  // それを新シーズンとして確定してしまう
  if ((data.season?.source_refs ?? []).length === 0) {
    reporter.error(
      "/season/source_refs",
      `このシーズンだと判断した根拠 (source_refs) がありません。保存資料のどこにシーズンの記載があるかを示してください（日付＋曜日・営業カレンダー・年号表記など）`,
    );
  }
  checkSourceRefs("/season/source_refs", data.season?.source_refs);

  forEachCondition(data, (cond, condPath) => {
    checkRefArray(`${condPath}/area_ids`, cond.area_ids, "geographic_areas");
    checkSourceRefs(`${condPath}/source_refs`, cond.source_refs);
    if (
      cond.type === "area_relationship" &&
      (cond.relationships ?? []).length > 0 &&
      (cond.area_ids ?? []).length === 0 &&
      !["hotel_guest", "member"].some((r) => (cond.relationships ?? []).includes(r))
    ) {
      reporter.error(
        condPath,
        `area_relationship 条件に area_ids がありません。対象地域を geographic_areas に定義して参照してください（対象地域が公式資料で不明な場合は unknown 条件を使う）`,
      );
    }
  });

  // --- offers ---
  for (const [i, offer] of (data.offers ?? []).entries()) {
    const oPath = `/offers/${i}`;
    checkRef(`${oPath}/product_id`, offer.product_id, "products");
    checkRefArray(`${oPath}/audience_ids`, offer.audience_ids, "audiences");
    checkRefArray(`${oPath}/calendar_ids`, offer.calendar_ids, "calendars");
    checkRefArray(`${oPath}/channel_ids`, offer.channel_ids, "channels");
    checkSourceRefs(`${oPath}/source_refs`, offer.source_refs);

    if (offer.purchase_deadline) {
      checkSourceRefs(
        `${oPath}/purchase_deadline/source_refs`,
        offer.purchase_deadline.source_refs,
      );
    }
    if (periodInverted(offer.sales_period)) {
      reporter.error(`${oPath}/sales_period`, `販売期間が逆転しています`);
    }
    if (periodInverted(offer.use_period)) {
      reporter.error(`${oPath}/use_period`, `利用期間が逆転しています`);
    }

    const price = offer.price ?? {};
    if (price.base_offer_id != null) {
      if (!offerById.has(price.base_offer_id)) {
        reporter.error(`${oPath}/price/base_offer_id`, `参照先offer "${price.base_offer_id}" が存在しません`);
      } else if (price.base_offer_id === offer.id) {
        reporter.error(`${oPath}/price/base_offer_id`, `自分自身を割引元として参照しています`);
      }
    }
    for (const [j, row] of (price.date_table ?? []).entries()) {
      checkRef(`${oPath}/price/date_table/${j}/calendar_id`, row.calendar_id, "calendars");
      checkSourceRefs(`${oPath}/price/date_table/${j}/source_refs`, row.source_refs);
      if (typeof row.start === "string" && typeof row.end === "string" && row.start > row.end) {
        reporter.error(`${oPath}/price/date_table/${j}`, `期間が逆転しています`);
      }
    }

    // 確定料金には source_refs が必要
    if (CONFIRMED_PRICE_MODES.includes(price.mode)) {
      if ((offer.source_refs ?? []).length === 0) {
        reporter.error(
          `${oPath}/source_refs`,
          `確定料金 (price.mode: ${price.mode}) には保存資料への source_refs が必要です`,
        );
      }
    }
    if (price.mode === "range" && price.range && price.range.min > price.range.max) {
      reporter.error(`${oPath}/price/range`, `料金レンジが逆転しています`);
    }

    // Web料金は購入URLまたは購入条件が必要
    if ((offer.discount_reasons ?? []).includes("online_purchase")) {
      const refChannels = (offer.channel_ids ?? [])
        .map((id) => channelById.get(id))
        .filter(Boolean);
      const hasUrl = refChannels.some((ch) => typeof ch.url === "string" && ch.url.length > 0);
      const hasRequirements = (offer.requirements ?? []).length > 0;
      if (!hasUrl && !hasRequirements) {
        reporter.error(
          `${oPath}`,
          `online_purchase のofferには購入URL（channel.url）または購入手順 (requirements) が必要です`,
        );
      }
    }

    // 地域割引が構造化されていること（notesだけはNG）
    const localReasons = ["local_resident", "local_worker", "local_student"];
    if ((offer.discount_reasons ?? []).some((r) => localReasons.includes(r))) {
      const hasAreaCond = (offer.eligibility_conditions ?? []).some(
        (c) => c.type === "area_relationship" && (c.area_ids ?? []).length > 0,
      );
      if (!hasAreaCond) {
        reporter.error(
          `${oPath}/eligibility_conditions`,
          `地域割引が構造化されていません。geographic_areas を参照する area_relationship 条件が必要です（notes_ja だけに書いてはいけません）`,
        );
      }
    }

    // 保証金・手数料の混入チェック（ヒューリスティック）
    const nameText = `${offer.name_ja ?? ""} ${offer.official_label_ja ?? ""}`;
    if (/保証金|デポジット|発行手数料/.test(nameText)) {
      reporter.error(
        `${oPath}/name_ja`,
        `ICカード保証金・発行手数料はofferではなく fees に登録してください`,
      );
    }
  }

  // --- 年齢境界 ---
  const aged = (data.audiences ?? [])
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.age_min != null || a.age_max != null);
  for (let x = 0; x < aged.length; x++) {
    for (let y = x + 1; y < aged.length; y++) {
      const { a: A, i: ai } = aged[x];
      const { a: B } = aged[y];
      if (A.allow_age_overlap || B.allow_age_overlap) continue;
      const aMin = A.age_min ?? 0;
      const aMax = A.age_max ?? Number.POSITIVE_INFINITY;
      const bMin = B.age_min ?? 0;
      const bMax = B.age_max ?? Number.POSITIVE_INFINITY;
      if (aMin <= bMax && bMin <= aMax) {
        reporter.error(
          `/audiences/${ai}`,
          `年齢区分が重複しています: "${A.id}" (${aMin}-${aMax}) と "${B.id}" (${bMin}-${bMax})。意図的な重複なら allow_age_overlap: true を設定してください`,
        );
      }
    }
  }
  const sorted = aged
    .filter(({ a }) => a.age_min != null && a.age_max != null)
    .sort((p, q) => (p.a.age_min ?? 0) - (q.a.age_min ?? 0));
  for (let x = 0; x + 1 < sorted.length; x++) {
    const cur = sorted[x].a;
    const next = sorted[x + 1].a;
    if (next.age_min > cur.age_max + 1) {
      reporter.warn(
        `/audiences/${sorted[x + 1].i}`,
        `年齢境界に欠落の可能性: ${cur.age_max}歳 ("${cur.id}") と ${next.age_min}歳 ("${next.id}") の間が定義されていません`,
      );
    }
  }

  // --- calendar の意図しない重複 ---
  const calSignature = (c) =>
    JSON.stringify({
      d: [...(c.dates ?? [])].sort(),
      r: (c.date_ranges ?? []).map((r) => `${r.start}~${r.end}`).sort(),
      w: [...(c.day_types ?? [])].sort(),
    });
  const bySig = new Map();
  for (const c of data.calendars ?? []) {
    const sig = calSignature(c);
    if (bySig.has(sig)) {
      reporter.warn(
        `/calendars`,
        `calendar "${c.id}" と "${bySig.get(sig)}" の内容が同一です。意図しない重複でないか確認してください`,
      );
    } else {
      bySig.set(sig, c.id);
    }
  }

  // --- party_rules ---
  for (const [i, rule] of (data.party_rules ?? []).entries()) {
    const rPath = `/party_rules/${i}`;
    checkRefArray(`${rPath}/calendar_ids`, rule.calendar_ids, "calendars");
    checkRefArray(`${rPath}/channel_ids`, rule.channel_ids, "channels");
    checkSourceRefs(`${rPath}/source_refs`, rule.source_refs);
    if ((rule.source_refs ?? []).length === 0) {
      reporter.error(`${rPath}/source_refs`, `party ruleには保存資料への source_refs が必要です`);
    }
    for (const [j, comp] of (rule.components ?? []).entries()) {
      const cPath = `${rPath}/components/${j}`;
      checkRefArray(`${cPath}/audience_ids`, comp.audience_ids, "audiences");
      checkRefArray(`${cPath}/product_ids`, comp.product_ids, "products");
      checkRefArray(`${cPath}/offer_ids`, comp.offer_ids, "offers");
      if (
        comp.min_count != null &&
        comp.max_count != null &&
        comp.min_count > comp.max_count
      ) {
        reporter.error(`${cPath}`, `人数条件が逆転しています (min ${comp.min_count} > max ${comp.max_count})`);
      }
      if (comp.price_effect?.type === "free" && (comp.price_effect.amount ?? 0) !== 0) {
        reporter.error(`${cPath}/price_effect`, `price_effect "free" の金額は 0 または null である必要があります`);
      }
      if (
        ["discount_amount", "fixed_total", "fixed_per_person"].includes(
          comp.price_effect?.type,
        ) &&
        comp.price_effect.amount == null
      ) {
        reporter.error(`${cPath}/price_effect`, `price_effect "${comp.price_effect.type}" には amount が必要です`);
      }
      if (comp.price_effect?.type === "discount_percent" && comp.price_effect.percent == null) {
        reporter.error(`${cPath}/price_effect`, `price_effect "discount_percent" には percent が必要です`);
      }
    }
  }

  // --- fees ---
  for (const [i, fee] of (data.fees ?? []).entries()) {
    const fPath = `/fees/${i}`;
    checkRefArray(`${fPath}/applies_to_product_ids`, fee.applies_to_product_ids, "products");
    checkRefArray(`${fPath}/applies_to_channel_ids`, fee.applies_to_channel_ids, "channels");
    checkSourceRefs(`${fPath}/source_refs`, fee.source_refs);
    if (fee.amount != null && (fee.source_refs ?? []).length === 0) {
      reporter.error(`${fPath}/source_refs`, `確定した手数料・保証金には source_refs が必要です`);
    }
    if (
      ["ic_card_deposit", "ic_card_issue_fee"].includes(fee.fee_type) &&
      fee.refundable == null
    ) {
      reporter.warn(
        `${fPath}/refundable`,
        `保証金/発行手数料は返金の有無 (refundable) を公式資料で確認して記録してください（不明なら未解決事項へ）`,
      );
    }
  }

  // --- data_quality ---
  for (const [i, item] of (data.data_quality?.illegible_items ?? []).entries()) {
    const iPath = `/data_quality/illegible_items/${i}`;
    checkRefArray(`${iPath}/source_refs`, item.source_refs, "sources");
    checkRefArray(`${iPath}/related_offer_ids`, item.related_offer_ids, "offers");
    for (const offerId of item.related_offer_ids ?? []) {
      const offer = offerById.get(offerId);
      if (!offer) continue;
      const price = offer.price ?? {};
      const hasConfirmedAmount =
        (price.mode === "fixed" && price.amount != null) ||
        (price.mode === "date_table" && (price.date_table ?? []).length > 0) ||
        (price.mode === "range" && price.range != null);
      if (hasConfirmedAmount) {
        reporter.error(
          iPath,
          `判読不能と記録された箇所に紐づくoffer "${offerId}" に確定料金が入っています。判読できない金額は price.mode "unknown" とし、推測で埋めてはいけません`,
        );
      }
    }
  }
  for (const [i, q] of (data.data_quality?.unresolved_questions ?? []).entries()) {
    checkRefArray(`/data_quality/unresolved_questions/${i}/source_refs`, q.source_refs, "sources");
  }

  reporter.print(file);
  return reporter;
}

let anyFailed = false;
for (const file of files) {
  const reporter = checkFile(file);
  if (reporter.failed(opts.strict)) anyFailed = true;
}
process.exit(anyFailed ? 1 : 0);
