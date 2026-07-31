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
  forEachTarget,
  hasTargetRestriction,
  loadTaxonomy,
  parseArgs,
  priceModeOf,
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
  }


  for (const [i, c] of (data.calendars ?? []).entries()) {
    checkLabelArray(
      reporter,
      `/calendars/${i}/included_day_types`,
      c.included_day_types,
      "day_types",
    );
    // year_end_new_year / special は単独では日付に一致しない。
    // 明示日付が無いと「一致する日が存在しないカレンダー」になり料金が引けない
    const NEEDS_EXPLICIT_DATES = ["year_end_new_year", "special", "unknown"];
    const needsDates = (c.included_day_types ?? []).filter((d) => NEEDS_EXPLICIT_DATES.includes(d));
    const hasExplicit =
      (c.included_dates ?? []).length > 0 || (c.included_date_ranges ?? []).length > 0;
    if (needsDates.length > 0 && !hasExplicit) {
      reporter.error(
        `/calendars/${i}`,
        `included_day_type ${needsDates.map((d) => `"${d}"`).join(" / ")} は単独では日付に一致しません。公式資料の対象日を included_dates（明示日）か included_date_ranges（期間）で指定してください（記載が無ければカレンダーを作らず unresolved_questions へ）`,
      );
    }
    // all は範囲を限定しないと無限に一致してしまう
    if ((c.included_day_types ?? []).includes("all") && (c.included_date_ranges ?? []).length === 0) {
      reporter.warn(
        `/calendars/${i}`,
        `included_day_type "all" は included_date_ranges で営業期間を限定してください（無限に一致します）`,
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
    // 相手スキー場のidが無いと、画面から共通券の相手へ辿れない
    for (const [j, sw] of (p.shared_with_resorts ?? []).entries()) {
      if (sw.resort_id != null) continue;
      const notified = (data.data_quality?.human_review_required ?? []).some((item) =>
        `${item.what_ja ?? ""} ${item.why_ja ?? ""}`.includes(sw.name_ja),
      );
      if (!notified) {
        reporter.error(
          `/products/${i}/shared_with_resorts/${j}/resort_id`,
          `共通券の相手「${sw.name_ja}」の resort_id がありません。SkiResort マスタのidを設定してください（画面から相手スキー場へ辿れません）。マスタに無いスキー場なら human_review_required に「${sw.name_ja}」を含めて記録してください`,
        );
      }
    }
  }

  // calculation_policy の通貨
  checkLabel(
    reporter,
    "/calculation_policy/currency",
    data.calculation_policy?.currency,
    "currencies",
    { nullable: true },
  );

  // 対象者の絞り込み（性別だけ構造化し、資格は公式表記のまま文章で残す）
  forEachTarget(data, (target, path, _item, field) => {
    if (field === "target_genders") {
      checkLabelArray(reporter, `${path}/genders`, target.genders, "genders");
      if ((target.genders ?? []).length === 0) {
        reporter.error(`${path}/genders`, `対象となる性別（["female"] 等）が必要です`);
      }
    }
    if (field === "target_qualification") {
      // 絞り込みを黙って落とすと、対象外の人に安い金額を提示することになる。
      // 分類はしないが、公式表記と誰が対象かは必ず残す
      if (!hasText(target.official_label_ja)) {
        reporter.error(
          `${path}/official_label_ja`,
          `公式表記をそのまま記録してください。何を絞り込んでいるのかが人間に伝わりません`,
        );
      }
      if (!hasText(target.description_ja)) {
        reporter.error(
          `${path}/description_ja`,
          `誰が対象なのかを1文で書いてください（公式表記に無いことを補ってはいけません）`,
        );
      }
    }
  });

  for (const [i, fee] of (data.fees ?? []).entries()) {
    // ★fees に載るのは「返ってこない追加負担」だけ。
    // 知りたいのは実質いくら払うかなので、返金される保証金は負担ではなく記録しない。
    // 特定の状況でのみ発生する費用も「普通に買ったらいくらか」に答えないので記録しない
    const feeText = `${fee.name_ja ?? ""} ${fee.official_label_ja ?? ""}`;
    if (/保証金|デポジット|預り金/.test(feeText)) {
      reporter.error(
        `/fees/${i}`,
        `「${feeText.trim()}」は返却すれば戻ってくる保証金なので実質の負担ではありません。fees から削除してください（券の提示価格に含まれている場合は、offerの price を保証金を差し引いた実質負担で記録し、理由を price.notes_ja に書いてください）`,
      );
    }
    if (/再発行|再交付|紛失|キャンセル|取消|変更手数料/.test(feeText)) {
      reporter.error(
        `/fees/${i}`,
        `「${feeText.trim()}」は特定の状況でのみ発生する費用なので収集対象外です。fees から削除してください（普通に買うときの支払額に影響しないため）`,
      );
    }
  }

  for (const [i, offer] of (data.offers ?? []).entries()) {
    const oPath = `/offers/${i}`;
    checkLabelArray(reporter, `${oPath}/discount_reasons`, offer.discount_reasons, "discount_reasons");
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

    if (priceModeOf(offer.price) === "derived_discount") {
      // 金額と割合はどちらか一方だけ。判別子を持たないので「どちらでもない」
      // 「両方ある」を検出する必要がある
      const d = offer.price?.discount ?? {};
      const given = ["amount", "percent"].filter((k) => d[k] != null);
      if (given.length !== 1) {
        reporter.error(
          `${oPath}/price/discount`,
          given.length === 0
            ? `「通常料金から〇〇引き」の割引額が空です。金額なら discount.amount、割合なら discount.percent のどちらか一方を設定してください`
            : `discount に amount と percent が両方あります。公式表記がどちらなのかを確認して一方だけにしてください`,
        );
      }
    }

    const reasons = offer.discount_reasons ?? [];
    const refChannels = (offer.channel_ids ?? [])
      .map((id) => channelById.get(id))
      .filter(Boolean);

    const nominalAge = offer.target_qualification?.nominal_age;
    if (nominalAge != null) {
      const offerLabel = `${offer.name_ja ?? ""} ${offer.official_label_ja ?? ""}`;
      const qualificationLabel =
        `${offer.target_qualification?.official_label_ja ?? ""} ` +
        `${offer.target_qualification?.description_ja ?? ""}`;
      if (
        !new RegExp(`${nominalAge}\\s*(?:才|歳)`, "u").test(offerLabel)
      ) {
        reporter.error(
          `${oPath}/target_qualification/nominal_age`,
          `nominal_age: ${nominalAge} は公式のoffer名称に同じ年齢表記がある場合だけ設定できます`,
        );
      }
      if (
        !/\d{4}年\d{1,2}月\d{1,2}日.+\d{4}年\d{1,2}月\d{1,2}日.+生まれ/u.test(
          qualificationLabel,
        )
      ) {
        reporter.error(
          `${oPath}/target_qualification/official_label_ja`,
          `nominal_age を使う年度生まれ割引には、公式の生年月日範囲を記録してください`,
        );
      }
    }

    // --- 割引理由の適用範囲と構造の整合 ---
    // qualified_only（条件を満たす人だけ）の理由に絞り込みが書かれていないと、
    // 「誰でも使える割引」として扱われ資格の無い人に安い金額を提示してしまう。
    // 実際に会員割引を条件なしで書くと代表として選ばれる穴があった
    for (const reason of reasons) {
      const appliesTo = taxonomy.appliesTo("discount_reasons", reason);
      if (appliesTo === "qualified_only") {
        const hasRestriction =
          hasTargetRestriction(offer) ||
          // audiences 側で対象者が絞られている場合も可
          ((offer.audience_ids ?? []).length > 0 &&
            (offer.audience_ids ?? []).some((id) => {
              const a = (data.audiences ?? []).find((x) => x.id === id);
              return a && a.is_default !== true;
            }));
        if (!hasRestriction) {
          reporter.error(
            `${oPath}/target_qualification`,
            `"${reason}" は条件を満たす人だけの割引 (applies_to: qualified_only) ですが、資格の条件が書かれていません。条件が無いと「誰でも使える割引」として扱われ、資格の無い人に安い金額を提示します。target_qualification（公式表記＋誰が対象か）か target_genders を設定するか、対象者を audience_ids で絞ってください`,
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

    // 資格が必要な割引は、誰が対象なのかを公式表記のまま残す。
    // 居住・在勤・在学をラベルで区別しても照会の入力に居住地が無いため
    // 料金計算に効かないので、分類はせず文章で残すことだけを強制する
    for (const reason of ["local_resident", "hotel_guest", "membership"]) {
      if (reasons.includes(reason) && offer.target_qualification == null) {
        reporter.error(
          `${oPath}/target_qualification`,
          `discount_reason "${reason}" のofferには target_qualification が必要です（公式表記と誰が対象かを記録する。notes_ja に書くだけでは「資格が必要」と判定できません）`,
        );
      }
    }

    // 特定日割引は対象日の明示が必須。
    // レディースデー・メンズデー・シニアデー・こどもデー等は専用ラベルを作らず
    // special_day ＋ 対象者の絞り込みで表す
    if (reasons.includes("special_day")) {
      const cals = (offer.calendar_ids ?? [])
        .map((id) => calendarById.get(id))
        .filter(Boolean);
      const hasExplicitDates = cals.some(
        (c) =>
          (c.included_dates ?? []).length > 0 ||
          (c.included_date_ranges ?? []).length > 0 ||
          (c.included_day_types ?? []).some((d) => d !== "special" && d !== "unknown"),
      );
      if (cals.length === 0 || !hasExplicitDates) {
        reporter.error(
          `${oPath}/calendar_ids`,
          `special_day は対象日が限定された割引です。calendars に明示日付（included_dates / included_date_ranges）か曜日（included_day_types）を持つカレンダーを紐づけてください（included_day_type "special" 単独では日付に一致しません）`,
        );
      }
      // 公式名称が性別を示しているのに性別の絞り込みが無ければ、機械判定できない
      const label = `${offer.official_label_ja ?? ""} ${offer.name_ja ?? ""}`;
      if (/レディース|女性|ウーマン|メンズ|男性/.test(label) && offer.target_genders == null) {
        reporter.error(
          `${oPath}/target_genders`,
          `公式名称「${offer.official_label_ja ?? offer.name_ja}」が性別を限定していますが target_genders がありません`,
        );
      }
    }

    // --- 購入期限 (purchase_deadline) ---
    // 判定に使うのは「当日買えるか」と「何日前までか」。
    // 当日内の分単位の期限は1日単位の判定に効かないので official_text_ja だけに書く
    const deadline = offer.purchase_deadline ?? null;
    if (deadline) {
      if (!("same_day_allowed" in deadline)) {
        reporter.error(
          `${oPath}/purchase_deadline/same_day_allowed`,
          `当日買えるかどうか (same_day_allowed) が必要です。true＝当日購入可、false＝前日以前に買う必要がある、null＝公式に記載なし`,
        );
      }
      if (deadline.same_day_allowed != null && !hasText(deadline.official_text_ja)) {
        reporter.error(
          `${oPath}/purchase_deadline/official_text_ja`,
          `期限の公式表記が必要です。ここが空だと「いつまでに買えばよいか」が利用者に伝わりません`,
        );
      }

      // 「当日買える」と「N日前までに買う必要がある」は同時に成立しない。
      // 食い違うと「あと何日あるので買える」の判定が逆になる
      const days = deadline.days_before_use;
      if (deadline.same_day_allowed === true && days != null && days >= 1) {
        reporter.error(
          `${oPath}/purchase_deadline`,
          `当日購入可 (same_day_allowed: true) なのに ${days}日前までの期限があります。当日買えるなら days_before_use は 0 か null にしてください`,
        );
      }
      if (deadline.same_day_allowed === false && days === 0) {
        reporter.error(
          `${oPath}/purchase_deadline`,
          `当日購入不可 (same_day_allowed: false) なのに days_before_use が 0（当日まで）です。前日までなら 1 にしてください`,
        );
      }
      if (
        deadline.same_day_allowed == null &&
        (days != null || hasText(deadline.deadline_date))
      ) {
        reporter.error(
          `${oPath}/purchase_deadline`,
          `公式に記載がない (same_day_allowed: null) のに期限が入っています。記載があるなら same_day_allowed を true / false で明示してください`,
        );
      }
      if (
        deadline.same_day_allowed === false &&
        days == null &&
        !hasText(deadline.deadline_date)
      ) {
        reporter.warn(
          `${oPath}/purchase_deadline`,
          `前日以前に買う必要がある券ですが、何日前までか (days_before_use) も固定期限 (deadline_date) もありません。「あと何日あるので買える」の判定ができず「当日は買えません」しか言えません`,
        );
      }
    }
    // 前日以前に買う必要がある＝前売り
    const requiresAdvance = deadline?.same_day_allowed === false;

    if (reasons.includes("online_purchase")) {
      // 「どこで買うか」は購入URLで足りる（channel_type というラベルは持たない）。
      // Web割引なのにURLが無いJSONは、利用者を購入ページへ連れて行けない
      if (!refChannels.some((ch) => hasText(ch.url))) {
        reporter.error(
          `${oPath}/channel_ids`,
          `discount_reason "online_purchase" のofferが参照するchannelに購入URLがありません。オンライン販売の券は購入ページのURLを channels[].url に記録してください（手順の自由文だけでは買いに行けません）`,
        );
      }
      if (!deadline) {
        reporter.error(
          `${oPath}/purchase_deadline`,
          `オンライン販売の券には purchase_deadline が必須です（「今日これを買えるのか」は実際に問われます）。当日購入可なら same_day_allowed: true、前日以前なら false、公式に記載が無ければ null を明示してください`,
        );
      }
      if (requiresAdvance && !reasons.includes("advance_purchase")) {
        reporter.error(
          `${oPath}/discount_reasons`,
          `前日以前に買う必要があるオンライン券は前売りです。discount_reasons に "advance_purchase" も追加してください（当日購入可のものだけが "online_purchase" 単独）`,
        );
      }
    }

    if (reasons.includes("advance_purchase")) {
      if (deadline?.same_day_allowed === true) {
        reporter.error(
          `${oPath}/purchase_deadline`,
          `当日購入可 (same_day_allowed: true) の券は前売りではありません。"advance_purchase" を外して "online_purchase" 等のみにしてください`,
        );
      }
      const hasDeadline =
        requiresAdvance ||
        hasText(offer.sales_period?.end) ||
        hasText(offer.sales_period?.deadline_ja) ||
        refChannels.some((ch) => hasText(ch.purchase_deadline_ja));
      if (!hasDeadline) {
        reporter.error(
          `${oPath}/purchase_deadline`,
          `discount_reason "advance_purchase" のofferには前日以前の期限が必要です（purchase_deadline の same_day_allowed: false、または sales_period の期限）`,
        );
      }
    }

    // 窓口だけで買う券に期限を書かせない（「当日その場で買う」以外の選択肢が無い）。
    // 遠隔購入できる券にだけ記録を求める
    const remoteOnly =
      refChannels.length > 0 && refChannels.every((ch) => hasText(ch.url));
    if (!deadline && remoteOnly) {
      reporter.warn(
        `${oPath}/purchase_deadline`,
        `購入URLがあるchannelだけで買う券です。当日買えるかどうか (purchase_deadline) を記録することを推奨します`,
      );
    }
    if (deadline && refChannels.length > 0 && !remoteOnly) {
      reporter.warn(
        `${oPath}/purchase_deadline`,
        `窓口・券売機で買える券に購入期限が付いています。現地購入だけなら purchase_deadline は不要です（「当日その場で買う」以外の選択肢が無いため情報になりません）`,
      );
    }

    // 「パック」「セット」を名乗る券は、何が付くのかを included_items で構造化する。
    // 名称だけでは「いくらでどこまで含まれるか」に答えられない
    const packText = `${offer.name_ja ?? ""} ${offer.official_label_ja ?? ""}`;
    if (/パック|セット券|付き|込み/.test(packText)) {
      const product = productById.get(offer.product_id);
      if (product && (product.included_items ?? []).length === 0) {
        reporter.error(
          `${oPath}/product_id`,
          `「${packText.trim()}」は付属物があるように読めますが、参照するproductに included_items がありません。昼食・温泉などの付属物を構造化してください（付属物が無いなら公式表記を確認してください）`,
        );
      }
    }

    // 1 offer = 1 金額。日付で料金が変わるならカレンダーごとに offer を分ける。
    // date_table を残すと同じ事実を2通りで書けてしまい、日付マッチングと
    // 「金額の読み方」がそれぞれ二重実装になる
    if (offer.price?.date_table != null) {
      reporter.error(
        `${oPath}/price/date_table`,
        `date_table は廃止しました。日付によって料金が変わる場合は**カレンダーごとに offer を分けて**ください（「大人1日券（平日）」「大人1日券（土日祝）」のように1 offerに1金額）`,
      );
    }

    if (priceModeOf(offer.price) === "free" && offer.price?.amount !== 0) {
      reporter.error(
        `${oPath}/price/amount`,
        `"free" のofferの金額は 0 である必要があります (現在: ${JSON.stringify(offer.price?.amount)})`,
      );
    }

    // 金額が確定できないこと自体は許すが、**なぜ確定できないのかは必須**。
    // かつては mode: "unknown" という明示的な宣言がその役目を担っていたので、
    // mode を廃止した分を理由の記述で埋める（「書き忘れ」と「判読不能」を区別する）
    if (priceModeOf(offer.price) === "unknown" && !hasText(offer.price?.notes_ja)) {
      reporter.error(
        `${oPath}/price/notes_ja`,
        `金額が確定していない (amount: null) のに理由がありません。判読不能・記載なしなど、なぜ確定できないのかを書いてください（書き忘れと区別できません）`,
      );
    }

    // ★保証金込みで提示されている券は、返却すれば戻るので実質負担はその分安い。
    // 差し引かずに保存すると高すぎる金額を提示することになる
    const depositText = [offer.name_ja, offer.official_label_ja, offer.notes_ja]
      .filter(hasText)
      .join(" ");
    if (/保証金.{0,4}込|デポジット.{0,4}込|預り金.{0,4}込/.test(depositText)) {
      if (!hasText(offer.price?.notes_ja)) {
        reporter.error(
          `${oPath}/price/notes_ja`,
          `「${depositText}」は返金される保証金込みの提示価格です。price は保証金を差し引いた実質負担で記録し、公式提示額と差し引いた金額を price.notes_ja に書いてください`,
        );
      }
    }

    // 変動価格を固定価格として保存すると、その日の実際の金額と違う額を提示する。
    // 資料側の文言（＝証拠）から検出する
    if (priceModeOf(offer.price) !== "live_dynamic") {
      const priceText = [
        offer.name_ja,
        offer.official_label_ja,
        offer.notes_ja,
        offer.price?.notes_ja,
      ]
        .filter(hasText)
        .join(" ");
      if (/変動|日によ(り|って)|時期によ(り|って)|ダイナミック|取得時に表示/.test(priceText)) {
        reporter.error(
          `${oPath}/price`,
          `「${priceText}」は価格が変動すると読めますが固定料金として保存されています。変動価格を固定価格として保存してはいけません。amount: null ／ live_lookup_required: true ／ observed_amount・observed_at に取得時の観測値を記録してください`,
        );
      }
      if (offer.price?.observed_amount != null) {
        reporter.error(
          `${oPath}/price`,
          `observed_amount（取得時点の観測値）があるのに変動価格として扱われていません。観測値しか分からない券は amount: null ／ live_lookup_required: true にしてください`,
        );
      }
    }

    if (reasons.length > 0 && !hasText(offer.official_label_ja)) {
      reporter.warn(
        `${oPath}/official_label_ja`,
        `割引offerには公式サイト上の名称 (official_label_ja) を記録することを推奨します`,
      );
    }
    for (const label of ["official_label_ja", "name_ja"]) {
      const v = offer[label];
      if (hasText(v) && taxonomy.labels("discount_reasons").includes(v)) {
        reporter.error(
          `${oPath}/${label}`,
          `${label} に標準ラベル "${v}" がそのまま入っています。公式名称と機械判定用ラベルを分離してください`,
        );
      }
    }
  }

  for (const [i, rule] of (data.party_rules ?? []).entries()) {
    const rPath = `/party_rules/${i}`;
    const fixedTotal = (rule.components ?? []).find(
      (c) => c.price_effect?.type === "fixed_total" && c.price_effect?.amount != null,
    );
    for (const [j, comp] of (rule.components ?? []).entries()) {
      const cPath = `${rPath}/components/${j}`;
      // price_effect: null は「通常料金のまま」または「セット合計に含まれる」。
      // 効き方が分からない場合だけ unknown を使う（両者を混同すると
      // 「料金が確定している」のに人間へ通知が飛ぶ／その逆が起きる）
      if (comp.price_effect == null) continue;
      checkLabel(reporter, `${cPath}/price_effect/type`, comp.price_effect.type, "price_effect_types");
      const effect = comp.price_effect;
      if (effect.type === "fixed_total" && effect.amount == null) {
        reporter.error(
          `${cPath}/price_effect`,
          `fixed_total（セット全体の合計）なのに金額がありません。セット合計を書くcomponent以外は price_effect を null にしてください（合計を二重に足さないため）`,
        );
      }
      if (effect.type === "fixed_total" && fixedTotal != null && comp !== fixedTotal) {
        reporter.error(
          `${cPath}/price_effect`,
          `1つのルールに fixed_total の金額が複数あります。セット合計は1箇所だけに書き、他のcomponentは price_effect を null にしてください`,
        );
      }
      if (effect.type === "fixed_per_person" && effect.amount == null) {
        reporter.error(`${cPath}/price_effect`, `fixed_per_person には1人あたりの金額が必要です`);
      }
      if (effect.type === "discount_amount" && effect.amount == null) {
        reporter.error(`${cPath}/price_effect`, `discount_amount には割引額が必要です`);
      }
      if (effect.type === "discount_percent" && effect.percent == null) {
        reporter.error(`${cPath}/price_effect`, `discount_percent には割引率が必要です`);
      }
      if (effect.type === "free" && (effect.amount ?? 0) !== 0) {
        reporter.error(`${cPath}/price_effect`, `free の金額は 0 である必要があります`);
      }
    }
  }

  checkPartyRuleBypass(reporter, data);
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
  checkDataQuality(reporter, data, unknownItems.length);
  checkOperatingHours(reporter, data, taxonomy);
  checkProductValidity(reporter, data);

  reporter.print(file);
  return reporter;
}


/**
 * 年末年始の扱いが決まっているかを検証する。
 *
 * `included_day_types: ["weekday"]` は「月〜金かつ祝日でない日」なので、
 * **年末年始を
 * 黙って飲み込む**。多くのスキー場で年末年始は休日料金なので、平日料金として
 * 出してしまうと安すぎる金額を提示することになる。
 *
 * 資料に年末年始の記載があるのに、どのカレンダーにも反映されていなければ指摘する。
 */
function checkYearEndDefined(reporter, data) {
  const calendars = data.calendars ?? [];
  const usesStandardWeekday = calendars.some((c) =>
    (c.included_day_types ?? []).some((d) => d === "weekday" || d === "weekend_holiday"),
  );
  if (!usesStandardWeekday) return;

  // 年末年始が包含・除外の両側で扱える形に定義されているか。
  // 詳細な同一期間チェックは公式資料の表現差があるため、抽出・監査手順で確認する。
  const yearEndDefined = calendars.some((c) => {
    const label = `${c.official_label_ja ?? ""} ${c.name_ja ?? ""} ${c.notes_ja ?? ""}`;
    const mentions = /年末年始|年末|年始/.test(label) ||
      (c.included_day_types ?? []).includes("year_end_new_year");
    const hasDates =
      (c.included_dates ?? []).length > 0 ||
      (c.included_date_ranges ?? []).length > 0 ||
      (c.excluded_dates ?? []).length > 0 ||
      (c.excluded_date_ranges ?? []).length > 0;
    return mentions && hasDates;
  });
  if (yearEndDefined) return;

  // 資料に年末年始の記載があったかは notes / unresolved から推し量る
  const recorded = JSON.stringify(data.data_quality ?? {});
  const acknowledged = /年末年始|年末|年始/.test(recorded);
  const message =
    `平日・土日祝のカレンダーを使っていますが、年末年始の扱いが定義されていません。` +
    `included_day_type "weekday" は年末年始を平日として飲み込むため、年末年始が休日料金の場合に` +
    `安すぎる金額を提示します。公式に年末年始の期間・料金の記載があれば、元の平日区分の` +
    `excluded_dates / excluded_date_ranges と、適用先区分の included_dates / included_date_ranges を` +
    `同じ日・期間でペアにして、` +
    `記載が無ければ unresolved_questions に記録してください`;
  if (acknowledged) reporter.warn("/calendars", message);
  else reporter.error("/calendars", message);
}

/**
 * party_rule の人数上限が、無条件のofferによって回避されていないか検査する。
 *
 * 「大人1名につき未就学児2名まで無料」というルールがあるのに、
 * 未就学児向けに**条件なしの0円offer**が存在すると、個別購入の経路で
 * 全員無料になり上限が意味を失う（実際にこの穴があった）。
 * 同伴条件は `target_qualification` に書いて、条件なしでは選べないようにする。
 */
function checkPartyRuleBypass(reporter, data) {
  for (const [i, rule] of (data.party_rules ?? []).entries()) {
    for (const [j, comp] of (rule.components ?? []).entries()) {
      const limited =
        comp.per_qualifying_count != null || comp.max_count != null;
      if (!limited || comp.price_effect?.type !== "free") continue;
      const audiences = comp.audience_ids ?? [];
      for (const [k, offer] of (data.offers ?? []).entries()) {
        if (offer.price?.amount !== 0) continue;
        if (!(offer.audience_ids ?? []).some((id) => audiences.includes(id))) continue;
        if (hasTargetRestriction(offer)) continue;
        reporter.error(
          `/offers/${k}`,
          `無条件の0円offer「${offer.official_label_ja ?? offer.name_ja}」があるため、party_rule「${rule.official_label_ja ?? rule.name_ja}」の人数上限（/party_rules/${i}/components/${j}）が回避されます。同伴条件を target_qualification に記録して、条件なしでは選べないようにしてください`,
        );
      }
    }
  }
}

/**
 * データ品質の申告と中身の整合を検査する。
 *
 * かつて offer / party_rule / source に `confidence`（high/medium/low）があったが、
 * 「自信がない」と申告されても**人間はどこを見ればよいか分からない**ため廃止した。
 * 代わりに `human_review_required` に「何を・なぜ・どこを見れば確認できるか」を
 * 書かせ、1件でもあれば `complete` を名乗れないようにする。
 */
function checkDataQuality(reporter, data, unknownCount) {
  const dq = data.data_quality ?? {};
  checkLabel(reporter, "/data_quality/status", dq.status, "data_quality_statuses");
  const reviews = dq.human_review_required ?? [];
  const illegible = dq.illegible_items ?? [];

  for (const [i, item] of reviews.entries()) {
    const at = `/data_quality/human_review_required/${i}`;
    for (const [field, label] of [
      ["what_ja", "何を確認してほしいか"],
      ["why_ja", "なぜ確定できなかったのか"],
      ["where_ja", "どこを見れば確認できるか"],
    ]) {
      if (!hasText(item[field])) {
        reporter.error(`${at}/${field}`, `${label} (${field}) が必要です`);
      }
    }
    // ★ここが本題。確認箇所が示されていないと人間は動けない
    if (hasText(item.where_ja) && !/[/.]|http/.test(item.where_ja)) {
      reporter.warn(
        `${at}/where_ja`,
        `確認箇所に保存資料のパス（page-001/page.html 等）か公式URLを含めてください。「料金表」だけではどのページのどこか分かりません`,
      );
    }
  }

  const pending = reviews.length + illegible.length + unknownCount;
  if (dq.status === "complete" && pending > 0) {
    reporter.error(
      "/data_quality/status",
      `status "complete" ですが人間の確認待ちが ${pending} 件あります（human_review_required ${reviews.length} / 判読不能 ${illegible.length} / unknown ${unknownCount}）。"needs_review" にしてください`,
    );
  }
  if (dq.status === "needs_review" && reviews.length === 0) {
    reporter.error(
      "/data_quality/human_review_required",
      `status "needs_review" ですが確認項目が空です。何を・なぜ・どこを見れば確認できるかを書いてください（書かないと人間はどこを見ればよいか分かりません）`,
    );
  }
  if (dq.status === "failed" && reviews.length === 0) {
    reporter.error(
      "/data_quality/human_review_required",
      `status "failed" ですが何が取得できなかったかの記録がありません。human_review_required にURLと状況を書いてください`,
    );
  }
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

    // 「いつまでに使い切るか」は分割して使える券だけの概念。
    // その日で終わる券に書いても意味が無く、書けると誤解を生む
    const SPLITTABLE_MODES = ["selectable_days", "hours_pool"];
    if (v.usable_within != null) {
      reporter.error(
        `${path}/validity/usable_within`,
        `usable_within（日数の構造化）は廃止しました。公式表記をそのまま usable_within_ja に書いてください（購入日基準か初回利用日基準かの判定は照会にも表示にも使われていなかったため構造を持ちません）`,
      );
    }
    if (hasText(v.usable_within_ja) && !SPLITTABLE_MODES.includes(v.mode)) {
      reporter.error(
        `${path}/validity/usable_within_ja`,
        `mode "${v.mode}" はその日で終わる券なので「いつまでに使い切るか」を書きません。分割して使える券（selectable_days / hours_pool）にのみ設定してください`,
      );
    }
    if (SPLITTABLE_MODES.includes(v.mode) && !hasText(v.usable_within_ja)) {
      reporter.warn(
        `${path}/validity/usable_within_ja`,
        `分割して使える券は「いつまでに使い切るか」を公式表記のまま usable_within_ja に記録してください。記載が無ければ human_review_required に記録し、「シーズン中いつでも」と推測しないでください`,
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

    // covers_hours_types は1日券・複数日券、または時間帯固定券（fixed_time_window）
    // にのみ設定する。回数券・ポイント券・初回利用からN時間券は validity の
    // 時間数だけで完結し「営業区分」という概念自体が無いので設定しない
    const DAY_MODES = ["calendar_day", "consecutive_days", "selectable_days"];
    const COVERS_HOURS_TYPES_MODES = [...DAY_MODES, "fixed_time_window"];
    if (
      product.covers_hours_types != null &&
      !COVERS_HOURS_TYPES_MODES.includes(v.mode)
    ) {
      reporter.error(
        `${path}/covers_hours_types`,
        `covers_hours_types は1日券・複数日券・時間帯固定券にのみ設定します（mode "${v.mode}" には営業区分という概念が無いため不要）`,
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
        checkLabel(reporter, `${path}/covers_hours_types`, value, "hours_bands");
        // 「休業日に使える券」「いつ使えるか不明な券」は意味を持たない
        if (["closed", "unknown"].includes(value)) {
          reporter.error(
            `${path}/covers_hours_types`,
            `"${value}" は operating_hours 専用です（券が使える営業区分としては意味を持ちません）。ナイター込みなら ["regular","night"]、記載が無ければ null にしてください`,
          );
        }
      }
    }
    // 時間帯固定券は1つの時間帯そのものなので、営業区分は1つだけのはず。
    // 複数入っていると「どの区分の券か」が曖昧になる（1日券は複数OK）
    if (v.mode === "fixed_time_window" && covers != null && covers.length !== 1) {
      reporter.error(
        `${path}/covers_hours_types`,
        `mode "fixed_time_window" は1つの時間帯を表す券なので covers_hours_types は1つだけ設定します（実際: ${JSON.stringify(covers)}）`,
      );
    }
    // 時間帯固定券が「何営業区分の券か」を operating_hours の時間帯と
    // 突き合わせて推測させない。券自体にラベルを持たせて直接判定できるようにする
    // （突き合わせは資料のページが別々だと時間表記がズレて機能しないことがある）
    if (v.mode === "fixed_time_window" && covers == null) {
      reporter.error(
        `${path}/covers_hours_types`,
        `mode "fixed_time_window" では covers_hours_types が必須です（この券自体がどの営業区分の時間帯かを ["regular"] / ["night"] / ["early_morning"] のいずれかで示してください）`,
      );
    }
    // 公式名称がナイターを示しているのに営業区分の指定が無い・違うと、
    // 「1日券（ナイターあり）」の合算に使えない。
    // product_type からは判定できないので公式名称で検出する
    const label = `${product.official_label_ja ?? ""} ${product.name_ja ?? ""}`;
    if (
      /ナイター|ナイト|night/i.test(label) &&
      COVERS_HOURS_TYPES_MODES.includes(v.mode) &&
      !(covers ?? []).includes("night")
    ) {
      reporter.error(
        `${path}/covers_hours_types`,
        `公式名称「${product.official_label_ja ?? product.name_ja}」がナイターを示す券ですが covers_hours_types に "night" がありません`,
      );
    }
    // ナイター券が時間帯で表されているかを確認する（1日券以外）
    if (
      /ナイター|ナイト|night/i.test(label) &&
      !COVERS_HOURS_TYPES_MODES.includes(v.mode)
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
  const audienceById = new Map(
    audiences.map((audience) => [audience.id, audience]),
  );

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
    const isDisabilityQualified =
      audience.is_disability_qualified === true;
    const baseAudience = audience.base_audience_id
      ? audienceById.get(audience.base_audience_id)
      : null;

    if (isDisabilityQualified && audience.is_default === true) {
      reporter.error(
        `${path}/is_default`,
        `障がい者向け人物区分をデフォルトにはできません`,
      );
    }
    if (isDisabilityQualified && !audience.base_audience_id) {
      reporter.error(
        `${path}/base_audience_id`,
        `障がい者向け人物区分には、専用料金が無い場合に使う通常人物区分の base_audience_id が必要です`,
      );
    } else if (audience.base_audience_id && !baseAudience) {
      reporter.error(
        `${path}/base_audience_id`,
        `参照先audience "${audience.base_audience_id}" が存在しません`,
      );
    } else if (audience.base_audience_id === audience.id) {
      reporter.error(
        `${path}/base_audience_id`,
        `自分自身を基準人物区分にできません`,
      );
    } else if (baseAudience?.is_disability_qualified === true) {
      reporter.error(
        `${path}/base_audience_id`,
        `障がい者向け人物区分を基準区分にできません。通常の大人・子供等を参照してください`,
      );
    }
    if (!isDisabilityQualified && audience.base_audience_id) {
      reporter.error(
        `${path}/base_audience_id`,
        `base_audience_id は is_disability_qualified: true の人物区分だけに設定できます`,
      );
    }

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
      const reviewText = (data.data_quality?.human_review_required ?? [])
        .map((item) => `${item.what_ja ?? ""} ${item.why_ja ?? ""} ${item.where_ja ?? ""}`)
        .join(" ");
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
      (audience.school_levels ?? []).length > 0 ||
      (isDisabilityQualified && baseAudience != null);
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
    checkLabel(reporter, `${path}/hours_type`, entry.hours_type, "hours_bands");
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
