"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ChevronRight, ExternalLink, X, Zap } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import {
  EV_CHARGER_KIND_LABEL,
  type EvCharger,
  formatEvChargerOutput,
} from "@/shared/utils/evChargers";
import {
  type YukimajiCoupon,
  type YukimajiDocument,
  yukimajiDiscountText,
  yukimajiPeriodText,
} from "@/shared/utils/yukimajiSummary";

export type YukiMagiTable = {
  name: string;
  url: string | null;
  tag: string | null;
  benefit: string | null;
  period: string | null;
  exclusionDate: string | null;
} | null;

export type ResortFeatureData = {
  yukiMagi: YukiMagiTable;
  /** 最新シーズンのリフト券データの yukimaji 欄 */
  yukimaji: YukimajiDocument | undefined;
  evChargers: EvCharger[] | null;
};

const CHIP_TONE = {
  pink: "border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100 active:bg-pink-200",
  green:
    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200",
} as const;

/**
 * 「雪マジ」「EV充電」チップ（詳細ヘッダーと、比較の概要）。押すとモーダルで中身を出す。
 * PCの詳細では詳細パネルの範囲の中だけに出し、地図の上には重ねない。
 */
export function ResortFeatureChips({
  hasYukiMagi,
  hasEvCharger,
  data,
  size = "md",
}: {
  hasYukiMagi: boolean;
  hasEvCharger: boolean;
  /** 詳細の読み込み前は null。チップは同じ見た目で出し、押せないようにする */
  data: ResortFeatureData | null;
  size?: "sm" | "md";
}) {
  const showEv = hasEvCharger || Boolean(data?.evChargers?.length);
  if (!hasYukiMagi && !showEv) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {hasYukiMagi && (
        <FeatureDialog
          label="雪マジ"
          tone="pink"
          size={size}
          disabled={!data}
          title={`雪マジ${data?.yukiMagi?.tag ? `・${data.yukiMagi.tag}` : ""}`}
        >
          {data && <YukiMagiBody data={data} />}
        </FeatureDialog>
      )}
      {showEv && (
        <FeatureDialog
          label="EV充電"
          icon={<Zap className="size-2.5" aria-hidden="true" />}
          tone="green"
          size={size}
          disabled={!data}
          title="EV充電"
        >
          {data && <EvChargerBody chargers={data.evChargers ?? []} />}
        </FeatureDialog>
      )}
    </span>
  );
}

function FeatureDialog({
  label,
  icon,
  tone,
  size,
  disabled,
  title,
  children,
}: {
  label: string;
  icon?: ReactNode;
  tone: keyof typeof CHIP_TONE;
  size: "sm" | "md";
  disabled: boolean;
  title: string;
  children: ReactNode;
}) {
  // PCでは詳細パネルの範囲を開いたときに測り、その中だけに出す（地図の上には重ねない）
  const [area, setArea] = useState<DOMRect | null>(null);
  const areaStyle = area
    ? {
        left: area.left,
        top: area.top,
        width: area.width,
        height: area.height,
      }
    : undefined;
  return (
    <Dialog
      onOpenChange={(open, details) => {
        if (!open) return;
        const trigger =
          details.event?.target instanceof Element
            ? details.event.target
            : null;
        const panel = trigger?.closest<HTMLElement>(
          '[data-ski-resort-detail-panel="true"]',
        );
        setArea(
          panel && window.matchMedia("(min-width: 768px)").matches
            ? panel.getBoundingClientRect()
            : null,
        );
      }}
    >
      <DialogTrigger
        disabled={disabled}
        aria-label={`${label}の詳細`}
        className={cn(
          "inline-flex shrink-0 items-center gap-0.5 rounded-full border font-semibold whitespace-nowrap outline-none transition-colors disabled:pointer-events-none",
          size === "sm"
            ? "h-5 pl-1.5 pr-0.5 text-[0.625rem]"
            : "h-5 pl-2 pr-1 text-[0.6875rem]",
          CHIP_TONE[tone],
        )}
      >
        {icon}
        {label}
        <ChevronRight className="size-3" aria-hidden="true" />
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="z-[900]" style={areaStyle} />
        <div
          className={cn(
            "pointer-events-none fixed z-[901] flex items-center justify-center p-4",
            !area && "inset-0",
          )}
          style={areaStyle}
        >
          <DialogPrimitive.Popup className="pointer-events-auto relative max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-xl outline-none">
            <DialogTitle className="pr-8 text-base font-semibold text-slate-900">
              {title}
            </DialogTitle>
            <DialogClose
              aria-label="閉じる"
              className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogClose>
            <div className="mt-3">{children}</div>
          </DialogPrimitive.Popup>
        </div>
      </DialogPortal>
    </Dialog>
  );
}

const DetailRows = ({
  rows,
}: {
  rows: Array<{ label: string; value: string | null | undefined }>;
}) => {
  const visible = rows.filter(row => row.value);
  if (!visible.length) return null;
  return (
    <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm">
      {visible.map(row => (
        <div key={row.label} className="contents">
          <dt className="text-xs font-semibold leading-5 text-slate-500">
            {row.label}
          </dt>
          <dd className="min-w-0 break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
};

const CouponSection = ({
  label,
  coupon,
  discount = false,
}: {
  label: string;
  coupon: YukimajiCoupon | undefined;
  discount?: boolean;
}) => {
  if (!coupon) return null;
  return (
    <section className="rounded-lg bg-pink-50/60 p-3">
      <h3 className="mb-1.5 text-sm font-semibold text-pink-800">{label}</h3>
      <DetailRows
        rows={[
          ...(discount
            ? [{ label: "割引後", value: yukimajiDiscountText(coupon) }]
            : []),
          {
            label: "期間",
            value: coupon.period_text_ja ?? yukimajiPeriodText(coupon),
          },
          { label: "曜日", value: coupon.day_rule_text_ja },
          { label: "回数", value: coupon.uses_text_ja },
        ]}
      />
    </section>
  );
};

function YukiMagiBody({ data }: { data: ResortFeatureData }) {
  const document =
    data.yukimaji?.status === "listed" ? data.yukimaji : undefined;
  const table = data.yukiMagi;
  const url = document?.majibu_url ?? table?.url;
  return (
    <div className="space-y-2.5">
      {document?.free_coupon && (
        <CouponSection
          label="無料クーポン"
          coupon={document.free_coupon ?? undefined}
        />
      )}
      {document?.discount_coupon && (
        <CouponSection
          label="割引クーポン"
          coupon={document.discount_coupon ?? undefined}
          discount
        />
      )}
      <DetailRows
        rows={[
          {
            label: "特典",
            value: document?.benefit_text_ja ?? table?.benefit,
          },
          ...(document
            ? []
            : [{ label: "適用期間", value: table?.period ?? null }]),
          { label: "除外日", value: table?.exclusionDate },
        ]}
      />
      {url && (
        <ExternalLinkComponent
          href={url}
          className="inline-flex items-center gap-1 rounded-full border border-pink-200 px-3 py-1 text-sm font-medium text-pink-700 hover:bg-pink-50"
        >
          マジ部で見る
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </ExternalLinkComponent>
      )}
    </div>
  );
}

function EvChargerBody({ chargers }: { chargers: EvCharger[] }) {
  return (
    <ul className="divide-y divide-slate-100 border-y border-slate-100">
      {chargers.map(charger => (
        <li
          key={`${charger.kind}-${charger.kw}-${charger.operator}-${charger.note}-${charger.url}`}
          className="flex min-w-0 items-start gap-2 py-2"
        >
          <span
            className={cn(
              "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[0.6875rem] font-semibold",
              charger.kind === "quick"
                ? "bg-emerald-600 text-white"
                : "bg-emerald-50 text-emerald-700",
            )}
          >
            {EV_CHARGER_KIND_LABEL[charger.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tabular-nums text-slate-900">
              {formatEvChargerOutput(charger, false)}
              {charger.operator && (
                <span className="ml-1.5 font-normal text-slate-700">
                  {charger.operator}
                </span>
              )}
            </p>
            {charger.note && (
              <p className="text-xs text-slate-500">{charger.note}</p>
            )}
          </div>
          {charger.url && (
            <ExternalLinkComponent
              href={charger.url}
              aria-label="充電器のページを開く"
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </ExternalLinkComponent>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 詳細データから、チップのモーダルに出す中身を取り出す */
export const resortFeatureDataOf = (resort: {
  yukiMagi?: YukiMagiTable | undefined;
  liftTickets?: Array<{ yukimaji?: YukimajiDocument }>;
  evChargers?: EvCharger[] | null;
}): ResortFeatureData => ({
  yukiMagi: resort.yukiMagi ?? null,
  yukimaji: resort.liftTickets?.[0]?.yukimaji,
  evChargers: resort.evChargers ?? null,
});
