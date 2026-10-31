"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState, useSyncExternalStore } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getResortLabelName } from "@/lib/resortAliases";
import { cn } from "@/lib/utils";
import type { Resort } from "../types";
import { linkedPartnersOf } from "./LinkedArea";

/**
 * 連携エリアの地図を全体で出すかどうか。エリアごとに覚え、
 * つながっているスキー場へ移っても同じ表示を続ける。
 */
const shownAreaIds = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const setAreaShown = (areaId: string, shown: boolean) => {
  if (shown) shownAreaIds.add(areaId);
  else shownAreaIds.delete(areaId);
  version++;
  for (const listener of listeners) listener();
};

const useAreaShown = (areaId: string | null) => {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  return areaId !== null && shownAreaIds.has(areaId);
};

type MapResort = Pick<
  Resort,
  "finalizedMapData" | "linkedAreaMapData" | "linkedArea"
>;

/** 「同時に表示」中か。線を振り分けていない連携エリアでは常に false */
export function useLinkedAreaShown(resort: MapResort | null) {
  return useAreaShown(
    resort?.linkedAreaMapData ? (resort.linkedArea?.id ?? null) : null,
  );
}

/** 地図・営業状況に使うデータ。「同時に表示」中は連携エリア全体の地図にする */
export function useDisplayedResortMapData(resort: MapResort | null) {
  const shown = useLinkedAreaShown(resort);
  if (!resort) return null;
  return shown && resort.linkedAreaMapData
    ? resort.linkedAreaMapData
    : (resort.finalizedMapData ?? null);
}

const SIZE_CLASS = {
  // 詳細の小さい地図・PCの地図の「営業中のみ」（compact）と同じ大きさ
  compact:
    "h-9 gap-1 px-1.5 text-sm font-semibold md:h-[34px] md:gap-1 md:px-1.5 md:text-[13px]",
  // 拡大地図の下部パネルの「営業中のみ」（inline）と同じ大きさ
  inline:
    "h-9 gap-1 px-1 text-sm font-semibold min-[375px]:px-1.5 md:h-8 md:gap-1 md:px-1.5 md:text-[13px]",
  default:
    "h-9 gap-1 px-2 text-[13px] font-bold md:h-10 md:gap-1.5 md:px-3 md:text-base",
} as const;

/**
 * 「〇〇も同時に表示」。チェックで連携エリア全体の地図に切り替え、
 * スキー場名を押すと、確認してからそのスキー場の詳細へ移る。
 */
type ToggleProps = {
  resort: Resort;
  onSelectResort?: (id: string) => void;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
};

export function LinkedAreaMapToggle(props: ToggleProps) {
  const { resort } = props;
  const areaId = resort.linkedAreaMapData
    ? (resort.linkedArea?.id ?? null)
    : null;
  const partners = linkedPartnersOf(resort).map(partner => ({
    id: partner.id,
    label: getResortLabelName(partner.id, partner.nameJa, partner.shortName),
  }));
  if (!areaId || !partners.length) return null;
  return <ToggleButton {...props} areaId={areaId} partners={partners} />;
}

function ToggleButton({
  onSelectResort,
  size = "compact",
  className,
  areaId,
  partners,
}: ToggleProps & {
  areaId: string;
  partners: { id: string; label: string }[];
}) {
  const router = useRouter();
  const shown = useAreaShown(areaId);
  const [target, setTarget] = useState<{ id: string; label: string } | null>(
    null,
  );
  const toggle = () => setAreaShown(areaId, !shown);
  const names = partners.map(partner => partner.label).join("・");

  return (
    <>
      <div
        className={cn(
          "pointer-events-auto flex w-max max-w-full shrink-0 items-center rounded-md border border-slate-300 bg-white whitespace-nowrap text-slate-700 shadow-sm",
          SIZE_CLASS[size],
          className,
        )}
      >
        <button
          type="button"
          aria-pressed={shown}
          aria-label={`${names}も同時に表示`}
          onClick={toggle}
          className="flex h-full items-center focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-4 items-center justify-center rounded-sm border text-xs",
              size === "default" && "md:size-5 md:text-sm",
              size === "inline" && "size-3.5",
              shown
                ? "border-blue-500 bg-blue-500 text-white"
                : "border-slate-300 bg-white",
            )}
          >
            {shown ? "✓" : ""}
          </span>
        </button>
        <span className="min-w-0 truncate">
          {partners.map((partner, index) => (
            <Fragment key={partner.id}>
              {index > 0 && "・"}
              <button
                type="button"
                className="underline decoration-current/40 underline-offset-2 hover:decoration-current focus-visible:outline-2 focus-visible:outline-blue-600"
                onClick={() => setTarget(partner)}
              >
                {partner.label}
              </button>
            </Fragment>
          ))}
        </span>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={toggle}
          className="flex h-full shrink-0 items-center"
        >
          も同時に表示
        </button>
      </div>
      <AlertDialog
        open={target !== null}
        onOpenChange={open => !open && setTarget(null)}
      >
        <AlertDialogContent overlayClassName="z-[900]" className="z-[901]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target?.label}のページに移りますか？
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!target) return;
                if (onSelectResort) onSelectResort(target.id);
                else router.push(`/${encodeURIComponent(target.id)}`);
                setTarget(null);
              }}
            >
              移動する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
