#!/usr/bin/env node
/**
 * lookup-price.mjs — 「いつ、誰が、どれくらい滑るには、いくらか」を機械的に引く
 *
 * 使い方:
 *   node lookup-price.mjs <data.json> --date YYYY-MM-DD \
 *       [--audience <audience-id>] [--age <n>] [--school <school-level>] \
 *       [--hours <n>] [--from <HH:MM>] [--night] \
 *       [--day-pass] [--with-night] [--days <n>] [--consecutive] \
 *       [--product <product-id>] [--channel <channel-id>] [--json]
 *
 * 営業時間・定休日:
 *   operating_hours からその日の営業状況を解決する。定休日（hours_type: closed）
 *   と営業期間外は**料金を出さない**（営業していない日に料金を提示しない）。
 *   1日券が何時間滑れるかは営業時間から算出する。
 *
 * 1日券の解決:
 *   --day-pass は「その日を通して滑れる券」を探す。
 *     1. calendar_day かつ days=1 の券があればそれ
 *     2. 無ければ**最長の時間券で代替**する（めがひらのように1日券が
 *        存在しないスキー場がある）。代替したことと、営業時間をカバーしきれない
 *        場合はその旨も出力する
 *     3. hours_pool（25時間券のように複数日へ分けられる券）と days>=2 の券は
 *        1日券の候補にしない
 *   --with-night を付けると、covers_hours_types に night を含む1日券を優先し、
 *   無ければ「1日券 ＋ ナイター券」の合算を出す。ナイター券が資料に無い場合は
 *   その旨を明示する（推測で料金を作らない）。
 *
 * 代表とその他の分け方:
 *   --hours で「何時間滑りたいか」を渡すと、要件を満たす券の中から
 *   representative（代表）を1件選び、それ以外を alternatives に回す。
 *   代表に選ばないのは「滑る自由度を狭める制約」がある券:
 *     時間帯固定（平日ゴゴイチ券のような午後限定）/ 対象者限定 / 事前購入必須。
 *   付帯品（食事券・温泉）は自由度を狭めないので、安ければ代表になる。
 *   代表より安い券は cheaper_alternatives として理由付きで並ぶ
 *   （UIで「もっと安いものがあります」と出すため）。
 *
 * カレンダー解決規則（references/data-model.md「calendars」参照）:
 *   - day_type weekday      = 月〜金かつ祝日でない（標準カレンダー準拠）
 *   - day_type saturday / sunday / public_holiday = 標準カレンダー準拠
 *     （祝日は jp-holidays.mjs で計算。振替休日・国民の休日を含む）
 *   - day_type year_end_new_year / special = 単独では日付に一致しない。
 *     必ず公式資料の date_ranges / dates で指定する
 *   - 優先度: dates(明示日) > date_ranges > day_types
 *     （例: 1/1 は「年末年始」の date_range が「土日祝」の day_type に勝つ）
 *   - excluded_dates に含まれる日は不一致
 *
 * シナリオテスト（SKILL.md 手順9）にもこのスクリプトを使う。
 */
import { dayInfo } from "./jp-holidays.mjs";
import { loadTaxonomy, parseArgs, readJson } from "./_lib.mjs";

// 割引が「誰に適用できるか」はラベルの性質なので taxonomy が正本。
// 条件の有無から推測すると、条件を書き忘れた割引が「誰でも使える」扱いになる
const taxonomy = loadTaxonomy();

const { files, opts } = parseArgs(process.argv.slice(2), [
  "date",
  "audience",
  "age",
  "school",
  "hours",
  "from",
  "days",
  "party",
  "product",
  "channel",
]);

if (files.length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(opts.date ?? "")) {
  console.error(
    "使い方: node lookup-price.mjs <data.json> --date YYYY-MM-DD [--audience id] [--age n] [--school level] [--hours n] [--from HH:MM] [--night] [--product id] [--channel id] [--json]",
  );
  process.exit(2);
}

const data = readJson(files[0]);
const info = dayInfo(opts.date);
const calendarById = new Map((data.calendars ?? []).map((c) => [c.id, c]));
const offerById = new Map((data.offers ?? []).map((o) => [o.id, o]));
const channelById = new Map((data.channels ?? []).map((c) => [c.id, c]));

const WEEKDAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const weekdayIndex = new Date(`${opts.date}T00:00:00Z`).getUTCDay();

function dayTypeMatches(dayType) {
  switch (dayType) {
    case "all":
      return true;
    case "weekday":
      return info.is_weekday;
    case "saturday":
      return info.is_saturday;
    case "sunday":
      return info.is_sunday;
    case "public_holiday":
      return info.is_public_holiday;
    // 個別曜日。「毎週火曜定休」「毎週土曜こどもデー」を表すために必要。
    // 祝日かどうかは問わない（定休日は祝日でも定休なのが普通）
    case "monday":
    case "tuesday":
    case "wednesday":
    case "thursday":
    case "friday":
      return WEEKDAY_NAMES[weekdayIndex] === dayType;
    default:
      // year_end_new_year / special / unknown は明示日付でのみ一致させる
      return false;
  }
}

// 一致レベル: 3=明示日付, 2=date_range, 1=day_type, null=不一致
function calendarMatchLevel(cal) {
  if (!cal) return null;
  if ((cal.excluded_dates ?? []).includes(opts.date)) return null;
  if ((cal.dates ?? []).includes(opts.date)) return 3;
  if (
    (cal.date_ranges ?? []).some((r) => r.start <= opts.date && opts.date <= r.end)
  ) {
    return 2;
  }
  if ((cal.day_types ?? []).some(dayTypeMatches)) return 1;
  return null;
}

function periodContains(period) {
  if (!period) return true;
  if (typeof period.start === "string" && opts.date < period.start) return false;
  if (typeof period.end === "string" && opts.date > period.end) return false;
  return true;
}

function resolvePrice(offer, depth = 0) {
  const p = offer.price ?? {};
  const result = { mode: p.mode ?? "unknown", amount: null };
  if (depth > 5) {
    result.note_ja = "derived_discountの参照が深すぎます（循環の可能性）";
    return result;
  }
  switch (p.mode) {
    case "fixed":
      result.amount = p.amount;
      break;
    case "free":
      result.amount = 0;
      break;
    case "date_table": {
      let best = null;
      for (const row of p.date_table ?? []) {
        let level = null;
        if ((row.dates ?? []).includes(opts.date)) level = 5;
        else if (
          typeof row.start === "string" &&
          typeof row.end === "string" &&
          row.start <= opts.date &&
          opts.date <= row.end
        ) {
          level = 4;
        } else if (row.calendar_id) {
          level = calendarMatchLevel(calendarById.get(row.calendar_id));
        }
        if (level != null && (best == null || level > best.level)) {
          best = { level, row };
        }
      }
      if (best) {
        result.amount = best.row.amount;
        result.matched_calendar_id = best.row.calendar_id ?? null;
      } else {
        result.note_ja = "この日に該当する料金行がありません";
      }
      break;
    }
    case "derived_discount": {
      const baseOffer = offerById.get(p.base_offer_id);
      const baseResult = baseOffer ? resolvePrice(baseOffer, depth + 1) : null;
      result.base_offer_id = p.base_offer_id ?? null;
      if (baseResult?.amount == null) {
        result.note_ja = "基準料金をこの日に解決できません";
        break;
      }
      result.base_amount = baseResult.amount;
      result.amount =
        p.discount.type === "amount"
          ? Math.max(0, baseResult.amount - p.discount.value)
          : Math.max(
              0,
              Math.round((baseResult.amount * (100 - p.discount.value)) / 100),
            );
      break;
    }
    case "live_dynamic":
      result.live_lookup_required = true;
      result.live_lookup_url = p.live_lookup_url ?? null;
      result.observed_amount = p.observed_amount ?? null;
      result.observed_at = p.observed_at ?? null;
      result.note_ja = "動的価格。購入時にライブ価格の確認が必要";
      break;
    case "range":
      result.range = p.range ?? null;
      result.note_ja = "公式が幅でのみ公表";
      break;
    default:
      result.note_ja = "金額未確定（unknown）";
  }
  return result;
}

const productById = new Map((data.products ?? []).map((p) => [p.id, p]));
const toMinutes = (t) =>
  typeof t === "string" ? t.split(":").reduce((h, m) => h * 60 + Number(m), 0) : null;

/**
 * その日の営業状況を解決する。
 * 定休日と営業期間外は「営業していない」ので料金を提示しない。
 */
function resolveOperating() {
  const seasonStart = data.season?.start_date ?? null;
  const seasonEnd = data.season?.end_date ?? null;
  if (seasonStart && opts.date < seasonStart) {
    return { open: false, reason: "out_of_season", message_ja: `営業期間前（${seasonStart} から）` };
  }
  if (seasonEnd && opts.date > seasonEnd) {
    return { open: false, reason: "out_of_season", message_ja: `営業期間後（${seasonEnd} まで）` };
  }

  const matched = [];
  for (const entry of data.operating_hours ?? []) {
    let best = null;
    for (const id of entry.calendar_ids ?? []) {
      const level = calendarMatchLevel(calendarById.get(id));
      if (level != null && (best == null || level > best)) best = level;
    }
    if (best != null) matched.push({ entry, level: best });
  }
  if (matched.length === 0) {
    return {
      open: null,
      reason: "unknown",
      message_ja: "この日の営業時間が資料から判定できません（operating_hours に該当なし）",
    };
  }

  // 定休日は他の営業時間より優先する
  const closed = matched.find((m) => m.entry.hours_type === "closed");
  if (closed) {
    return {
      open: false,
      reason: "closed",
      message_ja: closed.entry.official_label_ja ?? closed.entry.name_ja ?? "定休日",
      operating_hours_id: closed.entry.id,
    };
  }

  const regular = matched.filter((m) => m.entry.hours_type !== "night");
  const night = matched.filter((m) => m.entry.hours_type === "night");
  const windowOf = (list) => {
    const starts = list.map((m) => toMinutes(m.entry.start_time)).filter((v) => v != null);
    const ends = list.map((m) => toMinutes(m.entry.end_time)).filter((v) => v != null);
    if (starts.length === 0 || ends.length === 0) return null;
    return { start: Math.min(...starts), end: Math.max(...ends) };
  };
  return {
    open: true,
    reason: "open",
    daytime: windowOf(regular),
    night: windowOf(night),
    has_night: night.length > 0,
    entries: matched.map((m) => ({
      id: m.entry.id,
      name_ja: m.entry.name_ja,
      hours_type: m.entry.hours_type,
      start_time: m.entry.start_time,
      end_time: m.entry.end_time,
      lifts: (m.entry.lifts ?? []).map((l) => ({
        name_ja: l.name_ja,
        start_time: l.start_time,
        end_time: l.end_time,
        operating: l.operating !== false,
        notes_ja: l.notes_ja ?? null,
      })),
    })),
  };
}

const operating = resolveOperating();
const wantNight = opts.night === true;

/**
 * その券で何時間滑れるかを求める。
 * calendar_day（1日券）は券自体に時間が書かれていないので営業時間から算出する。
 * rides / points は時間軸に載らないので null を返す。
 */
function skiableOf(product) {
  const v = product?.validity ?? {};
  switch (v.mode) {
    case "hours_from_first_use":
      return { hours: v.hours ?? null, start: null, end: null, fixed_window: false };
    case "hours_pool":
      // 合計N時間を複数日に分けて使う券。単日の「N時間滑りたい」には
      // 使えるが、1日券の代替にはしない（使い切る前提が違う）
      return {
        hours: v.hours ?? null,
        start: null,
        end: null,
        fixed_window: false,
        multi_visit: true,
      };
    case "fixed_time_window": {
      const start = toMinutes(v.start_time);
      const end = toMinutes(v.end_time);
      return {
        hours: start != null && end != null ? (end - start) / 60 : null,
        start,
        end,
        fixed_window: true,
      };
    }
    case "calendar_day":
    case "consecutive_days":
    case "selectable_days": {
      const w = wantNight ? operating.night : operating.daytime;
      if (!w) return { hours: null, start: null, end: null, fixed_window: false, from_operating: true };
      return {
        hours: (w.end - w.start) / 60,
        start: w.start,
        end: w.end,
        fixed_window: false,
        from_operating: true,
      };
    }
    default:
      // rides / points / other / unknown
      return { hours: null, start: null, end: null, fixed_window: false, time_comparable: false };
  }
}

/**
 * 表示用の分類名を validity から導出する。
 * かつて product_type という別フィールドがあったが、validity から100%導出できる
 * 冗長なものだったため廃止した（実データ19件で検証）。
 */
function categoryOf(product) {
  const v = product?.validity ?? {};
  switch (v.mode) {
    case "calendar_day":
      return "1日券";
    case "consecutive_days":
      return `連続${v.days ?? "?"}日券`;
    case "selectable_days":
      return `選べる${v.days ?? "?"}日券`;
    case "hours_from_first_use":
      return `${v.hours ?? "?"}時間券`;
    case "hours_pool":
      return `${v.hours ?? "?"}時間分（分割利用可）`;
    case "fixed_time_window":
      return `時間帯固定券（${v.start_time}〜${v.end_time}）`;
    case "points":
      return "ポイント券";
    case "rides":
      return (v.rides ?? 1) === 1 ? "1回券" : `${v.rides}回券`;
    default:
      return "その他";
  }
}

/** その券が「1日券」として扱えるか。複数日券・時間プール券は除く */
function isDayPass(product) {
  const v = product?.validity ?? {};
  return v.mode === "calendar_day" && (v.days ?? 1) === 1;
}

/** covers_hours_types に指定の営業区分を含むか。null（記載なし）は false 扱いにしない */
function coversNight(product) {
  const covers = product?.covers_hours_types;
  if (covers == null) return null; // 資料に記載がない
  return covers.includes("night");
}

/** 「滑る自由度を狭める制約」を列挙する。代表を選ぶときに使う */
function constraintsOf(offer, product, skiable) {
  const list = [];
  // 資格が必要な割引（会員・宿泊者・地域住民・クーポン等）は、
  // 資格の無い人に代表として出してはいけない。
  // ラベルの applies_to で判定する（条件の書き忘れに影響されない）
  for (const reason of offer.discount_reasons ?? []) {
    if (taxonomy.appliesTo("discount_reasons", reason) !== "qualified_only") continue;
    const label = taxonomy.label("discount_reasons", reason);
    const conditionText = (offer.eligibility_conditions ?? [])
      .map((c) => c.official_label_ja ?? c.description_ja ?? c.type)
      .join(", ");
    list.push({
      type: "qualification_required",
      reason,
      description_ja: `${label?.label_ja ?? reason}（${conditionText || "資格条件の記載なし"}）`,
    });
  }
  if (skiable.fixed_window) {
    const label = product?.validity?.notes_ja ?? `${product?.validity?.start_time}〜${product?.validity?.end_time}のみ`;
    list.push({ type: "time_window_fixed", description_ja: label });
  }
  if ((offer.eligibility_conditions ?? []).length > 0) {
    list.push({
      type: "eligibility_required",
      description_ja: (offer.eligibility_conditions ?? [])
        .map((c) => c.official_label_ja ?? c.description_ja ?? c.type)
        .join(", "),
    });
  }
  const deadline = offer.purchase_deadline ?? {};
  const advance =
    deadline.mode === "absolute" ||
    (deadline.mode === "relative" && (deadline.days_before_use ?? 0) >= 1);
  if (advance) {
    list.push({
      type: "advance_purchase_required",
      description_ja: deadline.official_text_ja ?? "事前購入が必要",
    });
  }
  return list;
}

const offers = [];
for (const offer of data.offers ?? []) {
  if (opts.audience && (offer.audience_ids ?? []).length > 0 && !offer.audience_ids.includes(opts.audience)) continue;
  if (opts.product && offer.product_id !== opts.product) continue;
  if (opts.channel && (offer.channel_ids ?? []).length > 0 && !offer.channel_ids.includes(opts.channel)) continue;
  if (!periodContains(offer.use_period)) continue;
  // 販売期間が終了した割引（早割など）は候補に出さない。
  // 「数日前に調べる」使い方では既に買えないため
  if (!periodContains(offer.sales_period)) continue;
  const calendarIds = offer.calendar_ids ?? [];
  let matchedCalendar = null;
  if (calendarIds.length > 0) {
    let bestLevel = null;
    for (const id of calendarIds) {
      const level = calendarMatchLevel(calendarById.get(id));
      if (level != null && (bestLevel == null || level > bestLevel)) {
        bestLevel = level;
        matchedCalendar = id;
      }
    }
    if (bestLevel == null) continue;
  }

  const product = productById.get(offer.product_id);
  const skiable = skiableOf(product);
  const constraints = constraintsOf(offer, product, skiable);
  const includedItems = (product?.included_items ?? []).map(
    (it) => it.official_label_ja ?? it.name_ja ?? it.type,
  );

  offers.push({
    id: offer.id,
    audience_ids_raw: offer.audience_ids ?? [],
    name_ja: offer.name_ja,
    official_label_ja: offer.official_label_ja,
    offer_type: offer.offer_type,
    discount_reasons: offer.discount_reasons ?? [],
    product_id: offer.product_id,
    product_label_ja: product?.official_label_ja ?? product?.name_ja ?? null,
    category_ja: categoryOf(product),
    validity_mode: product?.validity?.mode ?? null,
    skiable_hours: skiable.hours,
    skiable_window:
      skiable.start != null && skiable.end != null
        ? { start: product?.validity?.start_time ?? null, end: product?.validity?.end_time ?? null }
        : null,
    time_comparable: skiable.time_comparable !== false,
    multi_visit: skiable.multi_visit === true,
    validity_days: product?.validity?.days ?? null,
    included_items: includedItems,
    constraints,
    matched_calendar_id: matchedCalendar,
    channels: (offer.channel_ids ?? []).map((id) => ({
      id,
      name_ja: channelById.get(id)?.name_ja ?? null,
      url: channelById.get(id)?.url ?? null,
    })),
    purchase_deadline: offer.purchase_deadline ?? null,
    conditions: (offer.eligibility_conditions ?? []).map(
      (c) => c.official_label_ja ?? c.description_ja ?? c.type,
    ),
    price: resolvePrice(offer),
    confidence: offer.confidence,
  });
}

offers.sort((a, b) => (a.price.amount ?? Infinity) - (b.price.amount ?? Infinity));

/** 「滑る自由度を狭める制約」の種類。要件を明示しない限り代表にしない */
const NARROWING_CONSTRAINTS = new Set([
  "time_window_fixed",
  "eligibility_required",
  "advance_purchase_required",
  // 会員・宿泊者・地域住民など、資格を満たさないと使えない割引
  "qualification_required",
]);

/** 制約のない券だけに絞る。付帯品（食事・温泉）は自由度を狭めないので残す */
function withoutNarrowing(list) {
  return list.filter((o) => !o.constraints.some((c) => NARROWING_CONSTRAINTS.has(c.type)));
}

/** 代表より安いのに選ばなかった券を、理由付きで並べる */
function cheaperThan(representative, reasons = new Map()) {
  const out = [];
  for (const o of offers) {
    if (o.id === representative.id) continue;
    if (o.price.amount == null || o.price.amount >= representative.price.amount) continue;
    out.push({
      id: o.id,
      name_ja: o.name_ja,
      amount: o.price.amount,
      saving: representative.price.amount - o.price.amount,
      why_not_representative:
        reasons.get(o.id) ??
        (o.constraints
          .map((c) =>
            c.type === "time_window_fixed"
              ? `利用時間帯が固定（${c.description_ja}）— 開始時刻を指定すれば選べます`
              : c.type === "qualification_required"
                ? `資格が必要: ${c.description_ja} — 条件を満たす場合のみ`
                : `${c.type}: ${c.description_ja}`,
          )
          .join(" / ") ||
          null),
      constraints: o.constraints,
    });
  }
  return out.sort((a, b) => a.amount - b.amount);
}

/**
 * 「1日券が欲しい」への回答を組み立てる。
 *
 * 1日券が存在しないスキー場がある（めがひらは最長9時間券で1日券が無い）。
 * その場合は最長の時間券で代替し、**代替したことと営業時間をカバーしきれない
 * ことを明示する**。推測で料金を作らない。
 */
function selectDayPass() {
  const withNight = opts["with-night"] === true;
  const notes = [];
  const dayWindow = operating.daytime;
  const nightWindow = operating.night;
  const fullHours =
    dayWindow && nightWindow && withNight
      ? (nightWindow.end - dayWindow.start) / 60
      : dayWindow
        ? (dayWindow.end - dayWindow.start) / 60
        : null;

  if (withNight && !operating.has_night) {
    notes.push("この日はナイター営業がありません。");
  }

  const priced = offers.filter((o) => o.price.amount != null);
  const allDayPasses = priced.filter((o) => isDayPass(productById.get(o.product_id)));
  // 対象者限定（道民割等）・事前購入必須の券は代表にしない。
  // 例1で決めた規則を1日券モードにも適用する
  const dayPasses = withoutNarrowing(allDayPasses);

  // ① ナイター込み1日券
  if (withNight && operating.has_night) {
    const withNightPass = dayPasses.filter(
      (o) => coversNight(productById.get(o.product_id)) === true,
    );
    if (withNightPass.length > 0) {
      return {
        mode: "day_pass_with_night",
        representative: withNightPass[0],
        total_amount: withNightPass[0].price.amount,
        breakdown: [{ id: withNightPass[0].id, name_ja: withNightPass[0].name_ja, amount: withNightPass[0].price.amount }],
        notes_ja: notes,
      };
    }
    // ② 1日券 ＋ ナイター券の合算
    const nightOnly = priced.filter(
      (o) => coversNight(productById.get(o.product_id)) === true && !isDayPass(productById.get(o.product_id)),
    );
    const base = dayPasses[0] ?? null;
    if (base && nightOnly.length > 0) {
      const total = base.price.amount + nightOnly[0].price.amount;
      return {
        mode: "day_pass_plus_night",
        representative: base,
        total_amount: total,
        breakdown: [
          { id: base.id, name_ja: base.name_ja, amount: base.price.amount },
          { id: nightOnly[0].id, name_ja: nightOnly[0].name_ja, amount: nightOnly[0].price.amount },
        ],
        notes_ja: [...notes, "ナイター込みの1日券が無いため、1日券とナイター券の合算です。"],
      };
    }
    if (nightOnly.length === 0) {
      notes.push("ナイター単独券の料金が資料に記載されていません（推測しません）。");
    }
  }

  // ③ 1日券がある
  if (dayPasses.length > 0 || allDayPasses.length > 0) {
    const pick = dayPasses[0] ?? allDayPasses[0];
    if (dayPasses.length === 0) {
      notes.push("制約のない1日券が無いため、条件付きの券を提示しています。");
    }
    const nightFlag = coversNight(productById.get(pick.product_id));
    if (withNight && nightFlag == null) {
      notes.push("この1日券にナイターが含まれるかは資料に記載がありません。");
    }
    return {
      mode: "day_pass",
      representative: pick,
      total_amount: pick.price.amount,
      breakdown: [{ id: pick.id, name_ja: pick.name_ja, amount: pick.price.amount }],
      cheaper_alternatives: cheaperThan(pick),
      notes_ja: notes,
    };
  }

  // ④ 1日券が無い → 最長の時間券で代替（複数日券・時間プール券は除く）
  const candidates = withoutNarrowing(priced)
    .filter((o) => {
      const p = productById.get(o.product_id);
      const sk = skiableOf(p);
      if (sk.multi_visit) return false; // 25時間券などは1日券の代替にしない
      if ((p?.validity?.days ?? 1) > 1) return false; // 複数日券も除く
      return typeof sk.hours === "number";
    })
    .map((o) => ({ offer: o, hours: skiableOf(productById.get(o.product_id)).hours }));
  if (candidates.length === 0) {
    return { mode: "unavailable", representative: null, total_amount: null, breakdown: [], notes_ja: [...notes, "1日券に相当する券が見つかりません。"] };
  }
  const maxHours = Math.max(...candidates.map((c) => c.hours));
  const longest = candidates
    .filter((c) => c.hours === maxHours)
    .sort((a, b) => a.offer.price.amount - b.offer.price.amount)[0];
  notes.push(`1日券はありません。最長の${maxHours}時間券で代替しています。`);
  if (fullHours != null && maxHours < fullHours) {
    notes.push(
      `この日の営業は${fullHours}時間${withNight && operating.has_night ? "（ナイター含む）" : ""}あり、${maxHours}時間券では全時間帯をカバーできません。`,
    );
  }
  return {
    mode: "substituted_hours_pass",
    representative: longest.offer,
    total_amount: longest.offer.price.amount,
    breakdown: [{ id: longest.offer.id, name_ja: longest.offer.name_ja, amount: longest.offer.price.amount }],
    cheaper_alternatives: cheaperThan(longest.offer),
    substituted_hours: maxHours,
    operating_hours_total: fullHours,
    covers_full_day: fullHours == null ? null : maxHours >= fullHours,
    notes_ja: notes,
  };
}

/**
 * 「何時間滑りたいか」の要件で代表を1件選ぶ。
 *
 * 代表に選ばないのは「滑る自由度を狭める制約」がある券。平日ゴゴイチ券は
 * 4時間滑れるが13:00〜17:00限定なので、朝から滑りたい人の代表にはならない。
 * 付帯品（食事券・温泉）は自由度を狭めないので、安ければ代表になる。
 * 代表より安いものは cheaper_alternatives に理由付きで残す。
 */
function selectRepresentative() {
  const wantHours = opts.hours != null ? Number(opts.hours) : null;
  const wantFrom = toMinutes(opts.from ?? null);
  if (wantHours == null && wantFrom == null) return null;

  const reasons = new Map();
  const eligible = [];
  for (const o of offers) {
    if (o.price.amount == null) {
      reasons.set(o.id, "金額が確定していない");
      continue;
    }
    if (wantHours != null && !o.time_comparable) {
      reasons.set(o.id, "滑走時間で比較できない券種（回数券など）");
      continue;
    }
    // 25時間券のように合計時間を複数日へ分けて使う券は、単日の要件に対して
    // 「その日に使い切る券」と同列に並べない（買い方の前提が違う）
    if (o.multi_visit) {
      reasons.set(o.id, `複数日に分けて使う券（合計${o.skiable_hours}時間）`);
      continue;
    }
    // 複数日券も単日の代表にしない
    if ((o.validity_days ?? 1) > 1) {
      reasons.set(o.id, `${o.validity_days}日券（単日利用の代表にしない）`);
      continue;
    }
    if (wantHours != null && o.skiable_hours == null) {
      reasons.set(o.id, "この券で何時間滑れるか不明");
      continue;
    }
    if (wantHours != null && o.skiable_hours < wantHours) {
      reasons.set(o.id, `${o.skiable_hours}時間しか滑れない（希望${wantHours}時間）`);
      continue;
    }
    let optedIntoWindow = false;
    if (wantFrom != null && o.skiable_window) {
      const start = toMinutes(o.skiable_window.start);
      if (start != null && start > wantFrom) {
        reasons.set(o.id, `${o.skiable_window.start}以降しか使えない（希望${opts.from}から）`);
        continue;
      }
      // 開始時刻を明示して指定した＝その時間帯制約を受け入れたということなので、
      // 時間帯固定の券も代表候補になる（ゴゴイチ券を選べるようにする）
      optedIntoWindow = true;
    }
    eligible.push({ offer: o, optedIntoWindow });
  }

  // 自由度を狭める制約があるものは代表候補から外す（ただし候補として残す）
  const unconstrained = eligible
    .filter(({ offer: o, optedIntoWindow }) => {
      const narrowing = o.constraints.filter((c) => NARROWING_CONSTRAINTS.has(c.type));
      if (narrowing.length === 0) return true;
      // 時間帯固定は「利用者が受け入れた」場合のみ許容する
      return (
        optedIntoWindow &&
        narrowing.every((c) => c.type === "time_window_fixed")
      );
    })
    .map(({ offer }) => offer);
  const requirement = { hours: wantHours, from: opts.from ?? null, night: wantNight };
  const representative = unconstrained[0] ?? eligible[0]?.offer ?? null;
  if (!representative) {
    return { representative: null, cheaper_alternatives: [], requirement };
  }

  const cheaper = [];
  for (const o of offers) {
    if (o.id === representative.id) continue;
    if (o.price.amount == null || o.price.amount >= representative.price.amount) continue;
    cheaper.push({
      id: o.id,
      name_ja: o.name_ja,
      amount: o.price.amount,
      saving: representative.price.amount - o.price.amount,
      // なぜ代表にしなかったのか。UIで「もっと安いものがあります」と出すための理由
      why_not_representative:
        reasons.get(o.id) ??
        o.constraints
          .map((c) =>
            c.type === "time_window_fixed"
              ? `利用時間帯が固定（${c.description_ja}）— 開始時刻を指定すれば選べます`
              : c.type === "qualification_required"
                ? `資格が必要: ${c.description_ja} — 条件を満たす場合のみ`
                : `${c.type}: ${c.description_ja}`,
          )
          .join(" / ") ??
        null,
      constraints: o.constraints,
    });
  }
  return { representative, cheaper_alternatives: cheaper, requirement };
}

const wantDayPass = opts["day-pass"] === true;
const selection =
  operating.open === false
    ? null
    : wantDayPass
      ? selectDayPass()
      : selectRepresentative();
const partyResult = operating.open === false ? null : calculateParty();

/**
 * パーティ構成に party_rules を適用して合計金額を計算する。
 *
 * 「大人1人につき未就学児2人無料」「大人2＋小学生2で合計14,000円」のように
 * **同行者構成で料金が決まるもの**は、1人ずつの最安を足しただけでは正しい合計に
 * ならない。party_rules を適用した合計と、個別最安の合計を比べて安い方を返す。
 *
 * --party の書式: "adult:2,elementary:2"（audience-id:人数 のカンマ区切り）
 */
/**
 * その人が普通に滑れる券の中で最安のものを返す。
 *
 * 「滑る自由度を狭める制約」がある券は除外する。ナイター券のような時間帯固定券は
 * 単純な最安として選ぶと誤り（朝から滑る前提の合計に夜だけの券が混ざる）。
 * 代表選択（selectRepresentative）と同じ基準を使う。
 */
function cheapestPerPerson(audienceId) {
  const wantHours = opts.hours != null ? Number(opts.hours) : null;
  const narrowing = new Set([
    "time_window_fixed",
    "eligibility_required",
    "advance_purchase_required",
  ]);
  const candidates = offers.filter((o) => {
    if (o.price.amount == null) return false;
    if (!(o.audience_ids_raw ?? []).includes(audienceId)) return false;
    if (o.multi_visit) return false;
    if ((o.validity_days ?? 1) > 1) return false;
    if (o.constraints.some((c) => narrowing.has(c.type))) return false;
    if (wantDayPass && !isDayPass(productById.get(o.product_id))) return false;
    if (wantHours != null) {
      if (!o.time_comparable || o.skiable_hours == null) return false;
      if (o.skiable_hours < wantHours) return false;
    }
    // ナイターだけの券は --night を指定したときのみ対象にする
    const covers = productById.get(o.product_id)?.covers_hours_types;
    if (!wantNight && Array.isArray(covers) && !covers.includes("regular")) return false;
    return true;
  });
  return candidates.length > 0 ? candidates[0] : null;
}

function applyPartyRules(party) {
  const applicable = (data.party_rules ?? []).filter((rule) => {
    const ids = rule.calendar_ids ?? [];
    const dateOk =
      ids.length === 0 ||
      ids.some((id) => calendarMatchLevel(calendarById.get(id)) != null);
    return dateOk && periodContains(rule.use_period) && periodContains(rule.sales_period);
  });

  const results = [];
  for (const rule of applicable) {
    const remaining = new Map(party);
    const lines = [];
    let total = 0;
    let usable = true;
    // fixed_total は「セット全体の合計」なので1度だけ加算する
    const fixedTotal = (rule.components ?? []).find(
      (c) => c.price_effect?.type === "fixed_total",
    )?.price_effect?.amount;

    for (const component of rule.components ?? []) {
      const ids = component.audience_ids ?? [];
      const available = ids.reduce((sum, id) => sum + (remaining.get(id) ?? 0), 0);
      const min = component.min_count ?? 0;
      if (available < min) {
        usable = false;
        break;
      }
      // per_qualifying_count: 「大人1名につき未就学児2名まで」
      let take = component.max_count ?? available;
      if (component.per_qualifying_count != null) {
        const qualifying = lines.reduce((sum, l) => sum + l.count, 0);
        take = Math.min(available, qualifying * component.per_qualifying_count);
      }
      take = Math.min(take, available);
      if (take <= 0 && min > 0) {
        usable = false;
        break;
      }
      let left = take;
      for (const id of ids) {
        const have = remaining.get(id) ?? 0;
        const used = Math.min(have, left);
        if (used > 0) {
          remaining.set(id, have - used);
          left -= used;
        }
      }
      const effect = component.price_effect ?? {};
      let amount = 0;
      if (effect.type === "free") {
        amount = 0;
      } else if (effect.type === "fixed_per_person") {
        amount = (effect.amount ?? 0) * take;
      } else if (effect.type === "fixed_total") {
        amount = 0; // セット合計として後で加算する
      } else if (fixedTotal != null) {
        // セット合計が別componentで指定されているので個別金額は持たない
        amount = 0;
      } else {
        // discount_amount / discount_percent / other は個別料金を基準にする
        const base = cheapestPerPerson(ids[0]);
        const unit = base?.price.amount ?? null;
        if (unit == null) {
          usable = false;
          break;
        }
        if (effect.type === "discount_amount") amount = Math.max(0, unit - (effect.amount ?? 0)) * take;
        else if (effect.type === "discount_percent")
          amount = Math.round((unit * (100 - (effect.percent ?? 0))) / 100) * take;
        else amount = unit * take;
      }
      total += amount;
      lines.push({ role_ja: component.role_ja, audience_ids: ids, count: take, amount });
    }
    if (!usable) continue;
    if (fixedTotal != null) {
      total = fixedTotal;
      // 内訳が合計と矛盾しないよう、セット料金は1行にまとめる
      for (const line of lines) line.amount = null;
      lines.push({
        role_ja: "セット合計",
        audience_ids: [],
        count: lines.reduce((sum, l) => sum + l.count, 0),
        amount: fixedTotal,
      });
    }

    // ルールでカバーされなかった人は個別最安を足す
    let leftoverTotal = 0;
    const leftover = [];
    for (const [id, count] of remaining) {
      if (count <= 0) continue;
      const best = cheapestPerPerson(id);
      if (!best) {
        usable = false;
        break;
      }
      leftoverTotal += best.price.amount * count;
      leftover.push({ audience_id: id, count, offer_id: best.id, amount: best.price.amount * count });
    }
    if (!usable) continue;
    results.push({
      rule_id: rule.id,
      name_ja: rule.name_ja,
      official_label_ja: rule.official_label_ja,
      rule_type: rule.rule_type,
      total_amount: total + leftoverTotal,
      covered: lines,
      leftover,
    });
  }
  return results;
}

function calculateParty() {
  const spec = opts.party;
  if (!spec) return null;
  const party = new Map();
  for (const chunk of String(spec).split(",")) {
    const [id, count] = chunk.split(":");
    if (!id) continue;
    party.set(id.trim(), Number(count ?? 1));
  }
  const unknown = [...party.keys()].filter(
    (id) => !(data.audiences ?? []).some((a) => a.id === id),
  );
  if (unknown.length > 0) {
    return { error_ja: `audience が見つかりません: ${unknown.join(", ")}` };
  }

  // 基準: 1人ずつ最安を足した合計
  const individual = [];
  let individualTotal = 0;
  let complete = true;
  for (const [id, count] of party) {
    const best = cheapestPerPerson(id);
    if (!best) {
      complete = false;
      individual.push({ audience_id: id, count, offer_id: null, amount: null });
      continue;
    }
    individualTotal += best.price.amount * count;
    individual.push({
      audience_id: id,
      count,
      offer_id: best.id,
      name_ja: best.name_ja,
      unit_amount: best.price.amount,
      amount: best.price.amount * count,
    });
  }

  const ruleResults = applyPartyRules(party).sort(
    (a, b) => a.total_amount - b.total_amount,
  );
  const options = [
    ...(complete
      ? [{ kind: "individual", name_ja: "個別に購入", total_amount: individualTotal, breakdown: individual }]
      : []),
    ...ruleResults.map((r) => ({ kind: "party_rule", ...r })),
  ].sort((a, b) => a.total_amount - b.total_amount);

  return {
    party: Object.fromEntries(party),
    individual_total: complete ? individualTotal : null,
    cheapest: options[0] ?? null,
    options,
    notes_ja: complete ? [] : ["一部のaudienceに適用できる料金が見つかりませんでした。"],
  };
}

const partyRules = (data.party_rules ?? [])
  .filter((rule) => {
    const ids = rule.calendar_ids ?? [];
    return (
      ids.length === 0 ||
      ids.some((id) => calendarMatchLevel(calendarById.get(id)) != null)
    );
  })
  .filter((rule) => periodContains(rule.use_period))
  .map((rule) => ({ id: rule.id, name_ja: rule.name_ja, description_ja: rule.description_ja }));

// 営業していない日に料金を出さない
const notOpen = operating.open === false;

const output = {
  file: files[0],
  resort: data.resort?.id ?? null,
  season: data.season?.id ?? null,
  date: opts.date,
  day: info,
  operating,
  filters: {
    audience: opts.audience ?? null,
    product: opts.product ?? null,
    channel: opts.channel ?? null,
    hours: opts.hours ?? null,
    from: opts.from ?? null,
    night: wantNight,
  },
  offers: notOpen ? [] : offers,
  selection,
  party_calculation: partyResult,
  party_rules: notOpen ? [] : partyRules,
};

if (opts.json) {
  console.log(JSON.stringify(output, null, 2));
} else {
  const dayLabel = info.holiday_name
    ? `${info.day_of_week}曜・祝日（${info.holiday_name}）`
    : `${info.day_of_week}曜${info.is_weekday ? "・平日" : ""}`;
  console.log(`${opts.date} (${dayLabel}) @ ${output.resort} [${output.season}]`);

  const fmtWindow = (w) =>
    w ? `${String(Math.floor(w.start / 60)).padStart(2, "0")}:${String(w.start % 60).padStart(2, "0")}〜${String(Math.floor(w.end / 60)).padStart(2, "0")}:${String(w.end % 60).padStart(2, "0")}` : "不明";

  if (notOpen) {
    console.log(`  営業していません: ${operating.message_ja}`);
    console.log("  （営業していない日の料金は提示しません）");
    process.exit(0);
  }
  if (operating.open === null) {
    console.log(`  ⚠ ${operating.message_ja}`);
  } else {
    console.log(`  営業時間: ${fmtWindow(operating.daytime)}`);
    console.log(
      operating.has_night
        ? `  ナイター: あり ${fmtWindow(operating.night)}`
        : "  ナイター: なし",
    );
    for (const e of operating.entries ?? []) {
      for (const l of e.lifts ?? []) {
        const t = l.operating ? `${l.start_time}〜${l.end_time}` : "運休";
        console.log(`    [${e.hours_type}] ${l.name_ja}: ${t}${l.notes_ja ? `（${l.notes_ja}）` : ""}`);
      }
    }
  }

  if (selection && wantDayPass) {
    console.log("");
    console.log(`  条件: 1日券${opts["with-night"] ? "（ナイターあり）" : "（ナイターなし）"}`);
    if (selection.representative) {
      const parts = selection.breakdown
        .map((b) => `${b.name_ja} ¥${b.amount.toLocaleString("ja-JP")}`)
        .join(" ＋ ");
      console.log(`  ▶ ¥${selection.total_amount.toLocaleString("ja-JP")}  ${parts}`);
    } else {
      console.log("  ▶ 該当する券がありません");
    }
    for (const a of selection.cheaper_alternatives ?? []) {
      console.log(
        `    ↓ もっと安い: ¥${a.amount.toLocaleString("ja-JP")}（-¥${a.saving.toLocaleString("ja-JP")}） ${a.name_ja} — ${a.why_not_representative}`,
      );
    }
    for (const n of selection.notes_ja ?? []) console.log(`    ※ ${n}`);
    console.log("");
    console.log("  すべての候補:");
  } else if (selection) {
    const req = selection.requirement;
    console.log("");
    console.log(
      `  条件: ${req.hours != null ? `${req.hours}時間以上` : ""}${req.from ? ` / ${req.from}から` : ""}${req.night ? " / ナイター" : ""}`,
    );
    if (selection.representative) {
      const r = selection.representative;
      console.log(
        `  ▶ 代表: ¥${r.price.amount.toLocaleString("ja-JP")} ${r.name_ja}（${r.skiable_hours}時間）`,
      );
    } else {
      console.log("  ▶ 条件を満たす券がありません");
    }
    for (const a of selection.cheaper_alternatives) {
      console.log(
        `    ↓ もっと安い: ¥${a.amount.toLocaleString("ja-JP")}（-¥${a.saving.toLocaleString("ja-JP")}） ${a.name_ja} — ${a.why_not_representative}`,
      );
    }
    console.log("");
    console.log("  すべての候補:");
  }

  if (offers.length === 0) {
    console.log("該当するofferがありません。");
  }
  for (const o of offers) {
    const price =
      o.price.amount != null
        ? `¥${o.price.amount.toLocaleString("ja-JP")}`
        : (o.price.note_ja ?? "金額未確定");
    const deadline = o.purchase_deadline?.official_text_ja
      ? ` / 購入期限: ${o.purchase_deadline.official_text_ja}`
      : "";
    const conds = o.conditions.length > 0 ? ` / 条件: ${o.conditions.join(", ")}` : "";
    console.log(`  ${price}  ${o.name_ja} (${o.id})${deadline}${conds}`);
  }
  for (const r of partyRules) {
    console.log(`  [party] ${r.name_ja}: ${r.description_ja}`);
  }

  if (partyResult) {
    console.log("");
    if (partyResult.error_ja) {
      console.log(`  パーティ計算: ${partyResult.error_ja}`);
    } else {
      const members = Object.entries(partyResult.party)
        .map(([id, n]) => `${id}×${n}`)
        .join(" ＋ ");
      console.log(`  パーティ: ${members}`);
      for (const option of partyResult.options) {
        const mark = option === partyResult.cheapest ? "▶ 最安" : "      ";
        const label =
          option.kind === "individual"
            ? "個別に購入"
            : `${option.official_label_ja ?? option.name_ja}（${option.rule_type}）`;
        console.log(
          `  ${mark} ¥${option.total_amount.toLocaleString("ja-JP")}  ${label}`,
        );
        if (option.kind === "individual") {
          for (const b of option.breakdown) {
            console.log(
              `           ${b.audience_id}×${b.count}: ${b.name_ja ?? "(該当なし)"} ¥${(b.unit_amount ?? 0).toLocaleString("ja-JP")} → ¥${(b.amount ?? 0).toLocaleString("ja-JP")}`,
            );
          }
        } else {
          for (const c of option.covered) {
            const amount =
              c.amount == null ? "（セット料金に含む）" : `¥${c.amount.toLocaleString("ja-JP")}`;
            console.log(`           ${c.role_ja}×${c.count}: ${amount}`);
          }
          for (const l of option.leftover) {
            console.log(
              `           （ルール外）${l.audience_id}×${l.count}: ¥${l.amount.toLocaleString("ja-JP")}`,
            );
          }
        }
      }
      for (const n of partyResult.notes_ja) console.log(`    ※ ${n}`);
    }
  }
}
