import type {
  LiftTicketData,
  PriceReference,
  TicketCalculationLine,
} from "../types";
import type { TicketPlanResult } from "./calculateLiftTicket";
import type { PurchaseTierKey } from "./purchaseTiers";
import type { TicketRentalResult } from "./rental";
import {
  planWithoutBundledGroups,
  type TicketBundleResult,
} from "./rentalBundle";

/** 「12/19から販売開始です」。日ごとに繰り返さず、段階の中に1回だけ出す */
const isSalesStartWarning = (warning: string) =>
  /から販売開始です$/u.test(warning);

/** オンラインで買う料金か（購入ページのURLがある、または Web で買う券） */
export const isOnlineLine = (line: TicketCalculationLine) =>
  line.purchaseUrl != null || line.purchaseOnline === true;

/** Web・前売で安くなった料金か（窓口でそのまま買う料金ではない） */
export const isPurchaseMethodLine = (line: TicketCalculationLine) =>
  line.purchaseNote != null || isOnlineLine(line);

/** 1つの買い方（早割・Web・通常）で計算した結果 */
export type TicketPlanTierInput = {
  key: PurchaseTierKey;
  plan: TicketPlanResult;
  rental: TicketRentalResult | null;
  bundle: TicketBundleResult | null;
};

/**
 * 計算結果を画面に出す形にまとめたもの。
 * セット券を使う人のリフト券・レンタルをセット券の枠へ移し、同じ内容の日をまとめる
 */
export type TicketPlanView = {
  fullPlan: TicketPlanResult;
  /** セット券を使う人を除いたリフト券 */
  plan: TicketPlanResult;
  /** セット券を使う人を除いたレンタル。出す行が無ければ null */
  rental: TicketRentalResult | null;
  rentalShown: boolean;
  bundle: TicketBundleResult | null;
  bundleApplied: TicketBundleResult | null;
  total: number | null;
  withRental: boolean;
  references: PriceReference[];
  tripDayCount: number;
  /** 券も金額も同じ日のまとまり（plan.days の添字） */
  dayGroups: Array<{ indices: number[] }>;
  /** 画面に出す券の行と、その行を買う回数（日数・枚数） */
  shownLines: Array<{ line: TicketCalculationLine; multiplier: number }>;
  /** 選んだのに料金情報が無い用具（合計の横に「＋ゴーグル」と添える） */
  missingRentalLabels: string[];
  missingRentalNote: string | null;
  unavailableRentalNote: string | null;
};

export const buildPlanView = (
  fullPlan: TicketPlanResult,
  fullRental: TicketRentalResult | null,
  bundle: TicketBundleResult | null,
): TicketPlanView => {
  // セット券を使う人は、リフト券もレンタルもセット券の枠に移す
  const bundleApplied =
    bundle != null && bundle.lines.length > 0 ? bundle : null;
  const plan = bundleApplied
    ? planWithoutBundledGroups(fullPlan, bundleApplied)
    : fullPlan;
  const bundledIds = new Set(
    bundleApplied?.lines.flatMap(line => line.memberGroupIds ?? [line.groupId]),
  );
  const rental: TicketRentalResult | null =
    bundleApplied && fullRental
      ? fullRental.status === "not_collected"
        ? bundleApplied.unbundledRenterGroupIds.length > 0
          ? fullRental
          : null
        : (() => {
            const lines = fullRental.lines.filter(
              line => !bundledIds.has(line.groupId),
            );
            const complete = lines.every(line => line.subtotal != null);
            const knownTotal = lines.reduce(
              (sum, line) => sum + (line.subtotal ?? 0),
              0,
            );
            return lines.length === 0
              ? null
              : {
                  ...fullRental,
                  lines,
                  knownTotal,
                  total: complete ? knownTotal : null,
                };
          })()
      : fullRental;
  const usesMultiDay = plan.multiDay != null;
  const coveredByMultiDay = (date: string) =>
    usesMultiDay && Boolean(plan.multiDay?.dates.includes(date));
  // 借りられない用具だけを選んだ人しかいなければ、レンタルの枠は出さない
  const rentalShown =
    rental != null &&
    (rental.status === "complete" || rental.status === "partial") &&
    rental.lines.some(line => line.picks.length > 0 || line.subtotal == null);
  // レンタル情報が無い物は合計に含めず、「¥3,900 ＋ゴーグル」と添えて注釈を出す
  const rentalNotCollected = rental?.status === "not_collected";
  const missingRentalLabels = rentalNotCollected
    ? ["レンタル"]
    : (fullRental?.missingLabels ?? []);
  const missingRentalNote =
    missingRentalLabels.length === 0
      ? null
      : rentalNotCollected
        ? "※このスキー場のレンタル情報はありませんでした"
        : `※${missingRentalLabels.join("・")}のレンタル情報はありませんでした`;
  // 区分によって貸出が無い用具（小学生のウェアなど）は合計に含めず、その旨だけ添える
  const unavailableRentalLabels = rentalNotCollected
    ? []
    : (fullRental?.unavailableLabels ?? []);
  const unavailableRentalNote =
    unavailableRentalLabels.length === 0
      ? null
      : `※${unavailableRentalLabels.join("・")}は貸出がありません`;
  // リフト券もレンタルも出たときだけ合計を出す。どちらかが未確定なら合計も未確定
  const separateTotal = !rentalShown
    ? plan.total
    : plan.total == null || rental?.total == null
      ? null
      : plan.total + rental.total;
  const total = bundleApplied ? bundleApplied.total : separateTotal;
  const references = bundle
    ? [
        ...plan.references,
        ...bundle.references.filter(
          reference =>
            !plan.references.some(other => other.number === reference.number),
        ),
      ]
    : plan.references;

  // ★**券も金額も同じ日は1つにまとめて「× 3日」と出す**（同じ内訳を繰り返さない）
  const dayGroups: Array<{ indices: number[] }> = [];
  const groupBySignature = new Map<string, { indices: number[] }>();
  plan.days.forEach((day, index) => {
    // 複数日券・25時間券でまかなう日は、その券の枠にまとめて出す（日ごとの枠は作らない）
    if (coveredByMultiDay(day.plan.date)) return;
    const signature = JSON.stringify([
      day.result.status,
      day.result.notes[0] ?? null,
      day.result.payableTotal,
      day.result.lines,
      day.result.conditionalOffers.map(offer => [offer.id, offer.subtotal]),
    ]);
    const existing = groupBySignature.get(signature);
    if (existing) {
      existing.indices.push(index);
      return;
    }
    const group = { indices: [index] };
    groupBySignature.set(signature, group);
    dayGroups.push(group);
  });

  const shownLines = [
    ...dayGroups.flatMap(({ indices }) =>
      plan.days[indices[0]].result.lines.map(line => ({
        line,
        multiplier: indices.length,
      })),
    ),
    ...(plan.multiDay?.lines ?? []).map(line => ({
      line,
      multiplier: plan.multiDay?.ticketCount ?? 1,
    })),
    ...(plan.multiDay?.addOns ?? []).flatMap(addOn =>
      addOn.lines.map(line => ({ line, multiplier: addOn.ticketCount })),
    ),
  ];

  return {
    fullPlan,
    plan,
    rental,
    rentalShown,
    bundle,
    bundleApplied,
    total,
    withRental: rentalShown || bundleApplied != null,
    references,
    tripDayCount: fullPlan.days.length,
    dayGroups,
    shownLines,
    missingRentalLabels,
    missingRentalNote,
    unavailableRentalNote,
  };
};

/** 段階の見出しに添えるリンク。Web・早割は購入ページ、通常は公式の料金表 */
export type TicketPlanTierLink = { kind: "purchase" | "source"; url: string };

export type TicketPlanTier = {
  key: PurchaseTierKey;
  /** 「早割」「Web」「前売」「通常」 */
  label: string;
  /** 利用日より前に買う必要があるとき、買える最後の日（「11/30まで」） */
  deadline: string | null;
  link: TicketPlanTierLink | null;
  /** レンタルの見出しに添えるリンク。Web料金で借りるなら購入ページ、ほかは公式の料金表 */
  rentalLink: TicketPlanTierLink | null;
  /** 「12/19から販売開始」 */
  salesStarts: string[];
  view: TicketPlanView;
};

const webRentalPicksOf = (view: TicketPlanView) =>
  view.rentalShown
    ? (view.rental?.lines ?? []).flatMap(line =>
        line.picks.filter(pick => pick.purchaseUrl != null),
      )
    : [];

const tierLinkOf = (
  data: LiftTicketData,
  key: PurchaseTierKey,
  view: TicketPlanView,
): TicketPlanTierLink | null => {
  const links = data.main_links;
  if (key === "counter") {
    return links?.lift_price_url
      ? { kind: "source", url: links.lift_price_url }
      : null;
  }
  const purchased = view.shownLines
    .map(({ line }) => line)
    .filter(isPurchaseMethodLine);
  // 券ごとの商品ページではなく、販売経路の入口へ連れて行く
  const channelUrl = purchased
    .flatMap(line => line.channelIds ?? [])
    .map(id => data.channels.find(channel => channel.id === id)?.url)
    .find((url): url is string => Boolean(url));
  const liftUrl =
    purchased.length > 0
      ? (links?.lift_purchase_url ??
        channelUrl ??
        purchased.find(line => line.purchaseUrl)?.purchaseUrl)
      : null;
  // リフト券は窓口と同じで、レンタルだけがWeb料金のとき
  const rentalUrl =
    links?.rental_purchase_url ?? webRentalPicksOf(view)[0]?.purchaseUrl;
  const url = liftUrl ?? (webRentalPicksOf(view).length > 0 ? rentalUrl : null);
  return url ? { kind: "purchase", url } : null;
};

const rentalLinkOf = (
  data: LiftTicketData,
  view: TicketPlanView,
): TicketPlanTierLink | null => {
  const links = data.main_links;
  const webPicks = webRentalPicksOf(view);
  if (webPicks.length > 0) {
    const url = links?.rental_purchase_url ?? webPicks[0].purchaseUrl;
    return url ? { kind: "purchase", url } : null;
  }
  return links?.rental_price_url
    ? { kind: "source", url: links.rental_price_url }
    : null;
};

/**
 * 画面に出す買い方の段階。安い順（早割 → Web → 通常）。
 *
 * ★**早割は、Webより安くならなければ出さない**（早割が無い日・締切を過ぎた日）。
 * Webは、窓口と同額でもWebで買える料金があれば出す。窓口で買えない券しか無いときは
 * 「通常」を出さない。
 * どの段階も金額が出ないとき（年齢の未入力など）は、1つだけ出す
 */
export const buildPlanTiers = (
  data: LiftTicketData,
  inputs: TicketPlanTierInput[],
): TicketPlanTier[] => {
  const views = inputs.map(input => ({
    key: input.key,
    view: buildPlanView(input.plan, input.rental, input.bundle),
  }));
  const priced = views.filter(({ view }) => view.total != null);
  // Webで買う料金を使っているか（窓口と同額でも、Webで買えることは出す）
  const usesPurchaseMethod = (view: TicketPlanView) =>
    view.shownLines.some(({ line }) => isPurchaseMethodLine(line)) ||
    webRentalPicksOf(view).length > 0;
  const kept =
    priced.length === 0
      ? views.slice(0, 1)
      : priced.filter(({ key, view }, index) => {
          const next = priced[index + 1];
          if (next == null) return true;
          const total = view.total as number;
          const nextTotal = next.view.total as number;
          return (
            total < nextTotal ||
            (key === "web" && total === nextTotal && usesPurchaseMethod(view))
          );
        });
  return kept.map(({ key, view }) => {
    const purchased = view.shownLines
      .map(({ line }) => line)
      .filter(isPurchaseMethodLine);
    const deadline =
      purchased
        .map(line => line.purchaseDeadline)
        .filter((date): date is string => Boolean(date))
        .sort()[0] ?? null;
    const online =
      purchased.some(isOnlineLine) || webRentalPicksOf(view).length > 0;
    return {
      key,
      label:
        key === "counter"
          ? "通常"
          : key === "advance"
            ? "早割"
            : online
              ? "Web"
              : "前売",
      deadline: key === "counter" ? null : deadline,
      link: tierLinkOf(data, key, view),
      rentalLink: rentalLinkOf(data, view),
      salesStarts: [
        ...new Set(
          purchased.flatMap(line =>
            (line.warnings ?? []).filter(isSalesStartWarning),
          ),
        ),
      ].map(warning => warning.replace(/です$/u, "")),
      view,
    };
  });
};
