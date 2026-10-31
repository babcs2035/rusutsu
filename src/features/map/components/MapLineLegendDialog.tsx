"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Info, X } from "lucide-react";
import type React from "react";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { COURSE_DIFFICULTY_META } from "@/lib/finalizedResortGeojsonShared";
import {
  FINALIZED_CASING_EXTRA,
  FINALIZED_LINE_WIDTH_STOPS,
  FINALIZED_NIGHT_EXTRA,
  LIFT_FLOW_WIDTH_FACTOR,
  UNGROOMED_MASK_DASH_AT_ZOOM_16,
  VARIABLE_MASK_DASH_AT_ZOOM_16,
} from "../maplibre/finalizedLayers";
import { LIFT_PALETTE } from "../utils/liftPalette";

const SAMPLE_ZOOM = 16;
const getSampleWidth = (kind: "course" | "lift") =>
  FINALIZED_LINE_WIDTH_STOPS[kind].find(
    ([zoom]) => zoom === SAMPLE_ZOOM,
  )?.[1] ?? 4.4;
const SAMPLE_LINE_WIDTH = getSampleWidth("course");
const SAMPLE_CASING_WIDTH = SAMPLE_LINE_WIDTH + FINALIZED_CASING_EXTRA.pale;
const NIGHT_COURSE_WIDTH = SAMPLE_CASING_WIDTH + FINALIZED_NIGHT_EXTRA.course;
const NIGHT_LIFT_WIDTH =
  getSampleWidth("lift") +
  FINALIZED_CASING_EXTRA.pale +
  FINALIZED_NIGHT_EXTRA.lift;
const SAMPLE_FLOW_WIDTH = getSampleWidth("lift") * LIFT_FLOW_WIDTH_FACTOR;
// MapLibre scales dash lengths by floor(line-width); at zoom 16 the flow line is 3px.
const SAMPLE_FLOW_DASH = 7 * Math.floor(SAMPLE_FLOW_WIDTH);
const SAMPLE_MASK_SCALE = Math.floor(SAMPLE_LINE_WIDTH);

function CourseLineSample({
  grooming = "solid",
  night = false,
}: {
  grooming?: "solid" | "variable" | "ungroomed";
  night?: boolean;
}) {
  const lineY = night ? 7 : 6;
  const viewBoxHeight = night ? 14 : 12;
  const maskDash =
    grooming === "ungroomed"
      ? UNGROOMED_MASK_DASH_AT_ZOOM_16
      : grooming === "variable"
        ? VARIABLE_MASK_DASH_AT_ZOOM_16
        : null;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 56 ${viewBoxHeight}`}
      preserveAspectRatio="none"
      className={night ? "h-[14px] w-14 shrink-0" : "h-3 w-14 shrink-0"}
    >
      {night && (
        <path
          d={`M6 ${lineY}H50`}
          fill="none"
          stroke="#FACC15"
          strokeWidth={NIGHT_COURSE_WIDTH}
          strokeLinecap="round"
        />
      )}
      <path
        d={`M6 ${lineY}H50`}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={SAMPLE_CASING_WIDTH}
        strokeLinecap="round"
      />
      <path
        d={`M6 ${lineY}H50`}
        fill="none"
        stroke={COURSE_DIFFICULTY_META.beginner.color}
        strokeWidth={SAMPLE_LINE_WIDTH}
        strokeLinecap="round"
      />
      {maskDash && (
        <path
          d={`M6 ${lineY}H50`}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={SAMPLE_LINE_WIDTH}
          strokeDasharray={`0 ${maskDash[1] * SAMPLE_MASK_SCALE} ${maskDash[2] * SAMPLE_MASK_SCALE} 0`}
          strokeLinecap="butt"
        />
      )}
    </svg>
  );
}

export function MapLineLegendDialog() {
  return (
    <Dialog>
      <DialogTrigger
        aria-label="地図の凡例"
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        <Info className="size-4" aria-hidden="true" />
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="z-[900]" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-[901] max-h-[85dvh] w-[min(20rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-xl outline-none">
          <DialogTitle className="sr-only">地図の凡例</DialogTitle>
          <section>
            <h3 className="text-sm font-semibold text-slate-900 md:text-base">
              ナイター
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-x-4 text-sm md:text-base">
              <div>
                <div className="flex items-center gap-2">
                  <CourseLineSample night />
                  <span className="whitespace-nowrap">コース</span>
                </div>
                <p className="mt-1 whitespace-nowrap text-xs text-slate-500 md:text-sm">
                  難易度モードのみ
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 flex w-14 shrink-0">
                  <LiftFlowSample
                    base={LIFT_STATUS_LEGEND[0].base}
                    flow={LIFT_STATUS_LEGEND[0].flow}
                    night
                    width={getSampleWidth("lift")}
                  />
                </span>
                <span className="whitespace-nowrap">リフト</span>
              </div>
            </div>
          </section>
          <section className="mt-4">
            <h3 className="text-sm font-semibold text-slate-900 md:text-base">
              コース
            </h3>
            <div className="mt-2 grid grid-cols-[3.5rem_1fr] items-center gap-x-3 gap-y-2 text-sm md:text-base">
              <CourseLineSample />
              <span className="whitespace-nowrap">圧雪</span>
              <CourseLineSample grooming="variable" />
              <span className="whitespace-nowrap">日によって圧雪</span>
              <CourseLineSample grooming="ungroomed" />
              <span className="whitespace-nowrap">非圧雪</span>
            </div>
          </section>
          <section className="mt-4">
            <h3 className="text-sm font-semibold text-slate-900 md:text-base">
              リフト
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:text-base">
              {LIFT_STATUS_LEGEND.map(item => (
                <div
                  key={item.label}
                  className="flex min-w-0 items-center gap-2"
                >
                  <span className="flex w-14 shrink-0">
                    <LiftFlowSample {...item} />
                  </span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </section>
          <DialogClose
            aria-label="閉じる"
            className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogClose>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

export const LIFT_STATUS_LEGEND = [
  {
    label: "運行",
    status: "open",
    base: LIFT_PALETTE.open.color,
    flow: LIFT_PALETTE.open.flowColor,
  },
  {
    label: "待機",
    status: "limited",
    base: LIFT_PALETTE.limited.color,
    flow: LIFT_PALETTE.limited.flowColor,
    blink: true,
  },
  {
    label: "運休",
    status: "closed",
    base: LIFT_PALETTE.closed.color,
    flow: LIFT_PALETTE.closed.flowColor,
  },
  {
    label: "不明",
    status: "unknown",
    base: LIFT_PALETTE.unknown.color,
    flow: LIFT_PALETTE.unknown.flowColor,
  },
] as const;

export const LiftFlowSample = ({
  base,
  flow,
  blink = false,
  night = false,
  width = getSampleWidth("lift"),
  flowWidth = SAMPLE_FLOW_WIDTH,
}: {
  base: string;
  flow: string;
  blink?: boolean;
  night?: boolean;
  width?: number;
  flowWidth?: number;
}) => (
  <svg
    aria-hidden="true"
    viewBox={`0 0 56 ${night ? 14 : 8}`}
    preserveAspectRatio="none"
    className={night ? "h-[14px] min-w-0 flex-1" : "h-2 min-w-0 flex-1"}
  >
    {night && (
      <path
        d="M6 7H50"
        fill="none"
        stroke="#FACC15"
        strokeWidth={NIGHT_LIFT_WIDTH}
        strokeLinecap="round"
      />
    )}
    {night && (
      <path
        d="M6 7H50"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={getSampleWidth("lift") + FINALIZED_CASING_EXTRA.pale}
        strokeLinecap="round"
      />
    )}
    <path
      className={blink ? "finalized-lift-blink" : undefined}
      d={`M6 ${night ? 7 : 4}H50`}
      fill="none"
      stroke={base}
      strokeWidth={width}
      strokeLinecap="round"
    />
    <path
      className="finalized-lift-flow"
      d={`M6 ${night ? 7 : 4}H50`}
      fill="none"
      stroke={flow}
      strokeWidth={flowWidth}
      strokeDasharray={`${SAMPLE_FLOW_DASH} ${SAMPLE_FLOW_DASH}`}
      strokeLinecap="butt"
      style={
        {
          "--lift-flow-offset": `${SAMPLE_FLOW_DASH * -2}px`,
        } as React.CSSProperties
      }
    />
  </svg>
);
