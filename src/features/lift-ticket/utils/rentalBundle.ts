import type {
  LiftTicketData,
  LiftTicketSearchInput,
  LiftTicketSourceQuote,
  PriceReference,
  TicketCalculationLine,
  TicketConditionalOffer,
  TicketDayPlan,
  TicketPartyGroup,
} from "../types";
import {
  buildReferences,
  calculateLiftTicket,
  hasNightOperatingOn,
  type TicketPlanResult,
} from "./calculateLiftTicket";
import {
  bundleCoveredItemsOf,
  isRentalBundleProduct,
  rentalItemsOf,
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
  references: PriceReference[];
};

type Candidate = {
  productId: string;
  productName: string;
  offerName: string | null;
  includes: string[];
  unitAmount: number;
  line: TicketCalculationLine;
  sourceNumbers: number[];
  sourceQuotes?: Record<number, LiftTicketSourceQuote>;
};

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

/** 1日の滑走がセット券でまかなえるか（ナイター込みなら、ナイターを含む券だけ） */
const dayFitsBundle = (
  data: LiftTicketData,
  covers: string[] | null | undefined,
  day: TicketDayPlan,
) => {
  if (!day.date) return false;
  const needsNight =
    day.duration.kind === "day" &&
    day.duration.withNight &&
    hasNightOperatingOn(data, day.date);
  return !needsNight || covers?.includes("night") === true;
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

  const adoptable = new Map<string, Candidate>();
  const conditional = new Map<string, TicketConditionalOffer>();
  for (const product of products) {
    if (
      !plan.days.every(day =>
        dayFitsBundle(data, product.covers_hours_types, day.plan),
      )
    ) {
      continue;
    }
    const groups = renters.filter(group => {
      const sport = group.rental?.sport;
      if (!sport) return false;
      const covered = bundleCoveredItemsOf(product, sport);
      return rentalItemsOf(group.rental).every(item => covered.has(item));
    });
    if (groups.length === 0) continue;
    const results = plan.days.map(day =>
      calculateLiftTicket(
        data,
        { ...input, visitDate: day.plan.date, days: undefined, party: groups },
        product.id,
      ),
    );
    const includes = (product.included_items ?? []).map(item => item.name_ja);
    for (const group of groups) {
      const lines = results.map(result =>
        result.lines.find(line => line.groupId === group.id),
      );
      if (lines.every(line => line?.subtotal != null)) {
        const found = lines as TicketCalculationLine[];
        const unitAmount = sum(found.map(line => line.unitAmount ?? 0));
        const best = adoptable.get(group.id);
        if (!best || unitAmount < best.unitAmount) {
          adoptable.set(group.id, {
            productId: product.id,
            productName: product.official_label_ja ?? product.name_ja,
            offerName: found[0].offerName,
            includes,
            unitAmount,
            line: found[0],
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
        const unitAmount = sum(same.map(offer => offer.unitAmount));
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
  }

  // 別々に買うより安い（比べられないなら、セット券しか料金が出ない）人だけセット券にする
  const adopted = renters.flatMap(group => {
    const candidate = adoptable.get(group.id);
    const ticket = ticketOf(group);
    if (!candidate || ticket == null) return [];
    const separate = separateOf(group);
    const bundleSubtotal = candidate.unitAmount * group.count;
    return separate == null || bundleSubtotal < separate
      ? [{ group, candidate, ticket, separate, bundleSubtotal }]
      : [];
  });
  const adoptedIds = new Set(adopted.map(({ group }) => group.id));
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
    ? adopted.map(({ group, candidate, separate, bundleSubtotal }) => ({
        groupId: group.id,
        groupLabel: candidate.line.groupLabel,
        count: group.count,
        productId: candidate.productId,
        productName: candidate.productName,
        offerName: candidate.offerName,
        includes: candidate.includes,
        unitAmount: candidate.unitAmount,
        subtotal: bundleSubtotal,
        separateSubtotal: separate,
        purchaseNote: candidate.line.purchaseNote ?? null,
        warnings: candidate.line.warnings ?? [],
        sourceNumbers: candidate.sourceNumbers,
        sourceQuotes: candidate.sourceQuotes,
      }))
    : [];

  const conditionalOffers = [...conditional.values()]
    .filter(offer => {
      const group = renters.find(candidate => candidate.id === offer.groupId);
      if (!group) return false;
      const adoptedLine = lines.find(line => line.groupId === group.id);
      const benchmark = adoptedLine?.subtotal ?? separateOf(group);
      return benchmark == null || offer.subtotal < benchmark;
    })
    .sort((left, right) => left.subtotal - right.subtotal);

  if (lines.length === 0 && conditionalOffers.length === 0) return null;
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
  const bundled = new Set(bundle.lines.map(line => line.groupId));
  const days = plan.days
    .map(day => {
      const removed = sum(
        day.result.lines
          .filter(line => bundled.has(line.groupId))
          .map(line => line.subtotal ?? 0),
      );
      const lines = day.result.lines.filter(line => !bundled.has(line.groupId));
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
