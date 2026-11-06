import type {
  LiftTicketData,
  LiftTicketProduct,
  LiftTicketSearchInput,
  LiftTicketSourceQuote,
  PriceReference,
  TicketCalculationLine,
  TicketConditionalOffer,
  TicketDayPlan,
  TicketPartyGroup,
  TicketRentalItem,
} from "../types";
import {
  addDays,
  buildReferences,
  calculateLiftTicket,
  formatPartyGroupLabel,
  hasNightOperatingOn,
  type TicketPlanResult,
} from "./calculateLiftTicket";
import {
  bundleCoveredItemsOf,
  calculateRentalPlan,
  formatRentalRequest,
  isRentalBundleProduct,
  missingRentalItemsOf,
  rentalItemsOf,
  rentalOptionsOf,
  type TicketRentalResult,
} from "./rental";

/** リフト券とレンタルを一緒に買うセット券を使う利用者の行（全日ぶん） */
export type TicketBundleLine = {
  groupId: string;
  groupLabel: string;
  count: number;
  productId: string;
  productName: string;
  offerName: string | null;
  /** セット券に含まれるもの（「レンタルセット」「昼食1,100円分」） */
  includes: string[];
  /** 1人あたり（全日の合計） */
  unitAmount: number;
  subtotal: number;
  /** リフト券とレンタルを別々に買った場合の同じ人たちの合計。レンタル料金が無ければ null */
  separateSubtotal: number | null;
  purchaseNote: string | null;
  warnings: string[];
  sourceNumbers: number[];
  sourceQuotes?: Record<number, LiftTicketSourceQuote>;
  /**
   * 同行者パックのセット券（「ファミリーパック」「ハッピーレンタルセット」）のとき、
   * セットに入る利用者。groupId は「party-rule:…」の合成IDで、利用者の行ではない
   */
  memberGroupIds?: string[];
  memberGroupLabels?: string[];
};

export type TicketBundleResult = {
  /** セット券を使う利用者。空なら使わない（条件付きの案だけがある） */
  lines: TicketBundleLine[];
  /** 会員・クーポンなど入力から確定できない条件を満たせば使えるセット券。金額は全日ぶん */
  conditionalOffers: TicketConditionalOffer[];
  /** セット券を使う場合の全体の合計（使わない人・日の分を含む）。確定できなければ null */
  total: number | null;
  /** 別々に買う場合の合計。レンタル料金が無いなど出せなければ null */
  separateTotal: number | null;
  /** 別々に買うより安くなる額。比べられなければ null */
  savings: number | null;
  /** レンタルを借りるのにセット券を使わない利用者（その人のレンタル料金は別に足す） */
  unbundledRenterGroupIds: string[];
  /**
   * 年齢が空欄のためセット券を比べられなかった利用者。セット券の料金が
   * 年齢で分かれる（「22歳まで」「23歳以上」など）とき、年齢を入れれば使える
   */
  ageNeededGroupIds: string[];
  references: PriceReference[];
};

type Candidate = {
  productId: string;
  productName: string;
  offerName: string | null;
  includes: string[];
  unitAmount: number;
  line: TicketCalculationLine;
  /** セット券に含まれない用具を単品で足したときの説明 */
  extraNote: string | null;
  sourceNumbers: number[];
  sourceQuotes?: Record<number, LiftTicketSourceQuote>;
};

/** 同行者パック（複数人で金額が決まるセット券）の候補 */
type SetCandidate = {
  productId: string;
  productName: string;
  line: TicketCalculationLine;
  members: TicketPartyGroup[];
  /** セットに入るがレンタルを借りない人（セット券に付くレンタルを使わない） */
  nonRenterLabels: string[];
  includes: string[];
  subtotal: number;
  extraNotes: string[];
  sourceNumbers: number[];
  sourceQuotes?: Record<number, LiftTicketSourceQuote>;
};

const PARTY_RULE_PREFIX = "party-rule:";

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

/**
 * 1日の滑走がセット券でまかなえるか。
 * - ナイター込みなら、ナイターを含む券だけ
 * - 時間券型（N時間）は、滑る時間がその時間以内の日だけ（1日の滑走は時間券ではまかなえない）
 * - 連続日券型は、1日ずつではなく日数ぶんまとめて使う（連続した日の計画かは
 *   {@link bundlePeriodsOf} で確かめる）ので、ここでは「1日」の滑走だけを通す
 */
const dayFitsBundle = (
  data: LiftTicketData,
  product: LiftTicketProduct,
  day: TicketDayPlan,
) => {
  if (!day.date) return false;
  const mode = product.validity?.mode;
  if (mode === "hours_from_first_use") {
    return (
      day.duration.kind === "hours" &&
      day.duration.hours <= (product.validity?.hours ?? 0)
    );
  }
  if (mode === "consecutive_days" && day.duration.kind !== "day") return false;
  const needsNight =
    day.duration.kind === "day" &&
    day.duration.withNight &&
    hasNightOperatingOn(data, day.date);
  return !needsNight || product.covers_hours_types?.includes("night") === true;
};

/**
 * セット券を計算する日付の区切り。1日券・時間券は1日ずつ（日ごとに1枚）、
 * 連続日券（2日パックなど）は計画の全日がちょうどその日数で連続しているときだけ、
 * 初日1回にまとめる。合わないなら null（その券は使わない）
 */
const bundlePeriodsOf = (
  product: LiftTicketProduct,
  plans: TicketDayPlan[],
): string[] | null => {
  if (product.validity?.mode !== "consecutive_days") {
    return plans.map(plan => plan.date);
  }
  const days = product.validity.days ?? 0;
  const dates = plans.map(plan => plan.date).sort();
  const consecutive = dates.every(
    (date, index) => index === 0 || addDays(dates[index - 1], 1) === date,
  );
  return days >= 2 && dates.length === days && consecutive ? [dates[0]] : null;
};

const mergeQuotes = (
  lists: Array<Record<number, LiftTicketSourceQuote> | undefined>,
) => {
  const merged: Record<number, LiftTicketSourceQuote> = Object.assign(
    {},
    ...lists,
  );
  return Object.keys(merged).length > 0 ? merged : undefined;
};

/**
 * リフト券とレンタルをまとめて売るセット券（「レンタル付き1日券」「学得パック」など）を、
 * 別々に買う場合と比べる。
 *
 * - 利用者ごと・全日で、借りる物がすべてセット券に含まれる場合だけ候補にする
 *   （含まれない物があれば、その人は別々に買う）
 * - 会員・クーポン・学生など入力で確かめられない条件付きの料金は、自動では使わず
 *   条件付きの案として別に返す
 * - 別々に買う料金が出せない（レンタル未収集など）ときは、セット券があれば使う
 * - 連続日券などを使う案より安いときだけ採用する（1日ずつ買う前提でセット券を足す）
 */
export const calculateRentalBundle = (
  data: LiftTicketData,
  input: LiftTicketSearchInput,
  plan: TicketPlanResult,
  rental: TicketRentalResult | null,
): TicketBundleResult | null => {
  const renters = input.party.filter(
    group => group.count > 0 && rentalItemsOf(group.rental).length > 0,
  );
  const products = data.products.filter(isRentalBundleProduct);
  if (
    renters.length === 0 ||
    products.length === 0 ||
    plan.days.length === 0 ||
    plan.perDayTotal == null
  ) {
    return null;
  }
  const perDayTotal = plan.perDayTotal;
  // このスキー場で借りられない用具（ゴーグル等）は、セット券がまかなえなくてもよい
  const rentalOptions = rentalOptionsOf(data);
  const { references } = buildReferences(data);

  const ticketOf = (group: TicketPartyGroup) => {
    const amounts = plan.days.map(
      day => day.result.lines.find(line => line.groupId === group.id)?.subtotal,
    );
    return amounts.every((amount): amount is number => amount != null)
      ? sum(amounts)
      : null;
  };
  const rentalOf = (group: TicketPartyGroup) =>
    rental?.lines.find(line => line.groupId === group.id)?.subtotal ?? null;
  const separateOf = (group: TicketPartyGroup) => {
    const ticket = ticketOf(group);
    const rented = rentalOf(group);
    return ticket != null && rented != null ? ticket + rented : null;
  };

  /**
   * 日ごとの計画の券のうち、この人たちの分（個別の行と、その人たちだけで作る同行者パックの行）。
   * 計画がすでに同行者パックを使っているとき、その行は利用者の行ではなく合成IDなので、
   * 行の名前（利用者の表記）で誰の分かを判断する
   */
  const planLineIsOf = (
    line: TicketCalculationLine,
    members: TicketPartyGroup[],
  ) =>
    members.some(member => member.id === line.groupId) ||
    (line.groupId.startsWith(PARTY_RULE_PREFIX) &&
      line.groupLabel
        .split("＋")
        .every(label =>
          members.some(member => formatPartyGroupLabel(member) === label),
        ) &&
      line.count <= sum(members.map(member => member.count)));
  const ticketOfMembers = (members: TicketPartyGroup[]) => {
    const amounts = plan.days.map(day => {
      const lines = day.result.lines.filter(line =>
        planLineIsOf(line, members),
      );
      return lines.length > 0 && lines.every(line => line.subtotal != null)
        ? sum(lines.map(line => line.subtotal ?? 0))
        : null;
    });
    return amounts.every((amount): amount is number => amount != null)
      ? sum(amounts)
      : null;
  };
  const setCandidates: SetCandidate[] = [];

  const adoptable = new Map<string, Candidate>();
  const conditional = new Map<string, TicketConditionalOffer>();
  const groupsByProduct = new Map<string, TicketPartyGroup[]>();
  const periodsByProduct = new Map<string, string[]>();
  const resultsFor = (
    productId: string,
    groups: TicketPartyGroup[],
    dates: string[],
  ) =>
    dates.map(date =>
      calculateLiftTicket(
        data,
        { ...input, visitDate: date, days: undefined, party: groups },
        productId,
      ),
    );
  /** セット券がまかなわない用具を、単品で借りる場合の1人ぶん（全日）。出せなければ null */
  const singleRentalOf = (
    group: TicketPartyGroup,
    items: TicketRentalItem[],
  ) => {
    if (items.length === 0 || !group.rental) return 0;
    const line = calculateRentalPlan(data, {
      ...input,
      party: [{ ...group, count: 1, rental: { ...group.rental, items } }],
    }).lines[0];
    return line?.unitTotal ?? null;
  };
  for (const product of products) {
    const periods = bundlePeriodsOf(
      product,
      plan.days.map(day => day.plan),
    );
    if (
      !periods ||
      !plan.days.every(day => dayFitsBundle(data, product, day.plan))
    ) {
      continue;
    }
    // セット券がまかなわない用具は単品を足す（BN04）。まかなう物が1つも無い人は対象外
    const extras = new Map<
      string,
      { items: TicketRentalItem[]; unit: number }
    >();
    const groups = renters.filter(group => {
      const sport = group.rental?.sport;
      if (!sport) return false;
      const covered = bundleCoveredItemsOf(product, sport);
      const missing = missingRentalItemsOf(rentalOptions, group.rental);
      const required = rentalItemsOf(group.rental).filter(
        item => !missing.includes(item),
      );
      if (!required.some(item => covered.has(item))) return false;
      const uncovered = required.filter(item => !covered.has(item));
      const unit = singleRentalOf(group, uncovered);
      if (unit == null) return false;
      if (uncovered.length > 0)
        extras.set(group.id, { items: uncovered, unit });
      return true;
    });
    groupsByProduct.set(product.id, groups);
    periodsByProduct.set(product.id, periods);
    const results = resultsFor(product.id, groups, periods);
    const includes = (product.included_items ?? []).map(item => item.name_ja);
    for (const group of groups) {
      const lines = results.map(result =>
        result.lines.find(line => line.groupId === group.id),
      );
      if (lines.every(line => line?.subtotal != null)) {
        const found = lines as TicketCalculationLine[];
        const extra = extras.get(group.id);
        const unitAmount =
          sum(found.map(line => line.unitAmount ?? 0)) + (extra?.unit ?? 0);
        const best = adoptable.get(group.id);
        if (!best || unitAmount < best.unitAmount) {
          adoptable.set(group.id, {
            productId: product.id,
            productName: product.official_label_ja ?? product.name_ja,
            offerName: found[0].offerName,
            includes,
            unitAmount,
            line: found[0],
            extraNote: extra
              ? `${formatRentalRequest({ sport: group.rental?.sport ?? "ski", items: extra.items })}はセット券に含まれないため、単品（${extra.unit.toLocaleString("ja-JP")}円）を足しています`
              : null,
            sourceNumbers: [
              ...new Set(found.flatMap(line => line.sourceNumbers)),
            ],
            sourceQuotes: mergeQuotes(found.map(line => line.sourceQuotes)),
          });
        }
      }
      // 条件付きの案は、全日で同じ割引が使えるものだけを合算する
      const keyOf = (offer: TicketConditionalOffer) =>
        offer.id.slice(group.id.length + 1);
      const perDay = results.map(result =>
        result.conditionalOffers.filter(offer => offer.groupId === group.id),
      );
      for (const first of perDay[0] ?? []) {
        const same = perDay.map(offers =>
          offers.find(offer => keyOf(offer) === keyOf(first)),
        );
        if (
          !same.every((offer): offer is TicketConditionalOffer => offer != null)
        ) {
          continue;
        }
        const unitAmount =
          sum(same.map(offer => offer.unitAmount)) +
          (extras.get(group.id)?.unit ?? 0);
        // 同じ条件（同じクーポン・同じ資格）で使える券は、借りる物をまかなえる最安だけ残す
        const id = `${group.id}:${first.label}`;
        const best = conditional.get(id);
        if (best && best.unitAmount <= unitAmount) continue;
        conditional.set(id, {
          ...first,
          id: `${group.id}:${product.id}:${keyOf(first)}`,
          // 条件名は短く書く決まり。長文（手順の説明など）が入っていたら券名だけにする
          label:
            first.label.length <= 24
              ? `${first.productName}（${first.label}）`
              : first.productName,
          unitAmount,
          subtotal: unitAmount * group.count,
          sourceNumbers: [
            ...new Set(same.flatMap(offer => offer.sourceNumbers)),
          ],
          sourceQuotes: mergeQuotes(same.map(offer => offer.sourceQuotes)),
        });
      }
    }

    // 同行者パック（複数人で金額が決まるセット券）。借りない同行者も入る組み合わせも比べる
    const rentingIds = new Set(groups.map(group => group.id));
    const setGroups = input.party.filter(
      group =>
        group.count > 0 &&
        (rentingIds.has(group.id) || rentalItemsOf(group.rental).length === 0),
    );
    if ((data.party_rules?.length ?? 0) > 0 && setGroups.length > 0) {
      const setResults = resultsFor(product.id, setGroups, periods);
      const ruleLines = setResults.map(result =>
        result.lines.filter(line => line.groupId.startsWith(PARTY_RULE_PREFIX)),
      );
      const first = ruleLines[0]?.[0];
      // 全日で同じパック1つだけを使う場合に比べる（日ごとに違う組み合わせは扱わない）
      if (
        first &&
        ruleLines.every(
          found => found.length === 1 && found[0].groupId === first.groupId,
        )
      ) {
        const restCount = (group: TicketPartyGroup) =>
          setResults.map(
            result =>
              result.lines.find(line => line.groupId === group.id)?.count ?? 0,
          );
        // セットに全員が入る利用者だけを扱う（一部の人数だけ入る組み合わせは扱わない）
        const partial = setGroups.some(group =>
          restCount(group).some(count => count > 0 && count < group.count),
        );
        const members = setGroups.filter(group =>
          restCount(group).every(count => count === 0),
        );
        if (!partial && members.length > 0) {
          const extraUnits = members.map(group => extras.get(group.id));
          const extraNotes = members.flatMap(group => {
            const extra = extras.get(group.id);
            return extra
              ? [
                  `${formatRentalRequest({ sport: group.rental?.sport ?? "ski", items: extra.items })}はセット券に含まれないため、単品（${extra.unit.toLocaleString("ja-JP")}円）を足しています`,
                ]
              : [];
          });
          const found = ruleLines.map(found => found[0]);
          setCandidates.push({
            productId: product.id,
            productName: product.official_label_ja ?? product.name_ja,
            line: first,
            members,
            nonRenterLabels: members
              .filter(group => !rentingIds.has(group.id))
              .map(formatPartyGroupLabel),
            includes,
            subtotal:
              sum(found.map(line => line.subtotal ?? 0)) +
              sum(
                members.map(
                  (group, index) =>
                    (extraUnits[index]?.unit ?? 0) * group.count,
                ),
              ),
            extraNotes,
            sourceNumbers: [
              ...new Set(found.flatMap(line => line.sourceNumbers)),
            ],
            sourceQuotes: mergeQuotes(found.map(line => line.sourceQuotes)),
          });
        }
      }
    }
  }

  // 年齢が空欄でセット券が出なかった人に、年齢を入れれば使えるかを確かめる。
  // 試す年齢は、セット券の人物区分の境界（「22歳まで」なら22、「23歳以上」なら23）
  const sampleAges = [
    ...new Set(
      data.offers
        .filter(offer => groupsByProduct.has(offer.product_id))
        .flatMap(offer => offer.audience_ids ?? [])
        .map(id => data.audiences.find(audience => audience.id === id))
        .filter(
          audience =>
            audience != null &&
            !audience.is_default &&
            !audience.is_disability_qualified &&
            (audience.school_levels?.length ?? 0) === 0,
        )
        .flatMap(audience => [audience?.age_min, audience?.age_max])
        .filter((age): age is number => age != null && age >= 19),
    ),
  ];
  const ageNeededGroupIds = renters
    .filter(
      group =>
        group.age == null && ["adult", "senior"].includes(group.category),
    )
    .filter(group => {
      // 年齢空欄でも出るセット券の料金（大人料金）がある場合は、年齢を入れると
      // それより安くなるときだけ案内する（年齢で分かれるセット券・PB09）
      const known = adoptable.get(group.id)?.unitAmount;
      return [...groupsByProduct].some(
        ([productId, groups]) =>
          groups.includes(group) &&
          sampleAges.some(age => {
            const results = resultsFor(
              productId,
              [{ ...group, age }],
              periodsByProduct.get(productId) ?? [],
            );
            const lines = results.map(result => result.lines[0]);
            return (
              lines.every(line => line?.subtotal != null) &&
              (known == null ||
                sum(lines.map(line => line?.unitAmount ?? 0)) < known)
            );
          }),
      );
    })
    .map(group => group.id);

  // 別々に買うより安い（比べられないなら、セット券しか料金が出ない）人だけセット券にする
  type Adopted = {
    members: TicketPartyGroup[];
    ticket: number;
    separate: number | null;
    bundleSubtotal: number;
    toLine: (separate: number | null) => TicketBundleLine;
  };
  const individuals: Adopted[] = renters.flatMap(group => {
    const candidate = adoptable.get(group.id);
    const ticket = ticketOf(group);
    if (!candidate || ticket == null) return [];
    const separate = separateOf(group);
    const bundleSubtotal = candidate.unitAmount * group.count;
    if (separate != null && bundleSubtotal >= separate) return [];
    return [
      {
        members: [group],
        ticket,
        separate,
        bundleSubtotal,
        toLine: separateSubtotal => ({
          groupId: group.id,
          groupLabel: candidate.line.groupLabel,
          count: group.count,
          productId: candidate.productId,
          productName: candidate.productName,
          offerName: candidate.offerName,
          includes: candidate.includes,
          unitAmount: candidate.unitAmount,
          subtotal: bundleSubtotal,
          separateSubtotal,
          purchaseNote: candidate.line.purchaseNote ?? null,
          warnings: [
            ...(candidate.line.warnings ?? []),
            ...(candidate.extraNote ? [candidate.extraNote] : []),
          ],
          sourceNumbers: candidate.sourceNumbers,
          sourceQuotes: candidate.sourceQuotes,
        }),
      },
    ];
  });

  // 同行者パック。全員がレンタルを借りる組み合わせだけ自動で使い、借りない同行者にも
  // レンタルが付く組み合わせは「安い候補」として示す（P42・P45）
  const setOptions = setCandidates.flatMap(candidate => {
    const ticket = ticketOfMembers(candidate.members);
    const rentals = candidate.members
      .filter(group => rentalItemsOf(group.rental).length > 0)
      .map(rentalOf);
    const separate =
      ticket != null && rentals.every(amount => amount != null)
        ? ticket + sum(rentals.map(amount => amount ?? 0))
        : null;
    return [{ candidate, ticket, separate }];
  });
  const setSavings = (separate: number | null, subtotal: number) =>
    separate == null ? 0 : separate - subtotal;
  const individualSavings = (members: TicketPartyGroup[]) =>
    sum(
      individuals
        .filter(unit => members.some(group => group.id === unit.members[0].id))
        .map(unit => setSavings(unit.separate, unit.bundleSubtotal)),
    );
  const chosenSets: Adopted[] = [];
  const takenIds = new Set<string>();
  for (const { candidate, ticket, separate } of setOptions
    .filter(
      option =>
        option.ticket != null &&
        option.candidate.nonRenterLabels.length === 0 &&
        (option.separate == null ||
          option.candidate.subtotal < option.separate),
    )
    .sort(
      (left, right) =>
        setSavings(right.separate, right.candidate.subtotal) -
        setSavings(left.separate, left.candidate.subtotal),
    )) {
    const { members } = candidate;
    if (
      ticket == null ||
      members.some(group => takenIds.has(group.id)) ||
      individualSavings(members) >= setSavings(separate, candidate.subtotal)
    ) {
      continue;
    }
    for (const group of members) takenIds.add(group.id);
    const people = sum(members.map(group => group.count));
    chosenSets.push({
      members,
      ticket,
      separate,
      bundleSubtotal: candidate.subtotal,
      toLine: separateSubtotal => ({
        groupId: candidate.line.groupId,
        groupLabel: candidate.line.groupLabel,
        count: people,
        productId: candidate.productId,
        productName: candidate.productName,
        offerName: candidate.line.offerName,
        includes: candidate.includes,
        unitAmount: candidate.subtotal,
        subtotal: candidate.subtotal,
        separateSubtotal,
        purchaseNote:
          [candidate.line.note, candidate.line.purchaseNote]
            .filter(Boolean)
            .join("・") || null,
        warnings: [...(candidate.line.warnings ?? []), ...candidate.extraNotes],
        sourceNumbers: candidate.sourceNumbers,
        sourceQuotes: candidate.sourceQuotes,
        memberGroupIds: members.map(group => group.id),
        memberGroupLabels: members.map(formatPartyGroupLabel),
      }),
    });
  }
  const adopted: Adopted[] = [
    ...chosenSets,
    ...individuals.filter(unit => !takenIds.has(unit.members[0].id)),
  ];
  const adoptedIds = new Set(
    adopted.flatMap(unit => unit.members.map(group => group.id)),
  );
  const unbundledRenters = renters.filter(group => !adoptedIds.has(group.id));
  const unbundledRental = unbundledRenters.map(rentalOf);
  const total = unbundledRental.some(amount => amount == null)
    ? null
    : perDayTotal -
      sum(adopted.map(({ ticket }) => ticket)) +
      sum(adopted.map(({ bundleSubtotal }) => bundleSubtotal)) +
      sum(unbundledRental.map(amount => amount ?? 0));
  const separateTotal =
    plan.total != null && rental?.total != null
      ? plan.total + rental.total
      : null;
  const useBundle =
    adopted.length > 0 &&
    (separateTotal == null || (total != null && total < separateTotal));

  const lines: TicketBundleLine[] = useBundle
    ? adopted.map(unit => unit.toLine(unit.separate))
    : [];

  // 借りない同行者にもレンタルが付くパックは、自動では使わず安い候補として示す
  const setOffers: TicketConditionalOffer[] = setOptions
    .filter(
      ({ candidate, separate }) =>
        candidate.nonRenterLabels.length > 0 &&
        separate != null &&
        candidate.subtotal < separate,
    )
    .map(({ candidate }) => ({
      id: `${candidate.line.groupId}:${candidate.productId}`,
      groupId: candidate.line.groupId,
      groupLabel: candidate.line.groupLabel,
      count: sum(candidate.members.map(group => group.count)),
      productName: candidate.productName,
      offerName: candidate.line.offerName ?? candidate.productName,
      unitAmount: candidate.subtotal,
      subtotal: candidate.subtotal,
      label: candidate.line.partySet?.name ?? candidate.productName,
      conditions: [
        `${candidate.nonRenterLabels.join("・")}のレンタルも付きます`,
        ...(candidate.line.note ? [candidate.line.note] : []),
      ],
      sourceNumbers: candidate.sourceNumbers,
      sourceQuotes: candidate.sourceQuotes,
    }))
    .filter(offer => !lines.some(line => line.subtotal <= offer.subtotal));

  const conditionalOffers = [
    ...[...conditional.values()].filter(offer => {
      const group = renters.find(candidate => candidate.id === offer.groupId);
      if (!group) return false;
      const adoptedLine = lines.find(line => line.groupId === group.id);
      const benchmark = adoptedLine?.subtotal ?? separateOf(group);
      return benchmark == null || offer.subtotal < benchmark;
    }),
    ...setOffers,
  ].sort((left, right) => left.subtotal - right.subtotal);

  if (
    lines.length === 0 &&
    conditionalOffers.length === 0 &&
    ageNeededGroupIds.length === 0
  ) {
    return null;
  }
  const used = new Set([
    ...lines.flatMap(line => line.sourceNumbers),
    ...conditionalOffers.flatMap(offer => offer.sourceNumbers),
  ]);
  return {
    lines,
    conditionalOffers,
    total: useBundle ? total : null,
    separateTotal,
    savings:
      useBundle && total != null && separateTotal != null
        ? separateTotal - total
        : null,
    unbundledRenterGroupIds: useBundle
      ? unbundledRenters.map(group => group.id)
      : renters.map(group => group.id),
    ageNeededGroupIds,
    references: references.filter(reference => used.has(reference.number)),
  };
};

/**
 * セット券を使う利用者の券を、日ごとの計画から外す（セット券の枠に移したため）。
 * 全員がセット券で、その日に残る券が無ければ、その日の枠そのものを出さない。
 */
export const planWithoutBundledGroups = (
  plan: TicketPlanResult,
  bundle: TicketBundleResult,
): TicketPlanResult => {
  const bundled = new Set(
    bundle.lines.flatMap(line => line.memberGroupIds ?? [line.groupId]),
  );
  // 同行者パックの利用者がすでに計画の同行者パックに入っているとき、その行も外す
  const bundledLabels = new Set(
    bundle.lines.flatMap(line => line.memberGroupLabels ?? []),
  );
  const isBundledLine = (line: TicketCalculationLine) =>
    bundled.has(line.groupId) ||
    (line.groupId.startsWith(PARTY_RULE_PREFIX) &&
      bundledLabels.size > 0 &&
      line.groupLabel.split("＋").every(label => bundledLabels.has(label)));
  const days = plan.days
    .map(day => {
      const removed = sum(
        day.result.lines.filter(isBundledLine).map(line => line.subtotal ?? 0),
      );
      const lines = day.result.lines.filter(line => !isBundledLine(line));
      return {
        ...day,
        result: {
          ...day.result,
          lines,
          ticketTotal:
            day.result.ticketTotal == null
              ? null
              : day.result.ticketTotal - removed,
          knownTicketTotal: day.result.knownTicketTotal - removed,
          payableTotal:
            day.result.payableTotal == null
              ? null
              : day.result.payableTotal - removed,
          conditionalOffers: day.result.conditionalOffers.filter(
            offer => !bundled.has(offer.groupId),
          ),
        },
      };
    })
    .filter(
      day => day.result.lines.length > 0 || day.result.status !== "complete",
    );
  return { ...plan, days, multiDay: null, total: bundle.total };
};
