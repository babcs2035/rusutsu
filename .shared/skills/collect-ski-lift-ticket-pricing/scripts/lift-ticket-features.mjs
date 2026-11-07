#!/usr/bin/env node
/**
 * lift-ticket-features.mjs
 *
 * リフト券料金JSONから「構造の特徴」を機械抽出する共通モジュール。
 * 実在施設にも架空スキー場フィクスチャにも同じ関数を使う（テスト Y01）。
 *
 *   import { extractFeatures } from "./lift-ticket-features.mjs";
 *   const features = extractFeatures(data); // Set<"分野:名前=値">
 *
 * 特徴キーは `分野:名前` または `分野:名前=値`。一覧と意味は references/feature-catalog.md。
 * 方針:
 *  - notes_ja は読まない（自由記述は構造ではない）。
 *  - 正規表現で読むのは name_ja / official_label_ja / target_qualification /
 *    requirements の構造化された短い文言だけで、「上限として読む」。
 *    過検出しても「架空ケースが要る」警告が増えるだけで、見落としにはならない。
 *    ただし語は広げすぎない（catalog に注意を書く）。
 *  - 金額の組み合わせで決まる特徴は offers の最安価格を比べて判定する。
 *
 * CLI: node lift-ticket-features.mjs <data.json> ...  で特徴キーを1行ずつ出す。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, readJson } from "./_lib.mjs";

const toMin = (t) =>
  typeof t === "string" && /^\d{2}:\d{2}/.test(t)
    ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
    : null;

const SCHOOL_AGE = {
  preschool: [0, 6],
  elementary_school: [7, 12],
  junior_high_school: [13, 15],
  high_school: [16, 18],
};

const text = (...xs) => xs.filter((x) => typeof x === "string").join(" ");

/** 証明の種類（requirements の description_ja + proof_ja）。過検出を避けた狭い語。 */
const PROOF_KINDS = [
  ["qr_screen", /QR|ＱＲ|スマートフォン画面|スマホ画面|画面を(提示|見せ)|アプリ画面/],
  ["photo_id", /顔写真|写真付き|運転免許|パスポート|マイナンバーカード|身分証/],
  ["student_card", /学生証|生徒手帳|在学証明/],
  ["address_proof", /住所を確認|住所が確認|住民票|在住を(証明|確認)|保険証/],
  ["disability_certificate", /障がい者手帳|障害者手帳|身体障|療育手帳|精神障/],
  ["membership_card", /会員証|会員カード|メンバーズカード|メンバー証|ポイントカード/],
  ["coupon_voucher", /クーポン|バウチャー|引換券|引き換え券/],
  ["lodging_proof", /宿泊(証明|証|確認|予約|票)|宿泊者(で|で)あること|宿泊客/],
  ["reservation_proof", /要予約|予約が必要|予約(確認)?(メール|画面|番号|票)|購入(完了)?(メール|画面)|購入後に(メール|表示)|メールで届く|申込みフォーム|お申込み/],
];

/** target_qualification の種類（official_label_ja + description_ja）。 */
const QUALIFICATION_KINDS = [
  ["lodging_guest", /宿泊|ホテル|旅館|ペンション|ロッジ/],
  ["resident", /県民|道民|市民|町民|村民|府民|都民|在住|居住者|住民/],
  ["member_holder", /会員|メンバー|保有者|所有者|カード(会員|保有)|シーズン券(保有|購入)/],
  ["student", /学生|生徒|在学/],
  ["coupon_presenter", /クーポン|バウチャー|提示/],
  ["app_registration", /アプリ|LINE|ライン|ID登録|会員登録|登録(者|済)/],
  ["foreign_resident", /外国|海外|訪日|インバウンド|国内(在住|居住)/],
  ["birthday_or_age", /誕生|生まれ|\d+歳|\d+才/],
];

const RENTAL_QUALIFICATION_KINDS = [
  ["lodging_guest", /宿泊|ホテル|旅館|ペンション|ロッジ/],
  ["resident", /県民|道民|市民|町民|府民|都民|在住|居住者|住民/],
  ["lift_ticket_buyer", /リフト券|リフト(を)?(購入|利用)|チケット購入|券(を)?購入/],
  ["member_holder", /会員|メンバー|シーズン券|保有/],
  ["student", /学生|学割|生徒/],
  ["coupon_presenter", /クーポン|提示/],
  ["lesson", /レッスン|スクール/],
];

function windowKind(v) {
  const s0 = toMin(v.start_time);
  const e0 = toMin(v.end_time);
  if (s0 == null && e0 == null) return "untimed";
  const s = s0 ?? 0;
  const e = e0 ?? 24 * 60;
  if (e <= 9 * 60) return "early_morning";
  if (s >= 16 * 60) return "night";
  if (s < 12 * 60 && e <= 13.5 * 60) return "morning";
  if (s < 17 * 60 && e >= 19 * 60) return "day_and_night";
  if (s >= 11.5 * 60 && e <= 17.5 * 60) return "afternoon";
  if (s >= 11.5 * 60 && e > 17.5 * 60) return "afternoon_into_night";
  return "other";
}

function afterDaysBucket(n) {
  const x = n ?? 1;
  return x <= 1 ? "1" : x === 2 ? "2" : "3plus";
}

function maxUsesBucket(n) {
  if (n == null) return "unlimited";
  return n >= 3 ? "3plus" : String(n);
}

/** 1つの券料金JSONから特徴キーの集合を返す。 */
export function extractFeatures(data) {
  const F = new Set();
  const add = (k) => F.add(k);

  const A = data.audiences ?? [];
  const C = data.calendars ?? [];
  const OH = data.operating_hours ?? [];
  const P = data.products ?? [];
  const O = data.offers ?? [];
  const PR = data.party_rules ?? [];
  const FE = data.fees ?? [];
  const R = data.rentals ?? [];
  const RA = data.rental_audiences ?? [];
  const CH = data.channels ?? [];
  const cal = Object.fromEntries(C.map((c) => [c.id, c]));
  const prodById = Object.fromEntries(P.map((p) => [p.id, p]));
  const audDefault = A.find((a) => a.is_default);

  // ===== 券の種類 =====
  const dayProducts = P.filter((p) => p.validity?.mode === "calendar_day");
  const hasDay = dayProducts.length > 0;
  add(`product:day_pass=${hasDay ? "present" : "absent"}`);
  if (
    hasDay &&
    audDefault &&
    !dayProducts.some((p) =>
      O.some(
        (o) => o.product_id === p.id && o.audience_ids?.includes(audDefault.id),
      ),
    )
  ) {
    add("product:day_pass.no_offer_for_default_audience");
  }
  if (!hasDay) {
    add(
      P.some((p) => p.validity?.mode === "hours_from_first_use")
        ? "product:no_day_pass.hours_pass_present"
        : "product:no_day_pass.no_hours_pass",
    );
  }
  for (const p of P) {
    const v = p.validity ?? {};
    add(`product:validity.mode=${v.mode}`);
    if (v.mode === "hours_from_first_use" && v.hours >= 9) {
      add("product:hours_pass.hours_ge9");
    }
    if (v.usable_within_ja) add("product:usable_within_stated");
    if (p.covers_hours_types?.length) {
      add(`product:covers=${[...p.covers_hours_types].sort().join("+")}`);
    } else {
      add("product:covers=unspecified");
    }
    if (p.area_ids?.length) add("product:area_limited");
    if (p.shared_with_resorts?.length) add("product:shared_with_resorts");
    if (p.add_on_to_product_ids?.length) add("product:add_on");
    for (const it of p.included_items ?? []) add(`product:included=${it.type}`);

    if (v.mode === "fixed_time_window") {
      add(`window:kind=${windowKind(v)}`);
      const label = text(p.name_ja, p.official_label_ja, v.notes_ja);
      // 「オープン〜」「〜クローズ」「営業終了まで」のような相対表記（上限として読む）
      if (
        /(オープン|開場|営業開始)\s*(〜|～|~|-|から)|(〜|～|~|-)\s*(クローズ|閉場|営業終了)|(クローズ|閉場|営業終了)(まで)/.test(
          label,
        )
      ) {
        add("window:relative_label");
      }
      if (v.start_time == null || v.end_time == null) {
        add("window:one_side_open");
      }
    }
  }

  // ===== 営業時間 =====
  if (!OH.length) add("hours:empty");
  const reg = OH.filter((o) => o.hours_type === "regular");
  const night = OH.filter((o) => o.hours_type === "night");
  const early = OH.filter((o) => o.hours_type === "early_morning");
  const regTimed = reg.filter((o) => o.start_time && o.end_time);
  const calsOf = (o) => (o.calendar_ids ?? []).map((id) => cal[id]).filter(Boolean);
  const dayTypes = (c) => c.included_day_types ?? [];
  const nonEmpty = (xs) => (xs ?? []).length > 0;

  for (const o of OH) {
    add(`hours:type=${o.hours_type}`);
    const cs = calsOf(o);
    if (o.hours_type === "regular" && (!o.start_time || !o.end_time)) {
      add("hours:regular.time_missing");
    }
    if (o.lifts?.some((l) => l.operating === false)) add("hours:lift_suspended");
    if (o.lifts?.length) add("hours:per_lift_times");
    if (o.hours_type === "regular" || o.hours_type === "night" || o.hours_type === "early_morning") {
      if (cs.some((c) => dayTypes(c).length)) add(`hours:${o.hours_type}.day_type_limited`);
      if (cs.some((c) => nonEmpty(c.included_dates))) add(`hours:${o.hours_type}.date_limited`);
      if (cs.some((c) => nonEmpty(c.included_date_ranges))) add(`hours:${o.hours_type}.period_limited`);
      if (cs.some((c) => nonEmpty(c.excluded_dates) || nonEmpty(c.excluded_date_ranges))) {
        add(`hours:${o.hours_type}.has_exception`);
      }
    }
    if (o.hours_type === "closed") {
      if (cs.some((c) => dayTypes(c).length)) add("hours:closed.weekly");
      if (cs.some((c) => nonEmpty(c.included_dates) || nonEmpty(c.included_date_ranges))) {
        add("hours:closed.dates");
      }
      if (cs.some((c) => nonEmpty(c.excluded_dates) || nonEmpty(c.excluded_date_ranges))) {
        add("hours:closed.has_exception");
      }
    }
  }
  if (OH.length && OH.every((o) => o.hours_type === "unknown")) add("hours:all_unknown");
  if (reg.length >= 2) {
    const byDay = reg.some((o) => calsOf(o).some((c) => dayTypes(c).length));
    add(byDay ? "hours:regular.varies_by_day_type" : "hours:regular.varies_by_period");
    if (new Set(regTimed.map((o) => `${o.start_time}-${o.end_time}`)).size >= 2) {
      add("hours:regular.multiple_time_ranges");
    }
  }
  for (const r of regTimed) {
    const len = (toMin(r.end_time) - toMin(r.start_time)) / 60;
    if (len < 8) add("hours:regular.length_lt8");
    if (len >= 9) add("hours:regular.length_ge9");
  }
  if (night.length && !regTimed.length) add("hours:night_without_regular_times");
  const nightTimed = night.filter((o) => o.start_time);
  for (const r of regTimed) {
    for (const n of nightTimed) {
      add(
        toMin(r.end_time) < toMin(n.start_time)
          ? "hours:break_between_regular_and_night"
          : "hours:regular_night_contiguous",
      );
    }
  }
  if (early.length && P.some((p) => p.covers_hours_types?.includes("early_morning"))) {
    add("hours:early_morning_with_covering_product");
  }

  // ===== 料金の条件（offers） =====
  const allDates = (c) => nonEmpty(c.included_dates);
  for (const o of O) {
    const reasons = o.discount_reasons ?? [];
    if (!reasons.length) add("offer:reason=none");
    for (const r of reasons) add(`offer:reason=${r}`);
    if (reasons.length >= 2) add("offer:reason.multiple");
    if (o.channel_ids?.length) add("offer:channel_specified");
    const sp = o.sales_period;
    if (sp) {
      add(
        `offer:sales_period=${
          sp.start && sp.end ? "start_end" : sp.start ? "start_only" : sp.end ? "end_only" : "text_only"
        }`,
      );
    }
    if (o.use_period) add("offer:use_period");
    const pd = o.purchase_deadline;
    if (pd) {
      if (pd.same_day_allowed === true) add("offer:deadline=same_day_ok");
      if (pd.same_day_allowed === false) add("offer:deadline=advance_only");
      if (pd.same_day_allowed == null) add("offer:deadline=unstated");
      if (pd.days_before_use != null && pd.days_before_use > 0) add("offer:deadline=days_before");
      if (pd.deadline_date) add("offer:deadline=fixed_date");
    }
    for (const rq of o.requirements ?? []) {
      const t = text(rq.description_ja, rq.proof_ja);
      for (const [k, re] of PROOF_KINDS) if (re.test(t)) add(`offer:proof=${k}`);
    }
    const tq = o.target_qualification;
    if (tq) {
      add("offer:qualification");
      const t = text(tq.official_label_ja, tq.description_ja);
      for (const [k, re] of QUALIFICATION_KINDS) if (re.test(t)) add(`offer:qualification=${k}`);
      if (tq.nominal_age != null) add("offer:qualification.nominal_age");
    }
    if (o.target_genders?.length) add("offer:gender_limited");
    if (o.price?.live_lookup_required) add("offer:price.live_lookup_required");
    if (o.price?.amount == null && !o.price?.live_lookup_required) add("offer:price.amount_null");
    if (o.stacking?.stackable_with_other_discounts) {
      add(`offer:stacking=${o.stacking.stackable_with_other_discounts}`);
    }
    const nm = text(o.name_ja, o.official_label_ja);
    if (/レディース|ladies/i.test(nm)) add("offer:ladies_day_name");
    if (/こどもの日|キッズデー|子供の日|子どもの日/.test(nm)) add("offer:childrens_day_name");
  }
  for (const c of C) {
    if (dayTypes(c).some((t) => /weekday/.test(t))) add("calendar:day_type=weekday");
    if (dayTypes(c).some((t) => /holiday|weekend|saturday|sunday/.test(t))) add("calendar:day_type=weekend_holiday");
    if (allDates(c)) add("calendar:included_dates");
    if (nonEmpty(c.excluded_dates) || nonEmpty(c.excluded_date_ranges)) add("calendar:excluded");
  }
  for (const c of CH) {
    if (c.url) add("channel:has_url");
    if (c.location_ja) add("channel:has_location");
    if (c.purchase_deadline_ja) add("channel:deadline_stated");
  }

  // ===== 人物区分 =====
  for (const a of A) {
    const sl = a.school_levels ?? [];
    const hasAge = a.age_min != null || a.age_max != null;
    if (sl.length && !hasAge) add("audience:split=school");
    if (!sl.length && hasAge) add("audience:split=age");
    if (sl.length && hasAge) add("audience:split=school_and_age");
    if (sl.length) add(`audience:school_set=${[...sl].sort().join("+")}`);
    if (!sl.length && hasAge && !a.is_disability_qualified) {
      const lo = a.age_min ?? 0;
      const hi = a.age_max ?? 120;
      for (const [k, [s, e]] of Object.entries(SCHOOL_AGE)) {
        if (hi >= s && lo <= e && !(lo <= s && hi >= e)) {
          add(`audience:age_crosses_school=${k}`);
        }
      }
      if (a.age_max != null && a.age_max <= 15 && a.age_min == null) add("audience:child_by_age_only");
      if (a.age_min != null && a.age_min >= 55 && a.age_max == null) add("audience:senior_by_age");
    }
    if (a.is_default && a.age_max != null) add("audience:default_has_age_max");
    if (a.is_default && a.age_min != null) add("audience:default_has_age_min");
    if (sl.includes("university") || sl.includes("graduate")) add("audience:student");
    if (/ヤング|ユース|young/i.test(text(a.name_ja, a.official_label_ja))) add("audience:young_named");
    if (/シニア|senior|シルバー/i.test(text(a.name_ja, a.official_label_ja))) add("audience:senior_named");
    if (a.is_disability_qualified) add("audience:disability");
    if (a.allow_age_overlap) add("audience:allow_age_overlap");
    if (a.age_basis_ja) add("audience:age_basis_stated");
    if (a.base_audience_id) add("audience:has_base_audience");
  }
  if (RA.length) add("audience:rental_audiences_present");

  // ===== 同行者ルール =====
  const bundleRental = (p) => p?.included_items?.some((x) => x.type === "rental");
  let partyWithRental = false;
  for (const r of PR) {
    add("party:rule");
    r.components.forEach((c) => {
      if (c.price_effect?.type) add(`party:effect=${c.price_effect.type}`);
      else add("party:effect=regular_price");
      if (c.per_qualifying_count != null) add("party:per_qualifying_count");
      if (c.offer_ids?.length) add("party:component.offer_ids");
      if (c.product_ids?.length) add("party:component.product_ids");
      if (c.min_count != null && c.max_count == null) add("party:count=unbounded");
      if (c.min_count != null && c.min_count === c.max_count) add("party:count=fixed");
      if (c.min_count != null && c.max_count != null && c.min_count !== c.max_count) add("party:count=range");
    });
    add(`party:components=${r.components.length >= 4 ? "4plus" : r.components.length}`);
    if (r.channel_ids?.length) add("party:channel_limited");
    if (r.sales_period) add("party:sales_period");
    if (r.use_period) add("party:use_period");
    if (r.calendar_ids?.length) add("party:calendar_limited");
    if (r.target_qualification) add("party:qualification");
    if (r.exclusive_group_id) add("party:exclusive_group");
    if (r.target_genders?.length) add("party:gender_limited");
    const pids = r.components.flatMap((c) => c.product_ids ?? []);
    const modes = pids.map((id) => prodById[id]?.validity?.mode);
    if (modes.some((m) => m === "consecutive_days" || m === "selectable_days")) add("party:multi_day_product");
    if (modes.some((m) => m === "calendar_day")) add("party:day_pass_product");
    if (modes.some((m) => m === "fixed_time_window" || m === "hours_from_first_use" || m === "hours_pool")) {
      add("party:timed_product");
    }
    if (pids.some((id) => bundleRental(prodById[id])) || /レンタル/.test(text(r.name_ja, r.official_label_ja))) {
      add("party:rental_included");
      partyWithRental = true;
    }
  }
  if (
    !PR.length &&
    O.some((o) => (o.discount_reasons ?? []).some((x) => x === "family" || x === "group"))
  ) {
    add("party:family_offer_without_rule");
  }

  // ===== レンタル =====
  const rentalBundled = P.some(bundleRental);
  if (R.length) {
    add("rental:present");
    if (new Set(R.map((r) => r.shop_name_ja ?? "")).size >= 2) add("rental:shops=multiple");
    for (const r of R) {
      const d = r.duration ?? {};
      add(`rental:duration.mode=${d.mode}`);
      if (d.mode === "half_day") add(d.start_time ? "rental:half_day.start_time_stated" : "rental:half_day.no_start_time");
      if (d.mode === "half_day" && d.hours) add("rental:half_day.hours_stated");
      if (d.mode === "night" && d.start_time) add("rental:night.start_time_stated");
      if (d.mode === "extra_day") add(`rental:duration.mode=extra_day:after_days=${afterDaysBucket(d.after_days)}`);
      if (d.mode === "days" && d.days >= 7) add("rental:duration.days_ge7");
      if (d.mode === "hours" && d.start_time) add("rental:hours.start_time_stated");
      for (const it of r.items) add(`rental:item=${it}`);
      if (r.items.length >= 2) add("rental:items.multiple");
      if (r.items.includes("wear_top") || r.items.includes("wear_bottom")) add("rental:wear.split_top_bottom");
      if (r.items.includes("wear")) add("rental:wear.whole");
      if (r.grade_ja) add("rental:grade");
      if (r.channel_ids?.length) add("rental:channel_specified");
      if (r.purchase_deadline) add("rental:purchase_deadline");
      if (r.calendar_ids?.length) add("rental:calendar_specific");
      if (r.use_period) add("rental:use_period");
      if (r.sales_period) add("rental:sales_period");
      if (r.target_qualification) {
        add("rental:qualification");
        const t = text(r.target_qualification.official_label_ja, r.target_qualification.description_ja);
        for (const [k, re] of RENTAL_QUALIFICATION_KINDS) if (re.test(t)) add(`rental:qualification=${k}`);
      }
      if (r.price?.amount == null) add("rental:price.amount_null");
      if (r.audience_ids.length >= 2) add("rental:audience.multiple_per_item");
      if (r.usable_at_night === true) add("rental:usable_at_night=true");
      if (r.usable_at_night === false) add("rental:usable_at_night=false");
      if (r.usable_at_night == null && night.length) add("rental:usable_at_night=unrecorded_with_night");
      // 名称（構造化された短い文言）から読む区分・サイズ
      const nm = text(r.name_ja, r.official_label_ja);
      if (/身長|1[0-6]\d\s*(cm|ｃｍ|㎝)/.test(nm)) add("rental:size_by_height");
      if (/サイズ|\d{2,3}(\.\d)?\s*(cm|ｃｍ|㎝)?\s*[〜～~-]\s*\d{2,3}(\.\d)?\s*(cm|ｃｍ|㎝)|\d{2,3}\s*(cm|ｃｍ|㎝)\s*[〜～~]/.test(nm)) add("rental:size_stated_in_name");
    }
    // 対象区分の決め方
    const used = new Set(R.flatMap((r) => r.audience_ids));
    const pool = [...RA, ...A].filter((a) => used.has(a.id));
    const kinds = new Set();
    for (const a of pool) {
      const sl = a.school_levels ?? [];
      const hasAge = a.age_min != null || a.age_max != null;
      if (sl.length && !hasAge) kinds.add("school");
      else if (!sl.length && hasAge) kinds.add("age");
      else if (sl.length) kinds.add("school_and_age");
    }
    for (const k of kinds) add(`rental:audience_basis=${k}`);
    if (pool.length <= 1) add("rental:audience_basis=single");
    if (RA.length) {
      const same = (x, y) =>
        x.age_min === y.age_min &&
        x.age_max === y.age_max &&
        JSON.stringify(x.school_levels ?? []) === JSON.stringify(y.school_levels ?? []);
      const aDef = A.find((a) => a.is_default);
      const rDef = RA.find((a) => a.is_default);
      if (aDef && rDef && !same(aDef, rDef)) add("rental:default_audience_differs_from_lift");
      if (RA.some((x) => !A.some((y) => same(x, y)))) add("rental:audience_differs_from_lift");
    }
    if (rentalBundled) add("rental:bundled_with_lift_ticket");
    if (night.length) add("rental:with_night_hours");
    if (night.length && R.some((r) => r.duration?.mode === "night")) add("rental:night_rental_exists");
  } else {
    add("rental:absent");
  }

  // ===== 手数料 =====
  for (const f of FE) {
    add("fee:present");
    add(`fee:unit=${f.unit ?? "unspecified"}`);
    if (f.applies_to_channel_ids?.length) add("fee:channel_limited");
    if (f.applies_to_product_ids?.length) add("fee:product_limited");
    if (f.amount == null) add("fee:amount_null");
    if (/保証金|デポジット/.test(text(f.name_ja, f.official_label_ja))) add("fee:deposit_named");
  }

  // ===== 雪マジ =====
  const ym = data.yukimaji;
  if (ym) {
    add(`yukimaji:status=${ym.status}`);
    const coupon = (c, kind) => {
      if (!c) return;
      add(`yukimaji:${kind}.day_rule=${c.day_rule}`);
      for (const pr of c.period_rules ?? []) add(`yukimaji:${kind}.period_rule.day_rule=${pr.day_rule}`);
      if (c.period_approximate) add(`yukimaji:${kind}.period_approximate`);
      if (c.period == null) add(`yukimaji:${kind}.period_absent`);
      if (nonEmpty(c.excluded_date_ranges)) add(`yukimaji:${kind}.excluded_date_ranges`);
      if (c.excluded_dates_unspecified) add(`yukimaji:${kind}.excluded_dates_unspecified`);
      if (c.holiday_treatment_ja) add(`yukimaji:${kind}.holiday_treatment_stated`);
      add(`yukimaji:${kind}.max_uses=${maxUsesBucket(c.max_uses)}`);
      add(`yukimaji:${kind}.night_policy=${c.night_policy}`);
      if (c.time_window) add(`yukimaji:${kind}.time_window`);
      const prods = (c.product_ids ?? []).map((id) => prodById[id]).filter(Boolean);
      const modes = [...new Set(prods.map((p) => p.validity?.mode))].sort();
      if (modes.length) add(`yukimaji:${kind}.target_modes=${modes.join("+")}`);
      if (prods.length >= 2) add(`yukimaji:${kind}.target_choice`);
      if (prods.some((p) => p.shared_with_resorts?.length)) add(`yukimaji:${kind}.target_shared_product`);
      if (prods.length === 1 && prods[0].covers_hours_types?.length === 1 && prods[0].covers_hours_types[0] === "night") {
        add(`yukimaji:${kind}.target_night_only`);
      }
      for (const pr of c.price_rules ?? []) {
        add(`yukimaji:${kind}.price_effect=${pr.price_effect?.type}`);
        if (pr.from_use_number != null && pr.from_use_number > 1) add(`yukimaji:${kind}.price_by_use_number`);
        if (pr.calendar_ids?.length) add(`yukimaji:${kind}.price_by_calendar`);
        if (pr.product_ids?.length) add(`yukimaji:${kind}.price_by_product`);
      }
    };
    coupon(ym.free_coupon, "free");
    coupon(ym.discount_coupon, "discount");
    if (ym.free_coupon && !ym.discount_coupon) add("yukimaji:free_without_discount");
    if (!ym.free_coupon && ym.discount_coupon) add("yukimaji:discount_without_free");
    if (ym.free_coupon && ym.discount_coupon) {
      const a = JSON.stringify(ym.free_coupon.period ?? null);
      const b = JSON.stringify(ym.discount_coupon.period ?? null);
      if (a !== b) add("yukimaji:free_discount_period_differs");
      if (ym.free_coupon.day_rule !== ym.discount_coupon.day_rule) add("yukimaji:free_discount_day_rule_differs");
    }
    for (const f of ym.fees ?? []) add(`yukimaji:fee=${f.refundable ? "refundable" : "non_refundable"}`);
    if (ym.rental_benefit) {
      add(`yukimaji:rental_benefit=${ym.rental_benefit.price_effect?.type ?? "described_only"}`);
      if (ym.rental_benefit.requirements_ja) add("yukimaji:rental_benefit.requirements");
    }
    if (ym.rental_restriction_ja) add("yukimaji:rental_restriction");
    if (nonEmpty(ym.shared_use_count_with_resorts)) add("yukimaji:shared_use_count");
    if (nonEmpty(ym.other_benefits_ja)) add("yukimaji:other_benefits");
    if (nonEmpty(ym.requirements_ja)) add("yukimaji:resort_requirements");
  }

  // ===== 金額の組み合わせで決まる特徴 =====
  const isStandard = (o) =>
    !(o.discount_reasons ?? []).length && !o.target_qualification && !o.target_genders?.length;
  const forAudience = (o) => (audDefault ? o.audience_ids?.includes(audDefault.id) : true);
  const minPrice = (pred) => {
    let m = null;
    for (const o of O) {
      const p = prodById[o.product_id];
      if (!p || !pred(o, p) || o.price?.amount == null || o.price.live_lookup_required) continue;
      if (m === null || o.price.amount < m) m = o.price.amount;
    }
    return m;
  };
  const dayMin = minPrice((o, p) => p.validity?.mode === "calendar_day" && isStandard(o) && forAudience(o));
  if (dayMin != null) {
    for (const p of P) {
      if (p.validity?.mode !== "hours_from_first_use" || !(p.validity.hours >= 7)) continue;
      const hm = minPrice((o, q) => q.id === p.id && isStandard(o) && forAudience(o));
      if (hm != null && hm < dayMin) {
        add("price:long_hours_cheaper_than_day");
        const limited = O.some(
          (o) =>
            o.product_id === p.id &&
            o.price?.amount === hm &&
            (o.use_period || (o.calendar_ids ?? []).some((id) => nonEmpty(cal[id]?.included_date_ranges))),
        );
        if (limited) add("price:long_hours_cheaper_than_day.limited_period");
      }
    }
  }
  // Web が窓口（割引理由なし）より高い
  for (const p of P) {
    const web = minPrice(
      (o, q) =>
        q.id === p.id &&
        (o.discount_reasons ?? []).length > 0 &&
        (o.discount_reasons ?? []).every((x) => x === "online_purchase") &&
        !o.target_qualification &&
        forAudience(o),
    );
    const counter = minPrice((o, q) => q.id === p.id && isStandard(o) && forAudience(o));
    if (web != null && counter != null && web > counter) add("price:online_higher_than_standard");
  }
  // セット券（付いている物あり）が同じ長さのバラ券より安い／バラ合計より安い
  const rentalMin = (() => {
    let m = null;
    for (const r of R) {
      if (r.price?.amount == null) continue;
      if (audDefault && !r.audience_ids.includes(audDefault.id)) continue;
      if (r.duration?.mode !== "day") continue;
      if (r.target_qualification || r.channel_ids?.length) continue;
      if (m === null || r.price.amount < m) m = r.price.amount;
    }
    return m;
  })();
  for (const p of P) {
    if (!p.included_items?.length) continue;
    const mode = p.validity?.mode;
    const sameKind = (o, q) =>
      q.id !== p.id &&
      !q.included_items?.length &&
      q.validity?.mode === mode &&
      q.validity?.hours === p.validity?.hours &&
      isStandard(o) &&
      forAudience(o);
    const bundle = minPrice((o, q) => q.id === p.id && forAudience(o) && !o.target_qualification);
    const plain = minPrice(sameKind);
    if (bundle != null && plain != null && bundle < plain) add("price:bundle_cheaper_than_plain_ticket");
    if (bundleRental(p) && bundle != null && plain != null && rentalMin != null && bundle < plain + rentalMin) {
      add("price:rental_bundle_cheaper_than_parts");
    }
  }

  // ===== 主要な組み合わせ =====
  const hoursShape = (() => {
    if (!OH.length) return "empty";
    if (OH.every((o) => o.hours_type === "unknown")) return "unknown";
    const parts = [];
    if (regTimed.length) parts.push("regular");
    else if (reg.length) parts.push("regular_no_times");
    if (night.length) parts.push("night");
    if (early.length) parts.push("early_morning");
    if (!parts.length) parts.push("closed_only");
    return parts.join("+");
  })();
  add(`combo:hours=${hoursShape}×day_pass=${hasDay ? "present" : "absent"}`);

  if (night.length) {
    const dayCoversNight = dayProducts.some((p) => p.covers_hours_types?.includes("night"));
    const nightOnlyProduct = P.some(
      (p) => p.covers_hours_types?.length === 1 && p.covers_hours_types[0] === "night",
    );
    const nightTypes = new Set();
    for (const o of night) {
      const cs = calsOf(o);
      if (cs.some((c) => allDates(c))) nightTypes.add("dates");
      else if (cs.some((c) => dayTypes(c).length)) nightTypes.add("day_types");
      else if (cs.some((c) => nonEmpty(c.included_date_ranges))) nightTypes.add("period");
      else nightTypes.add("daily");
    }
    const cover = !hasDay ? "no_day_pass" : dayCoversNight ? "yes" : "no";
    for (const t of nightTypes) add(`combo:night=${t}×day_pass_covers_night=${cover}`);
    add(`combo:night×night_only_product=${nightOnlyProduct ? "present" : "absent"}`);
  }
  if (PR.length) add(`combo:party_rule×rental_included=${partyWithRental ? "yes" : "no"}`);
  if (R.length) {
    add(`combo:rental×rental_bundled_ticket=${rentalBundled ? "yes" : "no"}`);
  }

  return F;
}

// ---------- CLI ----------
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const { files } = parseArgs(process.argv.slice(2));
  if (!files.length) {
    console.error("使い方: node lift-ticket-features.mjs <data.json> [...]");
    process.exit(2);
  }
  for (const f of files) {
    const set = extractFeatures(readJson(f));
    console.log(`# ${f} (${set.size})`);
    for (const k of [...set].sort()) console.log(k);
  }
}
