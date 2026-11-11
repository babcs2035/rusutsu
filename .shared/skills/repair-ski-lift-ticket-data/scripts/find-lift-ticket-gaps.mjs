#!/usr/bin/env node
// 確定版のリフト券JSONを点検し、画面の機能に必要なのに欠けている情報を一覧にする。
// 使い方:
//   node find-lift-ticket-gaps.mjs                       全スキー場
//   node find-lift-ticket-gaps.mjs naspa-ski-garden ...  指定スキー場だけ
//   node find-lift-ticket-gaps.mjs --file <draft.json>   草案1件
//   --json <out.json>   結果をJSONで保存する（作業領域に置く）
//   --summary           スキー場ごとの件数だけ出す
// 判定の意味と直し方は ../references/gap-checks.md が正本。
import fs from "node:fs";
import path from "node:path";
import { dayInfo } from "../../collect-ski-lift-ticket-pricing/scripts/jp-holidays.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const TICKETS = path.join(ROOT, "src/private/data/lift-ticket");

const args = process.argv.slice(2);
const argValue = flag =>
  args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
const fileArg = argValue("--file");
const jsonOut = argValue("--json");
const summaryOnly = args.includes("--summary");
const only = args.filter(
  (a, i) =>
    !a.startsWith("--") && !["--file", "--json"].includes(args[i - 1] ?? ""),
);

const files = fileArg
  ? [path.resolve(fileArg)]
  : fs
      .readdirSync(TICKETS, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .filter(e => only.length === 0 || only.includes(e.name))
      .flatMap(e =>
        fs
          .readdirSync(path.join(TICKETS, e.name))
          .filter(f => /^\d{4}-\d{4}\.json$/u.test(f))
          .map(f => path.join(TICKETS, e.name, f)),
      );

const FILE_SOURCE = /\.(png|jpe?g|gif|webp|svg|pdf)($|[?#])/iu;
const WEB_REASONS = ["online_purchase", "advance_purchase"];
const QUALIFIED = [
  "local_resident",
  "membership",
  "hotel_guest",
  "coupon",
  "app_registration",
  "payment_method",
  "prior_purchase",
  "unknown",
];

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
/** calendar がその日に一致するか（料金照会と同じ決まり。包含は OR） */
const calendarMatches = (calendar, date) => {
  if (!calendar) return false;
  if ((calendar.excluded_dates ?? []).includes(date)) return false;
  if (
    (calendar.excluded_date_ranges ?? []).some(
      r => r.start <= date && date <= r.end,
    )
  )
    return false;
  const info = dayInfo(date);
  const dow = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const typeMatches = type =>
    type === "all" ||
    (type === "weekday" && info.is_weekday) ||
    (type === "saturday" && info.is_saturday) ||
    (type === "sunday" && info.is_sunday) ||
    (type === "public_holiday" && info.is_public_holiday) ||
    (["monday", "tuesday", "wednesday", "thursday", "friday"].includes(type) &&
      dow === type);
  return (
    (calendar.included_dates ?? []).includes(date) ||
    (calendar.included_date_ranges ?? []).some(
      r => r.start <= date && date <= r.end,
    ) ||
    (calendar.included_day_types ?? []).some(typeMatches)
  );
};

/** シーズン中の日付（無ければ11月〜5月） */
const seasonDates = data => {
  const start =
    data.season?.start_date ?? `${data.season?.id?.slice(0, 4)}-11-01`;
  const end = data.season?.end_date ?? `${data.season?.id?.slice(5, 9)}-05-31`;
  const dates = [];
  for (
    let t = Date.parse(`${start}T00:00:00Z`);
    t <= Date.parse(`${end}T00:00:00Z`) && dates.length < 400;
    t += 86_400_000
  )
    dates.push(new Date(t).toISOString().slice(0, 10));
  return dates;
};

const amountOf = item =>
  item.price?.amount ??
  (item.components ?? []).map(c => c.price_effect?.amount).find(a => a > 0) ??
  null;

const overlaps = (a = [], b = []) =>
  a.length === 0 || b.length === 0 || a.some(x => b.includes(x));

const checkFile = file => {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const resort = data.resort?.id ?? path.basename(path.dirname(file));
  const gaps = [];
  const add = (check, target, detail) => gaps.push({ check, target, detail });
  const sources = new Map((data.sources ?? []).map(s => [s.id, s]));
  const channels = new Map((data.channels ?? []).map(c => [c.id, c]));
  const calendars = new Map((data.calendars ?? []).map(c => [c.id, c]));
  const offers = data.offers ?? [];

  // 1. 画像・PDFの出典が、それを載せているページと結び付いているか
  for (const source of data.sources ?? []) {
    if (!FILE_SOURCE.test(source.url ?? "")) continue;
    const parent = sources.get(source.linked_from_source_id);
    if (!parent)
      add(
        "file-source-without-page",
        source.id,
        `${source.url} を載せているページが linked_from_source_id に無い`,
      );
    else if (FILE_SOURCE.test(parent.url ?? ""))
      add(
        "file-source-without-page",
        source.id,
        `リンク元 ${parent.id} も画像・PDF（HTMLページを指す）`,
      );
  }

  // Webで先に買う割引（窓口でも同額で買える券・資格が要る割引は除く）
  const isWebDiscount = offer =>
    (offer.discount_reasons ?? []).some(r => WEB_REASONS.includes(r)) &&
    !(offer.discount_reasons ?? []).some(r => QUALIFIED.includes(r));
  const isStandard = offer =>
    (offer.discount_reasons ?? []).length === 0 &&
    !offer.target_qualification &&
    !(offer.target_genders ?? []).length &&
    (offer.channel_ids ?? []).some(id => !channels.get(id)?.url);

  for (const offer of offers) {
    const reasons = offer.discount_reasons ?? [];
    if (isWebDiscount(offer)) {
      const d = offer.purchase_deadline;
      // 2. いつまでに買えばよいか（「2/3までにWebで購入」）を決める手がかりが無い。
      //    販売終了日があれば期限はそこから決まる
      if (!d && !offer.sales_period?.end)
        add(
          "web-offer-without-deadline",
          offer.id,
          "purchase_deadline も販売終了日も無い（記載なしでも欄を作り、notes_ja に「記載なし」と書く）",
        );
      // 3. 先に買う券なのに、販売の終わりも、当日不可・何日前までも無い
      //    （当日不可なら「前日まで」として期限を出せる）
      if (
        reasons.includes("advance_purchase") &&
        !offer.sales_period?.end &&
        !d?.deadline_date &&
        !(d?.days_before_use > 0) &&
        d?.same_day_allowed !== false
      )
        add(
          "advance-without-end",
          offer.id,
          "前売りなのに販売終了日・締切日・何日前まで・当日不可のどれも無い",
        );
      // 販売開始日が書かれていない券は、取得時点で販売中として扱える（点検しない）
      // 5. 通常料金（窓口）と並べられるか。
      //    その券を窓口でも売っている（どこかの区分・日付に窓口料金がある）のに、
      //    この区分・日付の窓口料金が無いときだけ不足とする。
      //    Web・前売だけで売る商品（Web限定の8日券・パック）には比べる窓口料金が無い
      const standards = offers.filter(
        other => other.product_id === offer.product_id && isStandard(other),
      );
      // 区分: その区分に窓口料金が1つも無ければ、その区分には Web だけで売る券
      const sameAudience = standards.filter(other =>
        overlaps(other.audience_ids, offer.audience_ids),
      );
      // 日付: calendar の名前ではなく、実際に同じ日があるかで見る
      const dates = seasonDates(data).filter(
        date =>
          (offer.calendar_ids ?? []).length === 0 ||
          (offer.calendar_ids ?? []).some(id =>
            calendarMatches(calendars.get(id), date),
          ),
      );
      const standard = sameAudience.find(
        other =>
          (other.calendar_ids ?? []).length === 0 ||
          dates.some(date =>
            (other.calendar_ids ?? []).some(id =>
              calendarMatches(calendars.get(id), date),
            ),
          ),
      );
      if (sameAudience.length > 0 && !standard)
        add(
          "web-offer-without-counter-price",
          offer.id,
          "同じ券を窓口でも売っているのに、この区分・日付の窓口料金 offer が無い",
        );
      // 6. 購入ページへ連れて行けるか
      if (
        reasons.includes("online_purchase") &&
        !(offer.channel_ids ?? []).some(id => channels.get(id)?.url)
      )
        add(
          "web-offer-without-url",
          offer.id,
          "参照する channel に購入ページURLが無い",
        );
    }
  }

  // 6b. 「平日かつ3月」のつもりで、曜日と長い期間を1つの calendar に並べている。
  //     包含は OR なので、期間外の平日・期間内の土日にも一致してしまう
  //     （苗場の平日20才無料が土日にも効く、ホワイトピアの3月平日の営業時間が全平日に効く）
  const usedCalendarIds = new Set(
    [
      ...offers,
      ...(data.operating_hours ?? []),
      ...(data.party_rules ?? []),
    ].flatMap(item => item.calendar_ids ?? []),
  );
  const DAY = 86_400_000;
  for (const calendar of data.calendars ?? []) {
    if (!usedCalendarIds.has(calendar.id)) continue;
    const dayTypes = (calendar.included_day_types ?? []).filter(
      type => !["all", "year_end_new_year"].includes(type),
    );
    const longRanges = (calendar.included_date_ranges ?? []).filter(
      range => (Date.parse(range.end) - Date.parse(range.start)) / DAY >= 20,
    );
    const everyDay = ["weekday", "saturday", "sunday", "public_holiday"].every(
      type => dayTypes.includes(type),
    );
    if (dayTypes.length > 0 && longRanges.length > 0 && !everyDay)
      add(
        "calendar-and-written-as-or",
        calendar.id,
        `曜日（${dayTypes.join("・")}）と期間（${longRanges.map(r => `${r.start}〜${r.end}`).join("・")}）を並べている。包含は OR なので「その期間の、その曜日」にならない`,
      );
  }

  // 7. ナイター: 券はあるのに営業日・時刻が無い、時刻はあるのに日付が無い
  const nightHours = (data.operating_hours ?? []).filter(
    h => h.hours_type === "night",
  );
  const nightProducts = (data.products ?? []).filter(p =>
    (p.covers_hours_types ?? []).includes("night"),
  );
  if (nightProducts.length > 0 && nightHours.length === 0)
    add(
      "night-ticket-without-hours",
      nightProducts.map(p => p.id).join(","),
      "ナイターを含む券があるのに、ナイター営業の時刻・営業日が無い",
    );
  for (const h of nightHours) {
    if (!h.start_time || !h.end_time)
      add("night-hours-without-time", h.id, "ナイターの開始・終了時刻が無い");
    if (
      !(h.calendar_ids ?? []).length ||
      !(h.calendar_ids ?? []).every(id => calendars.has(id))
    )
      add("night-hours-without-days", h.id, "ナイター営業日のカレンダーが無い");
    if (!(h.source_refs ?? []).length)
      add("night-hours-without-source", h.id, "ナイター営業の出典が無い");
  }

  // 8. 金額があるのに出典の場所（source_quotes）が無い
  const priced = [
    ...offers,
    ...(data.party_rules ?? []),
    ...(data.rentals ?? []),
  ].filter(item => amountOf(item) > 0 || item.price?.base_offer_id);
  const noQuote = priced.filter(item => !item.source_quotes?.length);
  if (noQuote.length > 0)
    add(
      "price-without-quote",
      `${noQuote.length}/${priced.length}`,
      "出典リンクがページを開くだけ。attach-quotes / verify-quotes を流し直す",
    );

  // 出典リンクが正しい箇所を指しているかは、ページを開かないと分からないので
  // ここでは見ない（verify-quotes.mjs で全件確かめる）

  // 10. 後から加わった収集項目（レンタル・夜のレンタル・雪マジ・ナイターの有無）
  const notes = JSON.stringify([
    data.data_quality ?? {},
    (data.operating_hours ?? []).map(h => h.notes_ja),
    data.calculation_policy?.notes_ja,
  ]);
  if (!("rentals" in data))
    add(
      "rentals-not-collected",
      "rentals",
      "rentals の欄が無い（レンタル収集の決まりより前のデータ）",
    );
  else if (data.rentals.length === 0 && !/レンタル/u.test(notes))
    add(
      "rentals-not-collected",
      "rentals",
      "rentals が空で、無い理由が data_quality に無い",
    );
  if (
    nightHours.length > 0 &&
    (data.rentals ?? []).length > 0 &&
    (data.rentals ?? []).every(r => r.usable_at_night == null) &&
    !/夜|ナイター/u.test(
      JSON.stringify(data.data_quality?.unresolved_questions ?? []),
    )
  )
    add(
      "night-rental-unchecked",
      "rentals",
      "ナイター営業があるのに、日中のレンタルを夜も使えるか（usable_at_night）を調べた跡が無い",
    );
  if (!("yukimaji" in data))
    add(
      "yukimaji-not-collected",
      "yukimaji",
      "yukimaji の欄が無い（雪マジ収集の決まりより前のデータ）",
    );
  if (nightHours.length === 0 && !/ナイター/u.test(notes))
    add(
      "night-status-unrecorded",
      "operating_hours",
      "ナイターの有無を記録していない（無しなら notes_ja に「ナイター営業なし」と出典を書く）",
    );

  return { resort, file: path.relative(ROOT, file), gaps };
};

const results = files.map(checkFile);
const counts = {};
for (const r of results)
  for (const g of r.gaps) counts[g.check] = (counts[g.check] ?? 0) + 1;

if (jsonOut) {
  fs.mkdirSync(path.dirname(path.resolve(jsonOut)), { recursive: true });
  fs.writeFileSync(
    jsonOut,
    `${JSON.stringify({ counts, results }, null, 2)}\n`,
  );
}
for (const r of results) {
  if (r.gaps.length === 0) continue;
  const byCheck = {};
  for (const g of r.gaps) byCheck[g.check] = (byCheck[g.check] ?? 0) + 1;
  console.log(`${r.resort.padEnd(40)} ${JSON.stringify(byCheck)}`);
  if (!summaryOnly)
    for (const g of r.gaps)
      console.log(`  - ${g.check} ${g.target}: ${g.detail}`);
}
console.log(
  `\n対象 ${results.length}件 / 不足のあるスキー場 ${results.filter(r => r.gaps.length).length}件`,
);
console.log(JSON.stringify(counts, null, 2));
