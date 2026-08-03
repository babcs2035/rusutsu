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
 *   無ければ「1日券 ＋ ナイター単独券（covers_hours_types が ["night"] の
 *   fixed_time_window）」の合算を出す。ナイター単独券が資料に無い場合は
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
 *   - included_day_types の weekday = 月〜金かつ祝日でない（標準カレンダー準拠）
 *   - saturday / sunday / public_holiday = 標準カレンダー準拠
 *     （祝日は jp-holidays.mjs で計算。振替休日・国民の休日を含む）
 *   - year_end_new_year / special = 単独では日付に一致しない。
 *     必ず公式資料の included_date_ranges / included_dates で指定する
 *   - 平日・休日など既存区分から別区分へ日を移す場合は、
 *     元区分の excluded_dates / excluded_date_ranges と、適用先区分の
 *     included_dates / included_date_ranges を必ずペアで記録する
 *   - 一致したofferはすべて候補に残し、暗黙のカレンダー優先順位は設けない
 *   - excluded_dates / excluded_date_ranges に含まれる日は不一致
 *
 * シナリオテスト（SKILL.md 手順9）にもこのスクリプトを使う。
 */
import { dayInfo } from "./jp-holidays.mjs";
import {
  hasTargetRestriction,
  loadTaxonomy,
  parseArgs,
  priceModeOf,
  readJson,
  targetLabels,
} from "./_lib.mjs";

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
  "today",
  "scope",
]);

if (files.length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(opts.date ?? "")) {
  console.error(
    "使い方: node lookup-price.mjs <data.json> --date YYYY-MM-DD [--today YYYY-MM-DD] [--scope single|shared] [--audience id] [--age n] [--school level] [--hours n] [--from HH:MM] [--night] [--product id] [--channel id] [--json]",
  );
  process.exit(2);
}

if (opts.today != null && !/^\d{4}-\d{2}-\d{2}$/.test(opts.today)) {
  console.error("--today は YYYY-MM-DD 形式で指定してください");
  process.exit(2);
}

if (opts.scope != null && !["single", "shared", "any"].includes(opts.scope)) {
  console.error("--scope は single（単独券）/ shared（共通券）/ any のいずれかです");
  process.exit(2);
}

const data = readJson(files[0]);
const info = dayInfo(opts.date);
const audienceById = new Map(
  (data.audiences ?? []).map((audience) => [audience.id, audience]),
);
const requestedAge = opts.age == null ? null : Number(opts.age);
if (
  requestedAge != null &&
  (!Number.isInteger(requestedAge) || requestedAge < 0 || requestedAge > 120)
) {
  console.error("--age は 0〜120 の整数で指定してください");
  process.exit(2);
}
const requestedSchool = opts.school ?? null;
const requestedAudience = opts.audience
  ? audienceById.get(opts.audience)
  : null;

/**
 * audience が未指定なら、学校区分、公式の年齢範囲、デフォルト区分の順で解決する。
 * 学校区分から年齢、年齢から学校区分は推測しない。
 */
function inferredAudienceIds() {
  if (opts.audience) return [];
  const audiences = [...audienceById.values()].filter(
    (audience) => audience.is_disability_qualified !== true,
  );
  if (requestedSchool) {
    const schoolMatches = audiences.filter((audience) =>
      (audience.school_levels ?? []).includes(requestedSchool),
    );
    if (schoolMatches.length > 0) {
      return schoolMatches.map((audience) => audience.id);
    }
  }
  if (requestedAge != null) {
    const ageMatches = audiences.filter(
      (audience) =>
        (audience.age_min != null || audience.age_max != null) &&
        (audience.age_min == null || requestedAge >= audience.age_min) &&
        (audience.age_max == null || requestedAge <= audience.age_max),
    );
    if (ageMatches.length > 0) {
      return ageMatches.map((audience) => audience.id);
    }
  }
  const defaultAudience = audiences.find(
    (audience) => audience.is_default === true,
  );
  return defaultAudience ? [defaultAudience.id] : [];
}

const acceptedAudienceIds = new Set(
  [
    opts.audience,
    requestedAudience?.is_disability_qualified === true
      ? requestedAudience.base_audience_id
      : null,
    ...inferredAudienceIds(),
  ].filter(Boolean),
);

const hasTextValue = (v) => typeof v === "string" && v.trim().length > 0;

/** 日付文字列の差（日数）。タイムゾーンに依存させないためUTC正午で比較する */
function daysBetween(from, to) {
  const at = (text) => Date.parse(`${text}T12:00:00Z`);
  return Math.round((at(to) - at(from)) / 86400000);
}

// 「今日」は既定でシステム日付。テストや将来日の検証では --today で固定する
const today = opts.today ?? new Date().toISOString().slice(0, 10);
const daysUntilUse = daysBetween(today, opts.date);

/**
 * 照会日 (today) 時点でその券をまだ買えるか判定する。
 *
 * 「8/10に行く。今日は7/27だから14日前。前日までの前売りはまだ買える」という
 * 判断に答えるためのもの。判定できない場合は null を返す（買えないと断定しない）。
 */
function purchasabilityOf(offer) {
  const deadline = offer.purchase_deadline;
  if (!deadline) return null; // 現地購入のみ等。期限の概念がない
  if (daysUntilUse < 0) {
    return { purchasable: false, reason_ja: "利用日が過去です" };
  }
  if (hasTextValue(deadline.deadline_date) && today > deadline.deadline_date) {
    return {
      purchasable: false,
      reason_ja: `販売期限 ${deadline.deadline_date} を過ぎています`,
    };
  }
  const days = deadline.days_before_use;
  if (days != null && daysUntilUse < days) {
    return {
      purchasable: false,
      reason_ja: `利用日の${days}日前までに購入が必要ですが、あと${daysUntilUse}日しかありません`,
    };
  }
  if (deadline.same_day_allowed === false && daysUntilUse < 1) {
    return { purchasable: false, reason_ja: "当日は購入できません" };
  }
  if (deadline.same_day_allowed == null) {
    return { purchasable: null, reason_ja: "購入期限が公式資料に記載されていません" };
  }
  if (days != null && days >= 1) {
    const margin = daysUntilUse - days;
    return {
      purchasable: true,
      reason_ja:
        margin === 0
          ? "今日が購入期限です"
          : `あと${margin}日以内に購入すれば買えます`,
    };
  }
  return { purchasable: true, reason_ja: "当日でも購入できます" };
}
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

function calendarMatches(cal) {
  if (!cal) return false;
  if ((cal.excluded_dates ?? []).includes(opts.date)) return false;
  if (
    (cal.excluded_date_ranges ?? []).some(
      (r) => r.start <= opts.date && opts.date <= r.end,
    )
  ) {
    return false;
  }
  return (
    (cal.included_dates ?? []).includes(opts.date) ||
    (cal.included_date_ranges ?? []).some((r) => r.start <= opts.date && opts.date <= r.end)
    || (cal.included_day_types ?? []).some(dayTypeMatches)
  );
}

function offerMatchesCalendar(offer) {
  if (!periodContains(offer.use_period)) return false;
  const calendarIds = offer.calendar_ids ?? [];
  return calendarIds.length === 0 ||
    calendarIds.some((id) => calendarMatches(calendarById.get(id)));
}

function periodContains(period) {
  if (!period) return true;
  if (typeof period.start === "string" && opts.date < period.start) return false;
  if (typeof period.end === "string" && opts.date > period.end) return false;
  return true;
}

function resolvePrice(offer, depth = 0) {
  const p = offer.price ?? {};
  const mode = priceModeOf(p);
  const result = { mode, amount: null };
  if (depth > 5) {
    result.note_ja = "derived_discountの参照が深すぎます（循環の可能性）";
    return result;
  }
  switch (mode) {
    case "fixed":
      result.amount = p.amount;
      break;
    case "free":
      result.amount = 0;
      break;
    case "derived_discount": {
      const baseOffer = offerById.get(p.base_offer_id);
      const baseResult = baseOffer ? resolvePrice(baseOffer, depth + 1) : null;
      result.base_offer_id = p.base_offer_id ?? null;
      if (baseResult?.amount == null) {
        result.note_ja = "基準料金をこの日に解決できません";
        break;
      }
      result.base_amount = baseResult.amount;
      if (p.discount?.amount != null) {
        result.amount = Math.max(0, baseResult.amount - p.discount.amount);
      } else if (p.discount?.percent != null) {
        // 端数処理が公式に書かれていない場合の丸めは推測になるため、
        // 計算値であることを明示する（実際の請求額とずれる可能性がある）
        result.amount = Math.max(
          0,
          Math.round((baseResult.amount * (100 - p.discount.percent)) / 100),
        );
        result.note_ja = `${p.discount.percent}%引きの計算値（端数処理は公式表記を確認してください）`;
      } else {
        result.note_ja = "割引額が記録されていません";
      }
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
    if ((entry.calendar_ids ?? []).some((id) => calendarMatches(calendarById.get(id)))) {
      matched.push({ entry });
    }
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

/**
 * その券がナイター単独券か。
 *
 * ナイター券は1日券ではなく fixed_time_window（17:00〜21:00等）で表されるが、
 * covers_hours_types は fixed_time_window にも設定できる（この券自体がどの
 * 営業区分の時間帯かを表す）。"night" を含み "regular" を含まない券を
 * ナイター単独券とみなす（1日券は "regular" も含むのでここでは弾く）。
 */
function isNightOnlyTicket(product) {
  const covers = product?.covers_hours_types;
  return (
    Array.isArray(covers) && covers.includes("night") && !covers.includes("regular")
  );
}

/**
 * 制約を人間向けの1文にする。UIの「もっと安いものがある」の理由に出るので、
 * ラベル名 (advance_purchase_required 等) をそのまま見せてはいけない
 */
function describeConstraint(constraint) {
  switch (constraint.type) {
    case "time_window_fixed":
      return `利用時間帯が固定（${constraint.description_ja}）— 開始時刻を指定すれば選べます`;
    case "qualification_required":
      return `資格が必要: ${constraint.description_ja} — 条件を満たす場合のみ`;
    case "eligibility_required":
      return `対象者が限定されている: ${constraint.description_ja}`;
    case "advance_purchase_required": {
      if (constraint.purchasability_ja != null) {
        return `事前購入が必要（${constraint.description_ja}）— ${constraint.purchasability_ja}`;
      }
      return `事前購入が必要（${constraint.description_ja}）— 当日は買えません`;
    }
    default:
      return constraint.description_ja ?? constraint.type;
  }
}

/** 年齢名と年度生まれ条件を組み合わせたキャンペーンの検索年齢。 */
function nominalAgeOf(offer) {
  const explicit = offer.target_qualification?.nominal_age;
  if (Number.isInteger(explicit)) return explicit;

  // 旧データとの後方互換。新規抽出では nominal_age を必ず保存する。
  const label = [offer.name_ja, offer.official_label_ja]
    .filter(Boolean)
    .join(" ");
  const match = label.match(/(\d{1,3})\s*(?:才|歳)/);
  return match ? Number(match[1]) : null;
}

function ageGenerationNominalAgeOf(offer) {
  const nominalAge = nominalAgeOf(offer);
  if (nominalAge == null) return null;
  const qualification = [
    offer.target_qualification?.official_label_ja,
    offer.target_qualification?.description_ja,
  ]
    .filter(Boolean)
    .join(" ");
  return /\d{4}年\d{1,2}月\d{1,2}日.+\d{4}年\d{1,2}月\d{1,2}日.+生まれ/u.test(
    qualification,
  )
    ? nominalAge
    : null;
}

function isAgeGenerationOffer(offer) {
  return (
    requestedAge != null &&
    ageGenerationNominalAgeOf(offer) === requestedAge
  );
}

function ageGenerationWarnings(offer) {
  if (!isAgeGenerationOffer(offer)) return [];
  return [
    offer.target_qualification?.official_label_ja,
    ...(offer.requirements ?? []).map(
      (requirement) =>
        requirement.description_ja ??
        requirement.proof_ja ??
        null,
    ),
  ].filter(Boolean);
}

/** 「滑る自由度を狭める制約」を列挙する。代表を選ぶときに使う */
function constraintsOf(offer, product, skiable) {
  const list = [];
  const selectedDisabilityOffer =
    requestedAudience?.is_disability_qualified === true &&
    (offer.audience_ids ?? []).includes(requestedAudience.id);
  const selectedAgeGenerationOffer = isAgeGenerationOffer(offer);
  // 資格が必要な割引（会員・宿泊者・地域住民・クーポン等）は、
  // 資格の無い人に代表として出してはいけない。
  // ラベルの applies_to で判定する（条件の書き忘れに影響されない）
  for (const reason of offer.discount_reasons ?? []) {
    if (taxonomy.appliesTo("discount_reasons", reason) !== "qualified_only") continue;
    if (selectedDisabilityOffer || selectedAgeGenerationOffer) continue;
    const label = taxonomy.label("discount_reasons", reason);
    const conditionText = targetLabels(offer).join(", ");
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
  // 資格が必要な割引理由が既に説明済みなら、同じ事実を2回並べない
  // （道民割で「資格が必要: 地域割引（…）」と「対象者限定: …」が両方出ていた）
  const alreadyExplained = list.some((c) => c.type === "qualification_required");
  if (
    hasTargetRestriction(offer) &&
    !alreadyExplained &&
    !selectedDisabilityOffer &&
    !selectedAgeGenerationOffer
  ) {
    list.push({
      type: "eligibility_required",
      description_ja: targetLabels(offer).join(", "),
    });
  }
  // 前日以前に買う必要がある券は、今日決める人の代表にはしない。
  // ただし「あと何日あるからまだ買える」なら候補に出せるので判定結果も持たせる
  const deadline = offer.purchase_deadline ?? {};
  if (deadline.same_day_allowed === false) {
    const purchasability = purchasabilityOf(offer);
    list.push({
      type: "advance_purchase_required",
      description_ja: deadline.official_text_ja ?? "事前購入が必要",
      purchasable: purchasability?.purchasable ?? null,
      purchasability_ja: purchasability?.reason_ja ?? null,
    });
  }
  return list;
}

/**
 * その券が共通券か（他のスキー場でも使えるか）。
 *
 * 苗場とかぐらのように単独券と共通券の両方が売られているスキー場があるため、
 * 画面では「単独券か共通券か」を選ばせる。**分類ラベルは持たない** —
 * shared_with_resorts が空かどうかで決まる。
 */
function isSharedPass(product) {
  return (product?.shared_with_resorts ?? []).length > 0;
}

/** 共通券の相手スキー場（画面から辿るため id と名称を返す） */
function sharedResortsOf(product) {
  return (product?.shared_with_resorts ?? []).map((sw) => ({
    resort_id: sw.resort_id ?? null,
    name_ja: sw.name_ja,
  }));
}

const scope = opts.scope ?? "any";

let offers = [];
for (const offer of data.offers ?? []) {
  if (
    !opts.party &&
    acceptedAudienceIds.size > 0 &&
    (offer.audience_ids ?? []).length > 0 &&
    !(offer.audience_ids ?? []).some((id) => acceptedAudienceIds.has(id))
  ) continue;
  const campaignAge = ageGenerationNominalAgeOf(offer);
  if (
    requestedAge != null &&
    campaignAge != null &&
    campaignAge !== requestedAge
  ) continue;
  if (opts.product && offer.product_id !== opts.product) continue;
  // 単独券／共通券の絞り込み
  if (scope !== "any") {
    const shared = isSharedPass(productById.get(offer.product_id));
    if (scope === "single" && shared) continue;
    if (scope === "shared" && !shared) continue;
  }
  if (opts.channel && (offer.channel_ids ?? []).length > 0 && !offer.channel_ids.includes(opts.channel)) continue;
  // 販売期間が終了した割引（早割など）は候補に出さない。
  // 「数日前に調べる」使い方では既に買えないため
  if (!periodContains(offer.sales_period)) continue;
  if (!offerMatchesCalendar(offer)) continue;
  let matchedCalendar = null;
  if ((offer.calendar_ids ?? []).length > 0) {
    for (const id of offer.calendar_ids ?? []) {
      if (calendarMatches(calendarById.get(id))) {
        matchedCalendar = id;
        break;
      }
    }
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
    discount_reasons: offer.discount_reasons ?? [],
    product_id: offer.product_id,
    product_label_ja: product?.official_label_ja ?? product?.name_ja ?? null,
    category_ja: categoryOf(product),
    validity_mode: product?.validity?.mode ?? null,
    shared_pass: isSharedPass(product),
    shared_with_resorts: sharedResortsOf(product),
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
    purchasability: purchasabilityOf(offer),
    conditions: targetLabels(offer),
    requirements: offer.requirements ?? [],
    age_generation_match: isAgeGenerationOffer(offer),
    warnings_ja: ageGenerationWarnings(offer),
    price: resolvePrice(offer),
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
    // 券種の理由（1日券ではない等）と制約（時間帯固定・要資格）は別の話なので
    // 両方あるときは両方見せる。ゴゴイチ券は「4時間」かつ「午後のみ」である
    const parts = [reasons.get(o.id), ...o.constraints.map(describeConstraint)].filter(
      Boolean,
    );
    out.push({
      id: o.id,
      name_ja: o.name_ja,
      amount: o.price.amount,
      saving: representative.price.amount - o.price.amount,
      // 理由の無いまま並べると「もっと安い券がある」と誤読される
      why_not_representative:
        parts.join(" / ") || "代表より安いが要件を満たすか確認が必要",
      constraints: o.constraints,
    });
  }
  return out.sort((a, b) => a.amount - b.amount);
}

/**
 * 「20才」等の年齢名で検索された年度生まれキャンペーンは自動適用する。
 * 実年齢は利用日によってずれるため、公式の生年月日範囲を必ず警告へ残す。
 */
function selectAgeGenerationOffer() {
  const candidates = offers.filter(
    (offer) =>
      offer.age_generation_match === true &&
      offer.price.amount != null,
  );
  if (candidates.length === 0) return null;
  const representative = candidates[0];
  return {
    mode: "age_generation_offer",
    representative,
    total_amount: representative.price.amount,
    breakdown: [
      {
        id: representative.id,
        name_ja: representative.name_ja,
        amount: representative.price.amount,
      },
    ],
    cheaper_alternatives: [],
    warnings_ja: representative.warnings_ja,
    notes_ja: [
      `「${requestedAge}歳」の入力に基づく料金です。対象可否は警告の生年月日範囲で確認してください。`,
    ],
  };
}

/**
 * 1日券モードで代表にしなかった理由を券ごとに作る。
 *
 * 「1日券が欲しい」に対して回数券や短時間券が安いのは当然なので、
 * 何が足りないのかを言わずに金額だけ並べると「もっと安い1日券がある」と誤読される。
 */
function dayPassReasons(representativeHours) {
  const reasons = new Map();
  for (const o of offers) {
    const product = productById.get(o.product_id);
    if (isDayPass(product)) continue; // 1日券同士の差は制約側の説明に任せる
    const skiable = skiableOf(product);
    if (skiable.multi_visit) {
      reasons.set(
        o.id,
        `合計${skiable.hours}時間を複数日に分けて使う券 — 1日券の代わりにならない`,
      );
    } else if ((product?.validity?.days ?? 1) > 1) {
      reasons.set(o.id, `${product.validity.days}日券（単日利用の代表にしない）`);
    } else if (typeof skiable.hours !== "number") {
      reasons.set(o.id, "1日券ではない（回数券などで滑走時間を比較できない）");
    } else {
      const suffix =
        representativeHours == null
          ? ""
          : `（代表は${representativeHours}時間）`;
      reasons.set(o.id, `${skiable.hours}時間券で1日分をカバーしない${suffix}`);
    }
  }
  return reasons;
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
    const nightOnly = priced.filter((o) => isNightOnlyTicket(productById.get(o.product_id)));
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
      cheaper_alternatives: cheaperThan(
        pick,
        dayPassReasons(skiableOf(productById.get(pick.product_id)).hours),
      ),
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
    cheaper_alternatives: cheaperThan(longest.offer, dayPassReasons(maxHours)),
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
        (o.constraints.map(describeConstraint).join(" / ") ||
          "代表より安いが要件を満たすか確認が必要"),
      constraints: o.constraints,
    });
  }
  return { representative, cheaper_alternatives: cheaper, requirement };
}

const wantDayPass = opts["day-pass"] === true;
const ageGenerationSelection =
  operating.open === false ? null : selectAgeGenerationOffer();
const selection =
  operating.open === false
    ? null
    : ageGenerationSelection ??
      (wantDayPass
      ? selectDayPass()
      : selectRepresentative());
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
  const candidates = offers.filter((o) => {
    if (o.price.amount == null) return false;
    if (!(o.audience_ids_raw ?? []).includes(audienceId)) return false;
    if (o.multi_visit) return false;
    if ((o.validity_days ?? 1) > 1) return false;
    // NARROWING_CONSTRAINTS を共有する。かつてここに独自のコピーがあり
    // qualification_required が漏れていて、道民割がパーティ合計に混入した
    if (o.constraints.some((c) => NARROWING_CONSTRAINTS.has(c.type))) return false;
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

/** その日に適用できる party_rule だけを返す */
function applicablePartyRules() {
  return (data.party_rules ?? []).filter((rule) => {
    const ids = rule.calendar_ids ?? [];
    const dateOk =
      ids.length === 0 ||
      ids.some((id) => calendarMatches(calendarById.get(id)));
    return dateOk && periodContains(rule.use_period) && periodContains(rule.sales_period);
  });
}

/** そのルールに「〇名につき」の比率指定があるか */
function hasQualifyingRatio(rule) {
  return (rule.components ?? []).some((c) => c.per_qualifying_count != null);
}

/**
 * party_rule を1回だけ適用する。適用できなければ null。
 *
 * 戻り値の remaining は「このルールでカバーしきれなかった人」。
 * 呼び出し側が残りに別のルールや同じルールを重ねる（bestPartyPlan）。
 *
 * ★**「大人1名につき未就学児2名まで無料」の「大人」は資格の判定であって、
 * このルールで買う人ではない。** 大人はペア券や通常券で別に買うので、
 * ここで消費してはいけない（消費すると「ペア券×2＋未就学児無料」が成立しなくなる）。
 * 資格の有無は `fullParty`（元のパーティ構成）で判定する。
 */
function applyRuleOnce(rule, party, fullParty = party) {
  const ratioRule = hasQualifyingRatio(rule);
  const ratioIndex = (rule.components ?? []).findIndex(
    (c) => c.per_qualifying_count != null,
  );
  const remaining = new Map(party);
  const lines = [];
  let total = 0;
  // fixed_total は「セット全体の合計」なので1度だけ加算する
  const fixedTotal = (rule.components ?? []).find(
    (c) => c.price_effect?.type === "fixed_total" && c.price_effect?.amount != null,
  )?.price_effect?.amount;

  for (const [index, component] of (rule.components ?? []).entries()) {
    const ids = component.audience_ids ?? [];
    // 比率指定の前にあるcomponentは「資格を満たす人」。消費せず人数だけ数える
    const isQualifier = ratioRule && index < ratioIndex;
    const pool = isQualifier ? fullParty : remaining;
    const available = ids.reduce((sum, id) => sum + (pool.get(id) ?? 0), 0);
    const min = component.min_count ?? 0;
    if (available < min) return null;
    // per_qualifying_count: 「大人1名につき未就学児2名まで」
    let take = component.max_count ?? available;
    if (component.per_qualifying_count != null) {
      const qualifying = lines.reduce((sum, l) => sum + l.count, 0);
      take = Math.min(available, qualifying * component.per_qualifying_count);
    }
    take = Math.min(take, available);
    if (take <= 0 && min > 0) return null;
    if (!isQualifier) {
      let left = take;
      for (const id of ids) {
        const have = remaining.get(id) ?? 0;
        const used = Math.min(have, left);
        if (used > 0) {
          remaining.set(id, have - used);
          left -= used;
        }
      }
    }
    // 資格判定の人はこのルールでは買わないので、金額も持たない
    if (isQualifier) {
      lines.push({
        role_ja: component.role_ja,
        audience_ids: ids,
        count: take,
        amount: null,
        qualifier: true,
      });
      continue;
    }
    const effect = component.price_effect ?? {};
    let amount = 0;
    if (effect.type === "free") {
      amount = 0;
    } else if (effect.type === "fixed_per_person") {
      amount = (effect.amount ?? 0) * take;
    } else if (effect.type === "fixed_total" || fixedTotal != null) {
      amount = 0; // セット合計として後で加算する
    } else {
      // discount_amount / discount_percent は個別料金を基準にする
      const base = cheapestPerPerson(ids[0]);
      const unit = base?.price.amount ?? null;
      if (unit == null) return null;
      if (effect.type === "discount_amount") {
        amount = Math.max(0, unit - (effect.amount ?? 0)) * take;
      } else if (effect.type === "discount_percent") {
        amount = Math.round((unit * (100 - (effect.percent ?? 0))) / 100) * take;
      } else {
        amount = unit * take;
      }
    }
    total += amount;
    lines.push({ role_ja: component.role_ja, audience_ids: ids, count: take, amount });
  }

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

  // 誰も消費しない適用は、繰り返し探索が止まらなくなるので無効扱いにする
  const consumed = [...party.entries()].reduce(
    (sum, [id, count]) => sum + (count - (remaining.get(id) ?? 0)),
    0,
  );
  if (consumed <= 0) return null;

  return { cost: total, covered: lines, remaining };
}

// 関数宣言にする（calculateParty がファイル上部で呼ばれるため巻き上げが必要）
function partyKey(party) {
  return [...party.entries()]
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, count]) => `${id}:${count}`)
    .join(",");
}

/** 全員を個別最安で買う場合の合計。解決できない人がいれば null */
function individualPlan(party) {
  const breakdown = [];
  let total = 0;
  for (const [id, count] of party) {
    if (count <= 0) continue;
    const best = cheapestPerPerson(id);
    if (!best) return null;
    total += best.price.amount * count;
    breakdown.push({
      audience_id: id,
      count,
      offer_id: best.id,
      name_ja: best.name_ja,
      unit_amount: best.price.amount,
      amount: best.price.amount * count,
    });
  }
  return { total, breakdown };
}

/**
 * パーティ全員をいくらで買えるかを、ルールの**繰り返しと組み合わせ**を含めて探索する。
 *
 * 「親1人＋子供1人のペア券」しか無いスキー場に親2人＋子供3人で行くなら、
 * **ペア券×2 ＋ 残り子供1人の個別料金**が正しい。ルールを1回だけ適用していた
 * ときは「ペア券1回＋残り4人個別」になり高すぎる金額を出していた。
 * 未就学児無料のような別のルールとも同時に成立させる必要がある
 * （ペア券×2 ＋ 未就学児無料）。
 *
 * ラベルを増やす代わりに探索で解く。同じルールを再帰で再利用できるので
 * 「何回まで適用できるか」という情報を持たなくてよい
 * （1回の適用が必ず1人以上を消費するので停止する）。
 */
function bestPartyPlan(party, rules, memo = new Map(), fullParty = party, usedRatio = new Set()) {
  const key = `${partyKey(party)}|${[...usedRatio].sort().join(",")}`;
  if (key === "") return { total: 0, steps: [] };
  if (memo.has(key)) return memo.get(key);
  memo.set(key, null); // 再入防止

  let best = null;
  const individual = individualPlan(party);
  if (individual) {
    best = {
      total: individual.total,
      steps: [{ kind: "individual", name_ja: "個別に購入", amount: individual.total, breakdown: individual.breakdown }],
    };
  }

  for (const rule of rules) {
    // 「〇名につき」の比率ルールは1回の適用で上限まで取るので、
    // 同じプランで2回適用すると上限（大人1名につき2名まで）を超えてしまう
    const ratioRule = hasQualifyingRatio(rule);
    if (ratioRule && usedRatio.has(rule.id)) continue;
    const applied = applyRuleOnce(rule, party, fullParty);
    if (!applied) continue;
    const nextUsed = ratioRule ? new Set([...usedRatio, rule.id]) : usedRatio;
    const rest = bestPartyPlan(applied.remaining, rules, memo, fullParty, nextUsed);
    if (!rest) continue;
    const total = applied.cost + rest.total;
    if (best != null && total >= best.total) continue;
    best = {
      total,
      steps: [
        {
          kind: "party_rule",
          rule_id: rule.id,
          name_ja: rule.official_label_ja ?? rule.name_ja,
          amount: applied.cost,
          covered: applied.covered,
        },
        ...rest.steps,
      ],
    };
  }

  memo.set(key, best);
  return best;
}

/** 同じルールが連続で適用された場合は「×2」とまとめて見せる */
function mergePlanSteps(steps) {
  const merged = [];
  for (const step of steps) {
    const last = merged[merged.length - 1];
    if (
      last != null &&
      last.kind === "party_rule" &&
      step.kind === "party_rule" &&
      last.rule_id === step.rule_id
    ) {
      last.applications += 1;
      last.amount += step.amount;
      continue;
    }
    merged.push({ ...step, applications: step.kind === "party_rule" ? 1 : undefined });
  }
  return merged;
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

  const rules = applicablePartyRules();
  const individual = individualPlan(party);
  const plan = bestPartyPlan(party, rules);
  if (!plan) {
    // 誰の料金が出せなかったのかを示す。「見つかりません」だけでは
    // 人間がどこを調べればよいか分からない
    const unresolved = [...party.entries()]
      .filter(([id, count]) => count > 0 && cheapestPerPerson(id) == null)
      .map(([id, count]) => {
        const audience = (data.audiences ?? []).find((a) => a.id === id);
        return { audience_id: id, name_ja: audience?.name_ja ?? id, count };
      });
    return {
      party: Object.fromEntries(party),
      individual_total: individual?.total ?? null,
      best: null,
      unresolved,
      notes_ja: [
        unresolved.length > 0
          ? `次の区分に単独で購入できる料金がありません: ${unresolved
              .map((u) => `${u.name_ja}×${u.count}`)
              .join("、")}。同伴条件付きの券しか無い場合、人数上限を超えた分の料金は公式資料に記載がない可能性があります。`
          : "パーティ全員をカバーする買い方が見つかりませんでした。",
      ],
    };
  }

  const steps = mergePlanSteps(plan.steps);
  const partyCount = [...party.values()].reduce((sum, n) => sum + n, 0);
  const fees = feesFor({ total_amount: plan.total, breakdown: collectPlanOffers(steps) }, partyCount);

  return {
    party: Object.fromEntries(party),
    individual_total: individual?.total ?? null,
    best: { total_amount: plan.total, steps },
    // ルールを使わない場合との差額。UIで「〇〇円お得」と出せる
    saving_vs_individual:
      individual == null ? null : individual.total - plan.total,
    fees,
    notes_ja: fees.notes_ja,
  };
}

/**
 * その買い方の実質負担を出す。
 *
 * `fees` に載っているのは**返ってこない追加負担だけ**（返金される保証金は
 * そもそも記録しない）。だから「券の合計 ＋ fees」がそのまま実質負担になる。
 * かつて refundable / included_in_offer_price のフラグから
 * 「窓口で払う額」「戻る額」「実質負担」の3つを出していたが、
 * 知りたいのは実質いくら払うかだけだった。
 */
function feesFor(option, partyCount) {
  const productIds = new Set(
    (option?.breakdown ?? [])
      .map((line) => offerById.get(line.offer_id)?.product_id)
      .filter(Boolean),
  );
  const applicable = (data.fees ?? []).filter((fee) => {
    if (fee.amount == null) return false;
    const targets = fee.applies_to_product_ids ?? [];
    return targets.length === 0 || targets.some((id) => productIds.has(id));
  });

  const lines = applicable.map((fee) => ({
    id: fee.id,
    name_ja: fee.official_label_ja ?? fee.name_ja,
    unit_amount: fee.amount,
    count: partyCount,
    total: fee.amount * partyCount,
  }));
  const feeTotal = lines.reduce((sum, line) => sum + line.total, 0);
  const ticketTotal = option?.total_amount ?? null;

  return {
    lines,
    fee_total: feeTotal,
    // 券の合計 ＋ 返ってこない追加負担 ＝ 実質いくら払うか
    net_total: ticketTotal == null ? null : ticketTotal + feeTotal,
    notes_ja: [],
  };
}

/** 費用の対象product判定に使うため、計画に含まれるofferを集める */
function collectPlanOffers(steps) {
  return steps.flatMap((step) =>
    step.kind === "individual" ? (step.breakdown ?? []) : [],
  );
}

const partyRules = (data.party_rules ?? [])
  .filter((rule) => {
    const ids = rule.calendar_ids ?? [];
    return (
      ids.length === 0 ||
      ids.some((id) => calendarMatches(calendarById.get(id)))
    );
  })
  .filter((rule) => periodContains(rule.use_period))
  .map((rule) => ({
    id: rule.id,
    name_ja: rule.official_label_ja ?? rule.name_ja,
    description_ja: rule.description_ja ?? null,
  }));

// 営業していない日に料金を出さない
const notOpen = operating.open === false;

const output = {
  file: files[0],
  resort: data.resort?.id ?? null,
  season: data.season?.id ?? null,
  date: opts.date,
  day: info,
  operating,
  scope,
  shared_passes: (data.products ?? [])
    .filter((p) => (p.shared_with_resorts ?? []).length > 0)
    .map((p) => ({
      product_id: p.id,
      name_ja: p.official_label_ja ?? p.name_ja,
      shared_with_resorts: (p.shared_with_resorts ?? []).map((sw) => ({
        resort_id: sw.resort_id ?? null,
        name_ja: sw.name_ja,
      })),
    })),
  filters: {
    audience: opts.audience ?? null,
    age: requestedAge,
    school: requestedSchool,
    resolved_audience_ids: [...acceptedAudienceIds],
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

  if (
    selection &&
    (wantDayPass || selection.mode === "age_generation_offer")
  ) {
    console.log("");
    console.log(
      selection.mode === "age_generation_offer"
        ? `  条件: ${requestedAge}歳`
        : `  条件: 1日券${opts["with-night"] ? "（ナイターあり）" : "（ナイターなし）"}`,
    );
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
    for (const warning of selection.warnings_ja ?? []) {
      console.log(`    ⚠ ${warning}`);
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
    console.log(`  [party] ${r.name_ja}${r.description_ja ? `: ${r.description_ja}` : ""}`);
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
      if (partyResult.best == null) {
        console.log("  パーティ全員をカバーする買い方が見つかりませんでした。");
        for (const u of partyResult.unresolved ?? []) {
          console.log(`      ${u.name_ja}×${u.count}: 単独で購入できる料金が資料にありません`);
        }
      } else {
        console.log(
          `  ▶ 最安 ¥${partyResult.best.total_amount.toLocaleString("ja-JP")}`,
        );
        for (const step of partyResult.best.steps) {
          if (step.kind === "individual") {
            if ((step.breakdown ?? []).length === 0) continue;
            console.log(`      個別に購入 ¥${step.amount.toLocaleString("ja-JP")}`);
            for (const b of step.breakdown) {
              console.log(
                `           ${b.audience_id}×${b.count}: ${b.name_ja ?? "(該当なし)"} ¥${(b.unit_amount ?? 0).toLocaleString("ja-JP")} → ¥${(b.amount ?? 0).toLocaleString("ja-JP")}`,
              );
            }
            continue;
          }
          const times = step.applications > 1 ? ` ×${step.applications}組` : "";
          console.log(
            `      ${step.name_ja}${times} ¥${step.amount.toLocaleString("ja-JP")}`,
          );
          const per = step.applications > 1 ? "（1組あたり）" : "";
          for (const c of step.covered) {
            const amount = c.qualifier
              ? "（無料枠の条件を満たす人・料金は別に計上）"
              : c.amount == null
                ? "（セット料金に含む）"
                : `¥${c.amount.toLocaleString("ja-JP")}`;
            console.log(`           ${per}${c.role_ja}×${c.count}: ${amount}`);
          }
        }
        if (partyResult.individual_total != null) {
          const saving = partyResult.saving_vs_individual ?? 0;
          console.log(
            `      （全員individualなら ¥${partyResult.individual_total.toLocaleString("ja-JP")}${saving > 0 ? ` — ¥${saving.toLocaleString("ja-JP")}お得` : ""}）`,
          );
        }
      }
      const fees = partyResult.fees;
      if (fees && fees.lines.length > 0) {
        for (const line of fees.lines) {
          console.log(
            `      ${line.name_ja} ¥${line.unit_amount.toLocaleString("ja-JP")}×${line.count} = ¥${line.total.toLocaleString("ja-JP")}`,
          );
        }
      }
      if (fees?.net_total != null) {
        console.log(`  実質負担: ¥${fees.net_total.toLocaleString("ja-JP")}`);
      }
      for (const n of partyResult.notes_ja) console.log(`    ※ ${n}`);
    }
  }
}
