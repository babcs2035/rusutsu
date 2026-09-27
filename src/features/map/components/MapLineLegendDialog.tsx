"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Info, X } from "lucide-react";
import type React from "react";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function MapLineLegendDialog({
  showUngroomed,
}: {
  showUngroomed: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger
        aria-label="コースとリフトの線の見方"
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        <Info className="size-4" aria-hidden="true" />
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="z-[900]" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-[901] max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-700 shadow-xl outline-none">
          <DialogTitle className="pr-7 text-base font-semibold text-slate-900">
            コースとリフトの線の見方
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-relaxed">
            線の色・点線・動きで、コースの特徴やリフトの状態を表しています。
          </DialogDescription>
          <section className="mt-5 text-sm leading-relaxed">
            <h3 className="font-semibold text-slate-900">コースの線</h3>
            <p className="mt-2">
              「非圧雪コースを点線表示」がオンのとき、圧雪コースは実線、一部圧雪・非圧雪コースは点線になります。
            </p>
            <dl className="my-3 grid grid-cols-[3rem_1fr] items-center gap-x-3 gap-y-3 rounded-lg bg-slate-50 p-3">
              <dt>
                <span
                  aria-hidden="true"
                  className="block h-[3px] w-full bg-slate-600"
                />
                <span className="sr-only">実線</span>
              </dt>
              <dd>圧雪</dd>
              <dt>
                <span
                  aria-hidden="true"
                  className="block h-[3px] w-full bg-[repeating-linear-gradient(90deg,#475569_0_6px,transparent_6px_10px)]"
                />
                <span className="sr-only">点線</span>
              </dt>
              <dd>一部圧雪・非圧雪</dd>
            </dl>
            <p>圧雪情報がないコースも実線で表示します。</p>
            <p className="mt-2">
              現在の点線表示：{showUngroomed ? "オン" : "オフ"}。
              オフにすると、圧雪状態にかかわらずすべて実線になります。「設定」から切り替えられます。
            </p>
            <p className="mt-2">
              線の色は「難易度」または「斜度」の凡例に対応します。点線は圧雪状態を示し、滑走できるかどうかを示すものではありません。
            </p>
          </section>
          <section className="mt-5 text-sm leading-relaxed">
            <h3 className="font-semibold text-slate-900">リフトの線</h3>
            <dl className="my-3 space-y-3 rounded-lg bg-slate-50 p-3">
              {LIFT_STATUS_LEGEND.map(item => (
                <div key={item.label}>
                  <dt className="flex items-center gap-2 font-semibold">
                    <span className="flex w-16">
                      <LiftFlowSample {...item} />
                    </span>
                    {item.label}
                  </dt>
                  <dd className="mt-1">{item.description}</dd>
                </div>
              ))}
            </dl>
            <p>
              流れる破線はリフトの進行方向を表します。待機・運休・不明でも流れるため、運行状況は色と点滅で確認してください。
            </p>
            <p className="mt-2">
              高速リフト・ゴンドラなどは速く、低速リフトはゆっくり流れます。動きは種類に応じた目安で、実際の運転速度を表すものではありません。
            </p>
          </section>
          <DialogClose
            aria-label="説明を閉じる"
            className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogClose>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

/**
 * リフトの凡例。地図と同じ「地の色＋流れる色」の二色で見せる。
 * 実際の色は maplibre/sources.ts の LIFT_PALETTE と合わせること。
 */
export const LIFT_STATUS_LEGEND = [
  {
    description: "青と水色の線：運行中です。",
    label: "運行",
    base: "#1E40AF",
    flow: "#00E1FF",
  },
  {
    description: "赤い線が点滅：待機中・一時停止中です。",
    label: "待機",
    base: "#B91C1C",
    flow: "#FECACA",
    blink: true,
  },
  {
    description: "グレーと白の線：運休しています。",
    label: "運休",
    base: "#64748B",
    flow: "#FFFFFF",
  },
  {
    description: "紫の線：営業状況の情報がなく、運行しているか不明です。",
    label: "不明",
    base: "#7C3AED",
    flow: "#EDE9FE",
  },
] as const;

export const LiftFlowSample = ({
  base,
  flow,
  blink = false,
}: {
  base: string;
  flow: string;
  blink?: boolean;
}) => (
  <svg
    aria-hidden="true"
    className="h-2 min-w-0 flex-1 overflow-hidden rounded-full"
  >
    <line
      className={blink ? "finalized-lift-blink" : undefined}
      x1="0"
      y1="4"
      x2="100%"
      y2="4"
      stroke={base}
      strokeWidth="4"
    />
    <line
      className="finalized-lift-flow"
      x1="0"
      y1="4"
      x2="100%"
      y2="4"
      stroke={flow}
      strokeWidth="2.5"
      strokeDasharray="7 7"
      style={{ "--lift-flow-offset": "-14px" } as React.CSSProperties}
    />
  </svg>
);
