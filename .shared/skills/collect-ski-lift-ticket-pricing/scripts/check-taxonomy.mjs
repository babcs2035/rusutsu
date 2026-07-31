#!/usr/bin/env node
/**
 * check-taxonomy.mjs
 *
 * リフト券料金JSONの機械判定用ラベルが references/taxonomy.json に
 * 定義されたものだけで構成されているか、およびラベル運用ルール
 * （表記揺れ禁止、other/unknownの使い方、割引理由と構造の整合）を検証する。
 *
 * 使い方:
 *   node check-taxonomy.mjs <data.json> [...] [--taxonomy path] [--strict]
 *
 * 終了コード: エラーが1件でもあれば 1（--strict時は警告でも 1）。
 */
import {
  DEFAULT_TAXONOMY_PATH,
  Reporter,
  forEachCondition,
  loadTaxonomy,
  parseArgs,
  readJson,
} from "./_lib.mjs";

const { files, opts } = parseArgs(process.argv.slice(2), ["taxonomy"]);

if (files.length === 0) {
  console.error(
    "使い方: node check-taxonomy.mjs <data.json> [...] [--taxonomy path] [--strict]",
  );
  process.exit(2);
}

const taxonomy = loadTaxonomy(opts.taxonomy ?? DEFAULT_TAXONOMY_PATH);

function checkLabel(reporter, jsonPath, value, listName, { nullable = false } = {}) {
  if (value == null) {
    if (!nullable) reporter.error(jsonPath, `${listName} のラベルが未設定です`);
    return;
  }
  const list = taxonomy.labels(listName);
  if (list == null) {
    reporter.error(jsonPath, `taxonomy に群 "${listName}" がありません（skillの不整合）`);
    return;
  }
  if (!list.includes(value)) {
    const moved = taxonomy.movedElsewhere(listName)[value];
    if (moved) {
      // 同じことを2箇所に書かせないため、別セクションへ移した概念
      reporter.error(
        jsonPath,
        `"${value}" は ${listName} では扱いません。**${moved}** で表してください（同じことを2箇所に書かせないため）`,
      );
      return;
    }
    // 起こりうる誤記を列挙するのではなく、使用可能なラベルを提示する
    reporter.error(
      jsonPath,
      `未登録ラベル "${value}" は ${listName} に存在しません。` +
        `使用可能: ${list.join(" / ")}。` +
        `どれにも当てはまらない概念なら other ＋ description_ja ＋ ` +
        `taxonomy_review_required: true にして人間へ報告してください（勝手に追加しない）。` +
        `各ラベルの意味は taxonomy.json の groups.${listName}.labels を参照`,
    );
  }
}

function checkLabelArray(reporter, jsonPath, values, listName) {
  for (const [i, v] of (values ?? []).entries()) {
    checkLabel(reporter, `${jsonPath}/${i}`, v, listName);
  }
}

/**
 * school_levels の6区分（未就学児/小学生/中学生/高校生/大学生/大学院生）に
 * 該当ラベルが無い学校区分。公式表記に現れたらラベルを追加せず人間へ通知する。
 */
const OUT_OF_SCOPE_SCHOOL_TERMS = [
  "短大",
  "短期大学",
  "専門学校",
  "専修学校",
  "高専",
  "高等専門学校",
  "夜間部",
  "通信課程",
];

function hasText(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function checkFile(file) {
  const reporter = new Reporter("taxonomy");
  let data;
  try {
    data = readJson(file);
  } catch (err) {
    reporter.error("/", err.message);
    reporter.print(file);
    return reporter;
  }

  if (data.taxonomy_version !== taxonomy.version) {
    reporter.error(
      "/taxonomy_version",
      `taxonomy_version が一致しません (データ: ${data.taxonomy_version}, taxonomy.json: ${taxonomy.version})`,
    );
  }

  const channelById = new Map((data.channels ?? []).map((c) => [c.id, c]));
  const productById = new Map((data.products ?? []).map((p) => [p.id, p]));
  const calendarById = new Map((data.calendars ?? []).map((c) => [c.id, c]));

  for (const [i, s] of (data.sources ?? []).entries()) {
    checkLabel(reporter, `/sources/${i}/type`, s.type, "source_types");
    checkLabel(
      reporter,
      `/sources/${i}/reading_confidence`,
      s.reading_confidence,
      "confidence_levels",
      { nullable: true },
    );
  }

  for (const [i, g] of (data.geographic_areas ?? []).entries()) {
    checkLabel(reporter, `/geographic_areas/${i}/level`, g.level, "geographic_levels");
  }

  for (const [i, c] of (data.calendars ?? []).entries()) {
    checkLabelArray(reporter, `/calendars/${i}/day_types`, c.day_types, "day_types");
    // year_end_new_year / special は単独では日付に一致しない。
    // 明示日付が無いと「一致する日が存在しないカレンダー」になり料金が引けない
    const NEEDS_EXPLICIT_DATES = ["year_end_new_year", "special", "unknown"];
    const needsDates = (c.day_types ?? []).filter((d) => NEEDS_EXPLICIT_DATES.includes(d));
    const hasExplicit =
      (c.dates ?? []).length > 0 || (c.date_ranges ?? []).length > 0;
    if (needsDates.length > 0 && !hasExplicit) {
      reporter.error(
        `/calendars/${i}`,
        `day_type ${needsDates.map((d) => `"${d}"`).join(" / ")} は単独では日付に一致しません。公式資料の対象日を dates（明示日）か date_ranges（期間）で指定してください（記載が無ければカレンダーを作らず unresolved_questions へ）`,
      );
    }
    // all は範囲を限定しないと無限に一致してしまう
    if ((c.day_types ?? []).includes("all") && (c.date_ranges ?? []).length === 0) {
      reporter.warn(
        `/calendars/${i}`,
        `day_type "all" は date_ranges で営業期間を限定してください（無限に一致します）`,
      );
    }
  }

  for (const [i, p] of (data.products ?? []).entries()) {
    if (p.validity?.mode === "season") {
      reporter.error(
        `/products/${i}`,
        "シーズン券はこのSkillの収集対象外です。productと関連offerを削除してください",
      );
    }
    checkLabel(reporter, `/products/${i}/validity/mode`, p.validity?.mode, "validity_modes");
    for (const [j, item] of (p.included_items ?? []).entries()) {
      checkLabel(
        reporter,
        `/products/${i}/included_items/${j}/type`,
        item.type,
        "included_item_types",
      );
    }
    // 共通券は product_type ではなく shared_with_resorts で表す。
    // 公式名称が共通券を示しているのに相手スキー場が書かれていなければ検出する
    const productLabel = `${p.official_label_ja ?? ""} ${p.name_ja ?? ""}`;
    if (
      /共通|共通券|\d+山共通|提携/.test(productLabel) &&
      (p.shared_with_resorts ?? []).length === 0
    ) {
      reporter.error(
        `/products/${i}/shared_with_resorts`,
        `公式名称「${p.official_label_ja ?? p.name_ja}」が共通券を示していますが、どのスキー場と共通かが shared_with_resorts に書かれていません（相手スキー場のJSONにも同じ共通券を記載すること）`,
      );
    }
  }

  for (const [i, ch] of (data.channels ?? []).entries()) {
    checkLabel(reporter, `/channels/${i}/channel_type`, ch.channel_type, "channel_types");
  }

  for (const [i, fee] of (data.fees ?? []).entries()) {
    checkLabel(reporter, `/fees/${i}/fee_type`, fee.fee_type, "fee_types");
  }

  checkLabel(
    reporter,
    "/data_quality/status",
    data.data_quality?.status,
    "data_quality_statuses",
  );
  checkLabel(
    reporter,
    "/calculation_policy/stacking_default",
    data.calculation_policy?.stacking_default,
    "stacking_modes",
    { nullable: true },
  );
  checkLabel(
    reporter,
    "/calculation_policy/currency",
    data.calculation_policy?.currency,
    "currencies",
    { nullable: true },
  );

  forEachCondition(data, (cond, condPath) => {
    checkLabel(reporter, `${condPath}/type`, cond.type, "condition_types");
    checkLabel(reporter, `${condPath}/match`, cond.match, "condition_match_modes", {
      nullable: true,
    });
    checkLabelArray(reporter, `${condPath}/genders`, cond.genders, "genders");
    if (cond.type === "gender" && (cond.genders ?? []).length === 0) {
      reporter.error(
        condPath,
        `type "gender" の条件には genders（["female"] 等）が必要です`,
      );
    }
    if ((cond.genders ?? []).length > 0 && cond.type !== "gender") {
      reporter.error(
        condPath,
        `genders を持つ条件は type "gender" にしてください`,
      );
    }
    checkLabelArray(reporter, `${condPath}/relationships`, cond.relationships, "area_relationships");
    checkLabelArray(reporter, `${condPath}/proof_types`, cond.proof_types, "proof_types");

    if (cond.type === "unknown") {
      if (!hasText(cond.official_label_ja)) {
        reporter.error(
          condPath,
          `type "unknown" の条件には official_label_ja（公式表記をそのまま）が必要です。何を unknown にしたのかが人間に伝わりません`,
        );
      }
      if (!hasText(cond.description_ja)) {
        reporter.error(
          condPath,
          `type "unknown" の条件には description_ja（なぜ確定できないのか）が必要です`,
        );
      }
      if (cond.unresolved !== true) {
        reporter.error(condPath, `type "unknown" の条件には unresolved: true が必要です`);
      }
    }
  });

  for (const [i, offer] of (data.offers ?? []).entries()) {
    const oPath = `/offers/${i}`;
    checkLabel(reporter, `${oPath}/offer_type`, offer.offer_type, "offer_types");
    checkLabelArray(reporter, `${oPath}/discount_reasons`, offer.discount_reasons, "discount_reasons");
    checkLabel(reporter, `${oPath}/confidence`, offer.confidence, "confidence_levels");
    checkLabel(reporter, `${oPath}/price/mode`, offer.price?.mode, "price_modes");
    checkLabel(reporter, `${oPath}/price/currency`, offer.price?.currency, "currencies", {
      nullable: true,
    });
    checkLabel(
      reporter,
      `${oPath}/stacking/stackable_with_other_discounts`,
      offer.stacking?.stackable_with_other_discounts,
      "stacking_modes",
      { nullable: true },
    );
    if (offer.price?.mode === "derived_discount") {
      checkLabel(
        reporter,
        `${oPath}/price/discount/type`,
        offer.price?.discount?.type,
        "discount_value_types",
      );
    }

    const reasons = offer.discount_reasons ?? [];
    const conditions = offer.eligibility_conditions ?? [];
    const refChannels = (offer.channel_ids ?? [])
      .map((id) => channelById.get(id))
      .filter(Boolean);

    if (offer.offer_type === "discounted" && reasons.length === 0) {
      reporter.error(
        `${oPath}/discount_reasons`,
        `offer_type "discounted" には discount_reasons が1つ以上必要です`,
      );
    }
    if (offer.offer_type === "standard" && reasons.length > 0) {
      reporter.warn(
        `${oPath}/discount_reasons`,
        `offer_type "standard" に discount_reasons が付いています。"discounted" が正しくないか確認してください`,
      );
    }

    // --- 割引理由の適用範囲と構造の整合 ---
    // qualified_only（条件を満たす人だけ）の理由に条件が書かれていないと、
    // 「誰でも使える割引」として扱われ資格の無い人に安い金額を提示してしまう。
    // 実際に会員割引を条件なしで書くと代表として選ばれる穴があった
    for (const reason of reasons) {
      const appliesTo = taxonomy.appliesTo("discount_reasons", reason);
      if (appliesTo === "qualified_only") {
        const hasRestriction =
          conditions.length > 0 ||
          // audiences 側で対象者が絞られている場合も可（障害者区分など）
          (offer.audience_ids ?? []).length > 0 &&
            (offer.audience_ids ?? []).some((id) => {
              const a = (data.audiences ?? []).find((x) => x.id === id);
              return a && a.is_default !== true;
            });
        if (!hasRestriction) {
          reporter.error(
            `${oPath}/eligibility_conditions`,
            `"${reason}" は条件を満たす人だけの割引 (applies_to: qualified_only) ですが、資格の条件が書かれていません。条件が無いと「誰でも使える割引」として扱われ、資格の無い人に安い金額を提示します。eligibility_conditions に条件を追加するか、対象者を audience_ids で絞ってください`,
          );
        }
      }
      if (appliesTo === "party_composition" && (data.party_rules ?? []).length === 0) {
        reporter.error(
          `${oPath}/discount_reasons`,
          `"${reason}" はパーティ構成から自動判定する割引 (applies_to: party_composition) です。人数・年齢構成の条件を party_rules に構造化してください（discount_reasons だけでは合計を計算できません）`,
        );
      }
    }

    // --- 割引理由と構造の整合（定義した境界を機械で守る） ---
    // 地域割引は「なぜ安いか」だけを表し、居住/在勤/在学は条件側で構造化する
    if (reasons.includes("local_resident")) {
      const areaConds = conditions.filter((c) => c.type === "area_relationship");
      if (areaConds.length === 0) {
        reporter.error(
          `${oPath}/eligibility_conditions`,
          `local_resident には type "area_relationship" の条件が必要です（居住・在勤・在学の区別と対象地域を構造化する。notes_ja に書くだけでは料金を機械的に絞れません）`,
        );
      } else if (areaConds.every((c) => (c.area_ids ?? []).length === 0)) {
        reporter.error(
          `${oPath}/eligibility_conditions`,
          `local_resident の条件に対象地域 (area_ids) がありません。geographic_areas に登録して参照してください`,
        );
      }
    }
    // 特定日割引は対象日の明示が必須。
    // レディースデー・メンズデー・シニアデー・こどもデー等は専用ラベルを作らず
    // special_day ＋ 対象者条件（gender / audiences）で表す
    if (reasons.includes("special_day")) {
      const cals = (offer.calendar_ids ?? [])
        .map((id) => calendarById.get(id))
        .filter(Boolean);
      const hasExplicitDates = cals.some(
        (c) =>
          (c.dates ?? []).length > 0 ||
          (c.date_ranges ?? []).length > 0 ||
          (c.day_types ?? []).some((d) => d !== "special" && d !== "unknown"),
      );
      if (cals.length === 0 || !hasExplicitDates) {
        reporter.error(
          `${oPath}/calendar_ids`,
          `special_day は対象日が限定された割引です。calendars に明示日付（dates / date_ranges）か曜日（day_types）を持つカレンダーを紐づけてください（day_type "special" 単独では日付に一致しません）`,
        );
      }
      // 公式名称が性別を示しているのに性別条件が無ければ、機械判定できない
      const label = `${offer.official_label_ja ?? ""} ${offer.name_ja ?? ""}`;
      const genderHint = /レディース|女性|ウーマン|メンズ|男性/.test(label);
      const hasGender = conditions.some((c) => c.type === "gender");
      if (genderHint && !hasGender) {
        reporter.error(
          `${oPath}/eligibility_conditions`,
          `公式名称「${offer.official_label_ja ?? offer.name_ja}」が性別を限定していますが性別条件がありません。type "gender" ＋ genders（["female"] 等）を追加してください`,
        );
      }
    }

    // --- 購入期限 (purchase_deadline) の構造チェック ---
    const deadline = offer.purchase_deadline ?? null;
    if (deadline) {
      checkLabel(
        reporter,
        `${oPath}/purchase_deadline/mode`,
        deadline.mode,
        "purchase_deadline_modes",
      );
      if (
        deadline.mode === "relative" &&
        deadline.days_before_use == null &&
        deadline.minutes_before_use == null
      ) {
        reporter.error(
          `${oPath}/purchase_deadline`,
          `mode "relative" には days_before_use または minutes_before_use が必要です（例: 前日まで = days_before_use: 1、15分前まで = minutes_before_use: 15）`,
        );
      }
      if (deadline.mode === "absolute" && !hasText(deadline.date)) {
        reporter.error(
          `${oPath}/purchase_deadline`,
          `mode "absolute" には date（購入期限日）が必要です`,
        );
      }
      if (
        ["relative", "absolute"].includes(deadline.mode) &&
        !hasText(deadline.official_text_ja)
      ) {
        reporter.warn(
          `${oPath}/purchase_deadline/official_text_ja`,
          `期限の公式表記 (official_text_ja) を記録することを推奨します`,
        );
      }
    }
    // 前日以前の期限（=前売り扱いにすべき期限）かどうか
    const deadlineRequiresAdvance =
      deadline != null &&
      (deadline.mode === "absolute" ||
        (deadline.mode === "relative" && (deadline.days_before_use ?? 0) >= 1));

    if (reasons.includes("online_purchase")) {
      const hasOnlineChannel = refChannels.some((ch) =>
        ["online", "app", "convenience_store"].includes(ch.channel_type),
      );
      if (!hasOnlineChannel) {
        reporter.error(
          `${oPath}/channel_ids`,
          `discount_reason "online_purchase" のofferは online/app/convenience_store いずれかのchannelを参照する必要があります`,
        );
      }
      if (!deadline) {
        reporter.error(
          `${oPath}/purchase_deadline`,
          `discount_reason "online_purchase" のofferには purchase_deadline が必須です。当日購入可なら mode "same_day_allowed"、期限があるなら "relative"/"absolute"、資料に記載が無ければ "not_stated" を明示してください`,
        );
      }
      if (deadlineRequiresAdvance && !reasons.includes("advance_purchase")) {
        reporter.error(
          `${oPath}/discount_reasons`,
          `前日以前の購入期限があるオンライン券は前売りです。discount_reasons に "advance_purchase" も追加してください（当日購入可のものだけが "online_purchase" 単独）`,
        );
      }
    }

    if (reasons.includes("advance_purchase")) {
      if (deadline?.mode === "same_day_allowed") {
        reporter.error(
          `${oPath}/purchase_deadline`,
          `当日購入可 (same_day_allowed) の券は前売りではありません。"advance_purchase" を外して "online_purchase" 等のみにしてください`,
        );
      }
      const hasDeadline =
        deadlineRequiresAdvance ||
        hasText(offer.sales_period?.end) ||
        hasText(offer.sales_period?.deadline_ja) ||
        conditions.some((c) => c.type === "purchase_deadline") ||
        refChannels.some((ch) => hasText(ch.purchase_deadline_ja));
      if (!hasDeadline) {
        reporter.error(
          `${oPath}/purchase_deadline`,
          `discount_reason "advance_purchase" のofferには前日以前の購入期限（purchase_deadline の relative days_before_use>=1 / absolute、または sales_period の期限）が必要です`,
        );
      }
    }

    // 販売経路がオンラインのみなのに期限情報が無い場合は注意喚起
    if (
      !deadline &&
      refChannels.length > 0 &&
      refChannels.every((ch) => ["online", "app"].includes(ch.channel_type))
    ) {
      reporter.warn(
        `${oPath}/purchase_deadline`,
        `オンライン販売のofferには purchase_deadline（当日可/期限あり/記載なし）を記録することを推奨します`,
      );
    }

    if (offer.offer_type === "package") {
      const product = productById.get(offer.product_id);
      if (product && (product.included_items ?? []).length === 0) {
        reporter.error(
          `${oPath}/product_id`,
          `offer_type "package"（昼食付き・温泉付き等）のofferが参照するproductには included_items が必要です`,
        );
      }
    }

    const localReasonToRelationship = {
      local_resident: "resident",
      local_worker: "employed",
      local_student: "enrolled",
    };
    for (const [reason, rel] of Object.entries(localReasonToRelationship)) {
      if (reasons.includes(reason)) {
        const ok = conditions.some(
          (c) =>
            c.type === "area_relationship" &&
            (c.relationships ?? []).includes(rel),
        );
        if (!ok) {
          reporter.error(
            `${oPath}/eligibility_conditions`,
            `discount_reason "${reason}" のofferには area_relationship 条件（relationships に "${rel}"）が必要です`,
          );
        }
      }
    }

    if (reasons.includes("hotel_guest")) {
      const ok = conditions.some(
        (c) =>
          c.type === "area_relationship" &&
          (c.relationships ?? []).includes("hotel_guest"),
      );
      if (!ok) {
        reporter.warn(
          `${oPath}/eligibility_conditions`,
          `discount_reason "hotel_guest" のofferには hotel_guest の area_relationship 条件を付けることを推奨します`,
        );
      }
    }

    if (offer.offer_type === "free" || offer.price?.mode === "free") {
      if (offer.price?.mode !== "free") {
        reporter.error(
          `${oPath}/price/mode`,
          `offer_type "free" のofferの price.mode は "free" である必要があります`,
        );
      }
      if (offer.price?.amount !== 0) {
        reporter.error(
          `${oPath}/price/amount`,
          `"free" のofferの金額は 0 である必要があります (現在: ${JSON.stringify(offer.price?.amount)})`,
        );
      }
    }

    if (offer.offer_type === "dynamic" && offer.price?.mode !== "live_dynamic") {
      reporter.error(
        `${oPath}/price/mode`,
        `offer_type "dynamic"（動的価格）のofferを固定価格として保存してはいけません。price.mode は "live_dynamic" にし、amount: null と live_lookup_required: true を設定してください`,
      );
    }
    if (offer.price?.mode === "live_dynamic" && offer.offer_type !== "dynamic") {
      reporter.warn(
        `${oPath}/offer_type`,
        `price.mode "live_dynamic" のofferは offer_type "dynamic" にすることを推奨します`,
      );
    }

    if (offer.offer_type === "discounted" && !hasText(offer.official_label_ja)) {
      reporter.warn(
        `${oPath}/official_label_ja`,
        `割引offerには公式サイト上の名称 (official_label_ja) を記録することを推奨します`,
      );
    }
    for (const label of ["official_label_ja", "name_ja"]) {
      const v = offer[label];
      if (
        hasText(v) &&
        (taxonomy.labels("discount_reasons").includes(v) ||
          taxonomy.labels("offer_types").includes(v))
      ) {
        reporter.error(
          `${oPath}/${label}`,
          `${label} に標準ラベル "${v}" がそのまま入っています。公式名称と機械判定用ラベルを分離してください`,
        );
      }
    }
  }

  for (const [i, rule] of (data.party_rules ?? []).entries()) {
    const rPath = `/party_rules/${i}`;
    checkLabel(reporter, `${rPath}/rule_type`, rule.rule_type, "party_rule_types");
    checkLabel(reporter, `${rPath}/confidence`, rule.confidence, "confidence_levels");
    for (const [j, comp] of (rule.components ?? []).entries()) {
      checkLabel(
        reporter,
        `${rPath}/components/${j}/price_effect/type`,
        comp.price_effect?.type,
        "price_effect_types",
      );
    }
  }

  checkAudienceResolution(reporter, data, taxonomy);
  const unknownItems = collectUnknownItems(data);
  if (unknownItems.length > 0) {
    // 「確定できなかった」ことを必ず人間に伝える。
    // 勝手にラベルを増やさない代わりに、報告経路を保証する
    reporter.warn(
      "/",
      `unknown にした項目が ${unknownItems.length} 件あります。完了報告の「unknown にした項目」に、項目・公式表記・確定できなかった理由を必ず記載してください`,
    );
    for (const item of unknownItems) {
      console.error(`  [unknown] ${item.path} — 公式表記「${item.text}」`);
    }
  }
  checkOperatingHours(reporter, data, taxonomy);
  checkProductValidity(reporter, data);

  reporter.print(file);
  return reporter;
}


/**
 * 年末年始の扱いが決まっているかを検証する。
 *
 * `day_types: ["weekday"]` は「月〜金かつ祝日でない日」なので、**年末年始を
 * 黙って飲み込む**。多くのスキー場で年末年始は休日料金なので、平日料金として
 * 出してしまうと安すぎる金額を提示することになる。
 *
 * 資料に年末年始の記載があるのに、どのカレンダーにも反映されていなければ指摘する。
 */
function checkYearEndDefined(reporter, data) {
  const calendars = data.calendars ?? [];
  const usesStandardWeekday = calendars.some((c) =>
    (c.day_types ?? []).some((d) => d === "weekday" || d === "weekend_holiday"),
  );
  if (!usesStandardWeekday) return;

  // 年末年始が「期間として定義されている」か（date_ranges / dates / excluded_dates のいずれか）
  const yearEndDefined = calendars.some((c) => {
    const label = `${c.official_label_ja ?? ""} ${c.name_ja ?? ""} ${c.notes_ja ?? ""}`;
    const mentions = /年末年始|年末|年始/.test(label) ||
      (c.day_types ?? []).includes("year_end_new_year");
    const hasDates =
      (c.dates ?? []).length > 0 ||
      (c.date_ranges ?? []).length > 0 ||
      (c.excluded_dates ?? []).length > 0;
    return mentions && hasDates;
  });
  if (yearEndDefined) return;

  // 資料に年末年始の記載があったかは notes / unresolved から推し量る
  const recorded = JSON.stringify(data.data_quality ?? {});
  const acknowledged = /年末年始|年末|年始/.test(recorded);
  const message =
    `平日・土日祝のカレンダーを使っていますが、年末年始の扱いが定義されていません。` +
    `day_type "weekday" は年末年始を平日として飲み込むため、年末年始が休日料金の場合に` +
    `安すぎる金額を提示します。公式に年末年始の期間・料金の記載があれば calendar を作り、` +
    `記載が無ければ unresolved_questions に記録してください`;
  if (acknowledged) reporter.warn("/calendars", message);
  else reporter.error("/calendars", message);
}

/**
 * `unknown` にした項目をすべて集める。
 *
 * `other`（条件は分かるがラベルが無い）というラベルは全群で廃止した。
 * ラベル体系は公式資料に出てくる概念を網羅しているはずなので、当てはまらない
 * ものが出たら「ラベル体系が不足している」ということである。
 * 勝手にラベルを追加させない代わりに、**どの項目を・公式表記が何で・
 * なぜ確定できなかったのかを人間に通知する。**
 */
function collectUnknownItems(data) {
  const items = [];
  const describe = (o) =>
    o.official_label_ja ??
    o.name_ja ??
    o.description_ja ??
    o.notes_ja ??
    "(公式表記の記録なし)";

  const scan = (holder, basePath) => {
    for (const [i, item] of (holder ?? []).entries()) {
      const walk = (node, pointer) => {
        if (node === null || typeof node !== "object") return;
        for (const [key, value] of Object.entries(node)) {
          const at = `${pointer}/${key}`;
          if (value === "unknown") {
            items.push({ path: at, text: describe(item) });
          } else if (Array.isArray(value) && value.includes("unknown")) {
            items.push({ path: at, text: describe(item) });
          } else if (value && typeof value === "object") {
            walk(value, at);
          }
        }
      };
      walk(item, `${basePath}/${i}`);
    }
  };
  scan(data.sources, "/sources");
  scan(data.geographic_areas, "/geographic_areas");
  scan(data.audiences, "/audiences");
  scan(data.calendars, "/calendars");
  scan(data.products, "/products");
  scan(data.channels, "/channels");
  scan(data.offers, "/offers");
  scan(data.party_rules, "/party_rules");
  scan(data.fees, "/fees");
  return items;
}

/**
 * 券の有効範囲が「1日券かどうか」「複数日にまたがるか」を判定できる形か検証する。
 *
 * 「1日券が欲しい」という問い合わせに答えるには days が必要で、
 * 「25時間券」のように合計時間を複数日に分けて使う券を 1日券や
 * 「9時間以上」の候補にしないためには hours_pool との区別が必要。
 */
function checkProductValidity(reporter, data) {
  const dayModes = ["calendar_day", "consecutive_days", "selectable_days"];
  for (const [i, product] of (data.products ?? []).entries()) {
    const path = `/products/${i}`;
    const v = product.validity ?? {};

    if (dayModes.includes(v.mode)) {
      if (v.days == null) {
        reporter.error(
          `${path}/validity/days`,
          `mode "${v.mode}" では days が必須です（1日券なら 1、2日券なら 2）。「当日有効」としか書かれていない場合は 1、本当に不明なら mode を "unknown" にしてください`,
        );
      } else if (v.mode === "calendar_day" && v.days !== 1) {
        reporter.error(
          `${path}/validity`,
          `mode "calendar_day" は1日券を表します。複数日券は consecutive_days（連続）か selectable_days（分割可）にしてください`,
        );
      }
    }

    if (v.usable_within != null) {
      checkLabel(
        reporter,
        `${path}/validity/usable_within/type`,
        v.usable_within.type,
        "usable_within_types",
      );
    }
    if (v.mode === "selectable_days" && v.usable_within == null) {
      reporter.warn(
        `${path}/validity/usable_within`,
        `分割して使える複数日券は有効範囲（シーズン中 / 購入から30日以内 等）を usable_within に記録してください`,
      );
    }

    if ((v.mode === "hours_from_first_use" || v.mode === "hours_pool") && v.hours == null) {
      reporter.error(`${path}/validity/hours`, `mode "${v.mode}" では hours が必須です`);
    }

    // 「初回利用から連続24時間以上」は現実的に営業時間を超える。
    // 複数日に分けて使う券を hours_from_first_use にしている可能性が高い
    if (v.mode === "hours_from_first_use" && (v.hours ?? 0) >= 24) {
      reporter.error(
        `${path}/validity`,
        `${v.hours}時間を「初回利用から連続」として記録しています。複数日に分けて使える券なら mode を "hours_pool" にしてください（1日券や「N時間以上」の候補として誤って選ばれます）`,
      );
    }

    // covers_hours_types は1日券・複数日券にのみ設定する。
    // 時間券は validity の時間帯・時間数から判定できるので、設定すると
    // validity と二重になり矛盾しうる
    const DAY_MODES = ["calendar_day", "consecutive_days", "selectable_days"];
    if (product.covers_hours_types != null && !DAY_MODES.includes(v.mode)) {
      reporter.error(
        `${path}/covers_hours_types`,
        `covers_hours_types は1日券・複数日券にのみ設定します（mode "${v.mode}" は validity の時間情報から判定できるため不要。二重管理になり矛盾しうる）`,
      );
    }

    if (v.mode === "fixed_time_window" && (v.start_time == null || v.end_time == null)) {
      reporter.error(
        `${path}/validity`,
        `mode "fixed_time_window" では start_time / end_time が必須です`,
      );
    }

    const covers = product.covers_hours_types;
    if (covers != null) {
      for (const value of covers) {
        checkLabel(reporter, `${path}/covers_hours_types`, value, "covers_hours_types");
      }
    }
    // 公式名称がナイターを示しているのに営業区分の指定が無いと、
    // 「1日券（ナイターあり）」の合算に使えない。
    // product_type からは判定できないので公式名称で検出する
    const label = `${product.official_label_ja ?? ""} ${product.name_ja ?? ""}`;
    if (
      /ナイター|ナイト|night/i.test(label) &&
      covers == null &&
      DAY_MODES.includes(v.mode)
    ) {
      reporter.error(
        `${path}/covers_hours_types`,
        `公式名称「${product.official_label_ja ?? product.name_ja}」がナイターを示す1日券ですが covers_hours_types がありません。["regular","night"]（ナイター込み）を設定してください`,
      );
    }
    // ナイター券が時間帯で表されているかを確認する（1日券以外）
    if (
      /ナイター|ナイト|night/i.test(label) &&
      !DAY_MODES.includes(v.mode) &&
      v.mode !== "fixed_time_window"
    ) {
      reporter.warn(
        `${path}/validity`,
        `ナイター券は利用時間帯が決まっているので fixed_time_window（start_time / end_time）で表すことを推奨します`,
      );
    }
  }
}

/**
 * 「50歳の大人」「23歳の大学生」のような入力から audience を解決できる状態か検証する。
 *
 * 多くのスキー場は「大人：中学生以上」のように上限・下限で区分を書く。これを
 * school_levels の列挙で表そうとすると（中学・高校・大学・大学院・短大・専門・
 * 社会人…）必ず網羅漏れが起きる。そこで「どの条件にも当てはまらなければ大人」
 * というデフォルトを1件だけ置き、他の区分には必ず判定条件を持たせる。
 */
function checkAudienceResolution(reporter, data, taxonomy) {
  const audiences = data.audiences ?? [];
  if (audiences.length === 0) return;

  const defaults = audiences.filter((a) => a.is_default === true);

  if (defaults.length === 0) {
    reporter.error(
      "/audiences",
      `どの条件にも当てはまらなかったときに適用する区分がありません。基準となる区分（多くの場合「大人」）に is_default: true を付けてください`,
    );
  } else if (defaults.length > 1) {
    reporter.error(
      "/audiences",
      `is_default: true が${defaults.length}件あります（${defaults.map((a) => a.id).join(", ")}）。ちょうど1件にしてください`,
    );
  }

  for (const [i, audience] of audiences.entries()) {
    const path = `/audiences/${i}`;
    for (const level of audience.school_levels ?? []) {
      checkLabel(reporter, `${path}/school_levels`, level, "school_levels");
    }
    if (audience.age_min != null && audience.age_max != null) {
      if (audience.age_min > audience.age_max) {
        reporter.error(`${path}`, `age_min が age_max より大きいです`);
      }
    }

    const officialLabel = audience.official_label_ja ?? audience.name_ja ?? "";
    const levels = audience.school_levels ?? [];

    // 基準区分（どの条件にも当てはまらなければこれ）は、学校区分を列挙してはいけない。
    // 「中学生以上」は社会人を含むため学校区分では表せず、列挙すると社会人が漏れる。
    // テキストで「〜以上」を判定しようとすると「中学生」に「学生」が含まれるため
    // 破綻する。構造（is_default であること）で判定する。
    if (audience.is_default === true && levels.length > 0) {
      reporter.error(
        `${path}/school_levels`,
        `is_default: true の区分に学校区分が列挙されています（${levels.join(", ")}）。基準区分は「どの条件にも当てはまらなければこれ」なので、学校区分を列挙すると社会人が漏れます（「中学生以上」は学校区分では表せない）。school_levels を空にしてください`,
      );
    }

    // 学校区分から年齢を推測していないか。
    // 公式表記に無い数値が age に入っていたら「中学生→13歳」のような補完の疑い
    const ageSource = `${officialLabel} ${audience.age_basis_ja ?? ""} ${audience.notes_ja ?? ""}`;
    for (const key of ["age_min", "age_max"]) {
      const value = audience[key];
      if (value == null) continue;
      if (!new RegExp(`${value}\\s*(歳|才)`).test(ageSource)) {
        reporter.error(
          `${path}/${key}`,
          `${key}: ${value} が公式表記に現れません（「${officialLabel}」）。学校区分から年齢を推測してはいけません（絶対原則1）。公式に年齢の数値が無ければ null にしてください`,
        );
      }
    }

    // 6区分に無い学校区分が公式表記に含まれていないか。
    // ラベルを勝手に増やさない代わりに、見落とさないよう人間へ通知する
    const officialText = `${officialLabel} ${audience.notes_ja ?? ""}`;
    const outOfScope = OUT_OF_SCOPE_SCHOOL_TERMS.filter((term) =>
      officialText.includes(term),
    );
    if (outOfScope.length > 0) {
      const reviewText = (data.data_quality?.human_review_required ?? []).join(" ");
      const notified = outOfScope.every((term) => reviewText.includes(term));
      if (!notified) {
        reporter.error(
          `${path}`,
          `公式表記に school_levels の6区分に無い学校区分（${outOfScope.join("、")}）が含まれています。` +
            `ラベルを追加せず、data_quality.human_review_required に公式表記とともに記録して人間へ通知してください`,
        );
      }
      console.error(
        `  [学校区分ラベルなし] ${path}: ${outOfScope.join("、")} — 公式表記「${audience.official_label_ja ?? audience.name_ja}」`,
      );
    }

    // デフォルト以外は必ず判定条件を持つ。持たないと入力から解決できない
    if (audience.is_default === true) continue;
    const hasCondition =
      audience.age_min != null ||
      audience.age_max != null ||
      (audience.school_levels ?? []).length > 0;
    if (!hasCondition) {
      reporter.error(
        `${path}`,
        `年齢も学校区分も指定が無いため「この人がこの区分か」を判定できません。age_min/age_max か school_levels を設定するか、基準区分なら is_default: true を付けてください`,
      );
    }
  }
}

/**
 * 営業時間の整合性を検証する。
 *
 * 定休日に料金を出さないため、また「1日券が何時間滑れるか」を算出するために
 * 営業時間が必要になる。
 */
function checkOperatingHours(reporter, data, taxonomy) {
  const entries = data.operating_hours ?? [];
  const calendarIds = new Set((data.calendars ?? []).map((c) => c.id));

  if (entries.length === 0) {
    // 料金がまだ1件も無い雛形は対象外（作成途中を止めない）
    if ((data.offers ?? []).length === 0) {
      reporter.warn(
        "/operating_hours",
        `営業時間がまだありません。offerを追加する前に営業時間を記録してください`,
      );
      return;
    }
    // calendar_day / package の券は営業時間が無いと滑走時間が確定しない
    const needsHours = (data.products ?? []).filter(
      (p) => p.validity?.mode === "calendar_day",
    );
    const message =
      needsHours.length > 0
        ? `営業時間 (operating_hours) がありません。1日券（${needsHours.map((p) => p.id).join(", ")}）が何時間滑れるかを算出できず、「何時間滑りたい」という条件で他の券と比較できません`
        : `営業時間 (operating_hours) がありません。「その日の営業時間・ナイターの有無」に答えられません`;
    reporter.error("/operating_hours", message);
    return;
  }

  for (const [i, entry] of entries.entries()) {
    const path = `/operating_hours/${i}`;
    checkLabel(reporter, `${path}/hours_type`, entry.hours_type, "operating_hours_types");
    if ((entry.calendar_ids ?? []).length === 0) {
      reporter.error(
        `${path}/calendar_ids`,
        `適用日が指定されていません（通年なら season_all のcalendarを参照する）`,
      );
    }
    for (const id of entry.calendar_ids ?? []) {
      if (!calendarIds.has(id)) {
        reporter.error(`${path}/calendar_ids`, `参照先ID "${id}" が calendars に存在しません`);
      }
    }
    if (entry.hours_type === "closed") {
      if (entry.start_time != null || entry.end_time != null) {
        reporter.error(
          `${path}`,
          `hours_type: "closed"（定休日・休業）に営業時間が入っています`,
        );
      }
      continue;
    }
    if (entry.start_time == null || entry.end_time == null) {
      reporter.error(
        `${path}`,
        `start_time / end_time がありません。この日に何時から何時まで滑れるかが不明だと、1日券の滑走時間を算出できません（資料に記載が無い場合はその旨を unresolved_questions へ）`,
      );
    } else if (entry.start_time >= entry.end_time) {
      reporter.error(`${path}`, `start_time が end_time 以降になっています`);
    }
    for (const [j, lift] of (entry.lifts ?? []).entries()) {
      const lPath = `${path}/lifts/${j}`;
      if (lift.operating === false) continue;
      if (
        lift.start_time != null &&
        lift.end_time != null &&
        lift.start_time >= lift.end_time
      ) {
        reporter.error(lPath, `リフトの運行時間が逆転しています`);
      }
    }
  }

  checkYearEndDefined(reporter, data);

  const hasRegular = entries.some((e) => e.hours_type === "regular");
  if (!hasRegular) {
    reporter.warn(
      "/operating_hours",
      `通常営業 (hours_type: "regular") の記録がありません`,
    );
  }
}

let anyFailed = false;
for (const file of files) {
  const reporter = checkFile(file);
  if (reporter.failed(opts.strict)) anyFailed = true;
}
process.exit(anyFailed ? 1 : 0);
