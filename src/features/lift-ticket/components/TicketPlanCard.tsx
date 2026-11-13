"use client";

import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  PriceReference,
  TicketCalculationFee,
  TicketCalculationLine,
} from "../types";
import type { TicketPlanTier } from "../utils/planView";
import type { PurchaseTierKey } from "../utils/purchaseTiers";
import { withSourceQuote } from "../utils/sourceQuote";
import { BundleSummary } from "./BundleSummary";
import { ConditionalOffers } from "./ConditionalOffers";
import { DurationAlternatives } from "./DurationAlternatives";
import { RentalSummary } from "./RentalSummary";
import { LinkChip, SourceLinks } from "./SourceLinks";
import {
  hasSingleTicket,
  TicketLineDetail,
  TicketName,
} from "./TicketLineDetail";

const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

/**
 * 券の行の出典。人数の右に並べる。
 * Web・前売の料金は、券ごとの商品ページ（その料金の場所が分かる購入ページ）へ飛ばす。
 * 見出しの「購入」と同じページしか無いときと、窓口の料金は、料金の出典へ飛ばす
 */
const LineSource = ({
  line,
  references,
  tierUrl,
}: {
  line: TicketCalculationLine;
  references: PriceReference[];
  /** 買い方の見出しに出した「購入」のリンク先 */
  tierUrl: string | null;
}) =>
  line.purchaseUrl && (line.purchaseQuote || line.purchaseUrl !== tierUrl) ? (
    <LinkChip
      href={withSourceQuote(line.purchaseUrl, line.purchaseQuote ?? undefined)}
      title={line.purchaseUrl}
      aria-label="出典（購入ページ）"
      compact
      className="ml-1.5 align-middle"
    >
      出典
    </LinkChip>
  ) : (
    <SourceLinks
      numbers={line.sourceNumbers}
      references={references}
      quotes={line.sourceQuotes}
      single
      compact
      className="ml-1.5 align-middle"
    />
  );

/** 段の中の券の行。「誰が何人［出典］ 金額」を1行ずつ出す */
const TicketLines = ({
  lines,
  multiplier,
  multiplierUnit,
  showTicket,
  references,
  tierUrl,
}: {
  lines: TicketCalculationLine[];
  multiplier: number;
  multiplierUnit: "枚" | "日";
  /** 券名を段の見出しに出したときは false */
  showTicket: boolean;
  references: PriceReference[];
  tierUrl: string | null;
}) => (
  <div className="mt-1 flex flex-col gap-1">
    {lines.map(line => (
      <TicketLineDetail
        key={line.groupId}
        line={line}
        multiplier={multiplier}
        multiplierUnit={multiplierUnit}
        showTicket={showTicket}
        badge={false}
        sources={
          <LineSource line={line} references={references} tierUrl={tierUrl} />
        }
      />
    ))}
  </div>
);

/** 段の金額に含めた送料・手数料（「配送料 ¥600」）。足した額を必ず見せる */
const FeeLines = ({
  fees,
  multiplier,
  references,
}: {
  fees: TicketCalculationFee[];
  multiplier: number;
  /** 手数料額の根拠。券の行と同じく名前の右に出す */
  references: PriceReference[];
}) =>
  fees.length === 0 ? null : (
    <div className="mt-1 flex flex-col gap-1">
      {fees.map(fee => (
        <div
          key={fee.name}
          className="flex items-baseline justify-between gap-3 text-sm"
        >
          <p className="min-w-0 text-gray-900">
            {fee.name}
            {multiplier > 1 ? (
              <span className="ml-2 text-gray-600">× {multiplier}日</span>
            ) : null}
            <SourceLinks
              numbers={fee.sourceNumbers ?? []}
              references={references}
              quotes={fee.sourceQuotes}
              single
              compact
              className="ml-1.5 align-middle"
            />
          </p>
          <p className="flex-shrink-0 text-base font-semibold text-gray-900 font-mono">
            {yen(fee.total * multiplier)}
          </p>
        </div>
      ))}
    </div>
  );

const weekdayOf = (date: string) => {
  if (!date) return "";
  const at = new Date(`${date}T12:00:00Z`);
  return ["日", "月", "火", "水", "木", "金", "土"][at.getUTCDay()];
};

const shortDateOf = (date: string) =>
  `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${weekdayOf(date)}）`;

/** 「2026-11-30」→「11/30」 */
const monthDayOf = (date: string) =>
  `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

const dateLabelOf = (dates: string[]) => {
  if (dates.length === 1 && !dates[0]) return "日付未入力";
  const consecutive = dates.every(
    (date, i) =>
      i === 0 ||
      Date.parse(`${date}T12:00:00Z`) -
        Date.parse(`${dates[i - 1]}T12:00:00Z`) ===
        86400000,
  );
  if (dates.length === 1) return shortDateOf(dates[0]);
  return consecutive
    ? `${shortDateOf(dates[0])}〜${shortDateOf(dates[dates.length - 1])}`
    : dates.map(shortDateOf).join("・");
};

/** 段の見出し。「1/12（火） 1日券」と、段が複数あるときの小計 */
const SectionHeading = ({
  title,
  detail,
  amount,
}: {
  title: string;
  detail?: ReactNode;
  amount?: string | null;
}) => (
  <div className="flex items-baseline justify-between gap-3">
    <p className="min-w-0 text-sm text-gray-900">
      <span className="font-bold">{title}</span>
      {detail && (
        <span className="ml-2 inline-block whitespace-nowrap">{detail}</span>
      )}
    </p>
    {amount && (
      <p className="flex-shrink-0 text-base font-bold font-mono text-gray-900">
        {amount}
      </p>
    )}
  </div>
);

/**
 * 1つの買い方の内訳。日ごとの券・複数日券・セット券・レンタルを段に分けて並べる。
 *
 * ★**同じ金額を何度も並べない。** 段の小計は、段が2つ以上あって、その段に
 * 行が複数ある（または追加費用がある）ときだけ出す。行が1つなら行の金額で足りる
 */
const TierBody = ({ tier }: { tier: TicketPlanTier }) => {
  const { view } = tier;
  const { plan } = view;
  const tierUrl = tier.link?.kind === "purchase" ? tier.link.url : null;
  const multiDay = plan.multiDay;
  const sectionCount =
    view.dayGroups.length +
    (multiDay ? 1 : 0) +
    (view.bundleApplied ? 1 : 0) +
    (view.rental && view.rentalShown ? 1 : 0);
  const several = sectionCount > 1;

  // 日の段と複数日券の段を日付順に並べる（複数日券が途中の日だけをまかなうこともある）
  const dated: Array<{ date: string; key: string; node: ReactNode }> = [
    ...view.dayGroups.map(({ indices }) => {
      const day = plan.days[indices[0]];
      const dayCount = indices.length;
      const { lines, fees } = day.result;
      const single = hasSingleTicket(lines);
      return {
        date: day.plan.date,
        key: day.plan.id,
        node: (
          <>
            <SectionHeading
              title={dateLabelOf(indices.map(i => plan.days[i].plan.date))}
              detail={single && <TicketName line={lines[0]} badge={false} />}
              amount={
                several && (lines.length > 1 || fees.length > 0)
                  ? day.result.payableTotal == null
                    ? "未確定"
                    : yen(day.result.payableTotal * dayCount)
                  : null
              }
            />
            {day.result.status === "closed" && (
              <p className="mt-1 text-sm text-orange-900">
                この日は営業していません
                {day.result.notes[0] ? `（${day.result.notes[0]}）` : ""}
              </p>
            )}
            {day.result.status === "outside_season" && (
              <p className="mt-1 text-sm text-orange-900">
                {day.result.notes[0]}
              </p>
            )}
            {lines.length > 0 && (
              <TicketLines
                lines={lines}
                multiplier={dayCount}
                multiplierUnit="日"
                showTicket={!single}
                references={plan.references}
                tierUrl={tierUrl}
              />
            )}
            <FeeLines
              fees={fees}
              multiplier={dayCount}
              references={plan.references}
            />
            <DurationAlternatives options={day.options} dayCount={dayCount} />
            <ConditionalOffers
              className="mt-2"
              dayCount={dayCount}
              offers={day.result.conditionalOffers}
              sourcesOf={offer => offer.sourceNumbers}
              references={plan.references}
            />
          </>
        ),
      };
    }),
    ...(multiDay
      ? [
          {
            date: multiDay.dates[0],
            key: "multi-day",
            node: (
              <>
                <SectionHeading
                  title={dateLabelOf(multiDay.dates)}
                  detail={
                    !multiDay.ticketSet &&
                    hasSingleTicket(multiDay.lines) && (
                      <TicketName line={multiDay.lines[0]} badge={false} />
                    )
                  }
                  amount={
                    several &&
                    (multiDay.ticketSet != null ||
                      multiDay.lines.length > 1 ||
                      multiDay.addOns.length > 0)
                      ? yen(multiDay.ticketTotal)
                      : null
                  }
                />
                {multiDay.ticketSet ? (
                  <p className="mt-1 text-sm text-gray-900">
                    {multiDay.productName} × {multiDay.ticketCount}
                    セット
                    <span className="ml-2 whitespace-nowrap text-xs text-gray-600 md:text-sm">
                      {multiDay.ticketSet.ticketsPerSet * multiDay.ticketCount}
                      枚（のべ{multiDay.ticketSet.coveredPersonDays}
                      人日分）
                    </span>
                    <SourceLinks
                      numbers={multiDay.sourceNumbers}
                      references={plan.references}
                      compact
                      className="ml-1.5 align-middle"
                    />
                  </p>
                ) : (
                  <TicketLines
                    lines={multiDay.lines}
                    multiplier={multiDay.ticketCount}
                    multiplierUnit="枚"
                    showTicket={!hasSingleTicket(multiDay.lines)}
                    references={plan.references}
                    tierUrl={tierUrl}
                  />
                )}
                {/* 足りない時間を足す追加券（トップアップ5時間など） */}
                {multiDay.addOns.map(addOn => (
                  <TicketLines
                    key={`${addOn.productId}:${addOn.date}`}
                    lines={addOn.lines}
                    multiplier={addOn.ticketCount}
                    multiplierUnit="枚"
                    showTicket
                    references={plan.references}
                    tierUrl={tierUrl}
                  />
                ))}
                {(multiDay.notes ?? []).map(note => (
                  <p
                    key={note}
                    className="mt-1 text-xs text-orange-900 md:text-sm"
                  >
                    {note}
                  </p>
                ))}
                {(plan.multiDayAlternatives ?? []).map(alternative => (
                  <p
                    key={alternative.productId}
                    className="mt-1 flex items-baseline justify-between gap-3 text-xs text-gray-700 md:text-sm"
                  >
                    <span className="min-w-0">
                      同じ金額で: {alternative.productName}
                      {(alternative.notes ?? []).length > 0 &&
                        `（${(alternative.notes ?? []).join("・")}）`}
                    </span>
                    <span className="flex-shrink-0 font-mono">
                      {yen(alternative.ticketTotal)}
                    </span>
                  </p>
                ))}
                <ConditionalOffers
                  className="mt-2"
                  offers={multiDay.conditionalOffers}
                  sourcesOf={offer => offer.sourceNumbers}
                  references={plan.references}
                />
              </>
            ),
          },
        ]
      : []),
  ].sort((left, right) => left.date.localeCompare(right.date));

  const sections: Array<{ key: string; node: ReactNode }> = [
    ...dated,
    ...(view.bundleApplied
      ? [
          {
            key: "bundle",
            node: (
              <BundleSummary bundle={view.bundleApplied} showTotal={several} />
            ),
          },
        ]
      : []),
    ...(view.rental && view.rentalShown
      ? [
          {
            key: "rental",
            node: (
              <RentalSummary
                rental={view.rental}
                dayCount={view.tripDayCount}
                link={tier.rentalLink}
                showTotal={several}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col divide-y divide-gray-100">
      {tier.salesStarts.length > 0 && (
        <p className="pb-2 text-xs text-gray-600">
          {tier.salesStarts.join("・")}
        </p>
      )}
      {sections.map(section => (
        <div key={section.key} className="py-2 first:pt-0 last:pb-0">
          {section.node}
        </div>
      ))}
      {/* セット券の料金が年齢で分かれ、年齢が空欄なので比べられなかった */}
      {view.bundle && view.bundle.ageNeededGroupIds.length > 0 && (
        <p className="py-2 text-xs font-semibold text-red-600 last:pb-0">
          年齢を入れると、セット券の料金とも比べます
        </p>
      )}
      {/* 会員・クーポンなど条件を満たせば使えるセット券。合計には含めない */}
      {view.bundle && view.bundle.conditionalOffers.length > 0 && (
        <div className="py-2 last:pb-0">
          <ConditionalOffers
            offers={view.bundle.conditionalOffers}
            sourcesOf={offer => offer.sourceNumbers}
            references={view.references}
          />
        </div>
      )}
    </div>
  );
};

/** 段階の金額。料金に含められなかったレンタルは「＋ゴーグル」と添える */
const TierAmount = ({
  total,
  labels,
}: {
  total: number | null;
  labels: string[];
}) =>
  total == null ? (
    "未確定"
  ) : (
    <>
      {yen(total)}
      {labels.map(label => (
        <span key={label} className="ml-1 text-xs font-bold text-gray-700">
          ＋{label}
        </span>
      ))}
    </>
  );

/**
 * 買い方ごとの合計と内訳を出す。
 *
 * ★**買い方は「早割 → Web → 通常」の段階に分け、安い順に並べる。** 最初は一番安い段階だけを
 * 開き、ほかは見出し（「通常［出典］ ¥14,700」）だけを出す。開くと同じ形の内訳が出る。
 * 見出しのリンクはメインのリンク（Web・早割は購入ページ、通常は公式の料金表）、
 * 行のリンクはその料金の出典。窓口でしか買えない日は段階を分けず、内訳だけを出す。
 *
 * ★**2日以上滑る場合は「連続2日券」「25時間券（＋トップアップ）」と「1日ずつ」を比べて安いほうを出す。**
 * 採用しなかった券や金額は並べない（使わない券の料金は利用者に要らない）。
 */
export const TicketPlanCard = ({ tiers }: { tiers: TicketPlanTier[] }) => {
  // 利用者が開閉した段階。触っていない段階は、一番安いものだけ開く
  const [toggled, setToggled] = useState<
    Partial<Record<PurchaseTierKey, boolean>>
  >({});
  const cheapest = tiers[0];
  const fullPlan = cheapest?.view.fullPlan;

  // 全日が同じ理由で計算できない場合（日付・人数の未入力など）は、
  // 未確定の行を並べるより理由を1つ出したほうが分かりやすい
  const blockingNote =
    fullPlan &&
    fullPlan.days.length > 0 &&
    fullPlan.days.every(
      day =>
        day.result.status === "unavailable" &&
        day.result.notes[0] === fullPlan.days[0].result.notes[0],
    )
      ? fullPlan.days[0].result.notes[0]
      : null;

  if (!cheapest || !fullPlan || fullPlan.days.length === 0 || blockingNote) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-sm font-semibold text-gray-500">
            {blockingNote ?? "日付と1人以上の人数を入力してください。"}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { view } = cheapest;
  // 窓口の料金しか無ければ、買い方の見出しは出さない
  const plain = tiers.length === 1 && cheapest.key === "counter";
  // 料金に含められなかったレンタル（「＋ゴーグル」）。段階の金額の横に添える
  const missingLabels = [
    ...new Set(view.missingRentalLabels.flatMap(label => label.split("＋"))),
  ];

  return (
    <div>
      {view.missingRentalNote && (
        <p className="mb-1 px-1 text-xs text-orange-900">
          {view.missingRentalNote}
        </p>
      )}
      {view.unavailableRentalNote && (
        <p className="mb-1 px-1 text-xs text-orange-900">
          {view.unavailableRentalNote}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {tiers.map((tier, index) => {
          const open = plain || (toggled[tier.key] ?? index === 0);
          const toggle = () =>
            setToggled(current => ({ ...current, [tier.key]: !open }));
          return (
            <div
              key={tier.key}
              className="rounded-lg border border-gray-200 bg-white"
            >
              {plain && (
                <div className="flex items-baseline justify-between gap-2 px-2 py-2">
                  <p className="min-w-0 whitespace-nowrap text-base font-bold text-gray-900">
                    {tier.view.tripDayCount === 1
                      ? "合計"
                      : `${tier.view.tripDayCount}日の合計`}
                    {tier.view.withRental && (
                      <span className="ml-1.5 text-xs font-normal text-gray-600">
                        リフト券＋レンタル
                      </span>
                    )}
                  </p>
                  <p className="min-w-0 whitespace-nowrap text-right text-lg font-bold font-mono text-gray-900">
                    <TierAmount
                      total={tier.view.total}
                      labels={missingLabels}
                    />
                  </p>
                </div>
              )}
              {!plain && (
                <div className="flex items-center gap-2 px-2 py-2">
                  <button
                    type="button"
                    aria-expanded={open}
                    data-purchase-tier={tier.key}
                    onClick={toggle}
                    className="flex min-w-0 items-center gap-1 text-left"
                  >
                    <ChevronRight
                      className={cn(
                        "size-4 shrink-0 text-gray-500 transition-transform",
                        open && "rotate-90",
                      )}
                      aria-hidden="true"
                    />
                    <span className="whitespace-nowrap text-base font-bold text-gray-900">
                      {tier.label}
                    </span>
                    {tier.deadline && (
                      <span className="whitespace-nowrap text-xs text-gray-600">
                        （{monthDayOf(tier.deadline)}まで）
                      </span>
                    )}
                  </button>
                  {tier.link && (
                    <LinkChip
                      href={tier.link.url}
                      tone={tier.link.kind}
                      title={tier.link.url}
                      className="shrink-0"
                    >
                      {tier.link.kind === "purchase" ? "購入" : "出典"}
                    </LinkChip>
                  )}
                  {/* 金額を押しても開閉できる。キーボードとスクリーンリーダーは左の見出しを使う */}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    onClick={toggle}
                    className="min-w-0 flex-1 whitespace-nowrap text-right text-lg font-bold font-mono text-gray-900"
                  >
                    <TierAmount
                      total={tier.view.total}
                      labels={missingLabels}
                    />
                  </button>
                </div>
              )}
              {open && (
                <div className="border-t border-gray-100 px-2 pt-2 pb-2">
                  <TierBody tier={tier} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
