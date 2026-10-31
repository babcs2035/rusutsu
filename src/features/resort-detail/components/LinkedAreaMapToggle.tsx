"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import type {
  getSimultaneousView,
  SimultaneousOption,
} from "@/actions/skiResorts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { getResortLabelName } from "@/lib/resortAliases";
import { cn } from "@/lib/utils";
import type { Resort } from "../types";

/**
 * 「〇〇も同時に表示」でどれを選んでいるか。選択肢ごとのキーで覚えるので、
 * 組の別のスキー場へ移っても同じ表示を続ける。
 */
const shownKeys = new Set<string>();
/** 同時表示の組の地図・コンディション。チェックしたときに読み、以後は使い回す */
type GroupView = NonNullable<Awaited<ReturnType<typeof getSimultaneousView>>>;
const groupViews = new Map<
  string,
  { status: "loading" | "ready" | "error"; data?: GroupView }
>();
const listeners = new Set<() => void>();
let version = 0;

const notify = () => {
  version++;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const useStoreVersion = () =>
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );

type Option = SimultaneousOption;

/** 1つのスキー場では1つの組だけを選べる。選び直すと前の組は外れる */
const setOptionShown = (options: Option[], key: string, shown: boolean) => {
  for (const option of options) shownKeys.delete(option.key);
  if (shown) shownKeys.add(key);
  notify();
};

const loadGroupView = async (resortId: string, groupId: string) => {
  const cacheKey = `${resortId}:${groupId}`;
  if (groupViews.has(cacheKey)) return;
  groupViews.set(cacheKey, { status: "loading" });
  notify();
  try {
    // Server Action はチェックしたときに読み込む（テストなどサーバー外でも描画できる）
    const { getSimultaneousView } = await import("@/actions/skiResorts");
    const data = await getSimultaneousView(resortId, groupId);
    groupViews.set(
      cacheKey,
      data ? { status: "ready", data } : { status: "error" },
    );
  } catch {
    // 失敗したら次にチェックしたときに読み直す
    groupViews.delete(cacheKey);
  }
  notify();
};

type MapResort = Pick<
  Resort,
  "id" | "finalizedMapData" | "linkedAreaMapData" | "simultaneousOptions"
>;

/**
 * 選んでいる同時表示と、そのときの地図・相手のコンディション。
 * 何も選んでいなければ自分の地図だけ。組の地図を読んでいる間も自分の地図を出す。
 */
export function useSimultaneousView(resort: MapResort | null) {
  useStoreVersion();
  const options = resort?.simultaneousOptions ?? [];
  const active = options.find(option => shownKeys.has(option.key)) ?? null;
  const resortId = resort?.id ?? null;
  const groupId = active?.groupId ?? null;
  useEffect(() => {
    if (resortId && groupId) void loadGroupView(resortId, groupId);
  }, [resortId, groupId]);
  const ownMapData = resort?.finalizedMapData ?? null;
  if (!resort || !active)
    return {
      active: null,
      mapData: ownMapData,
      conditions: [],
      loading: false,
    };
  if (!active.groupId)
    return {
      active,
      mapData: resort.linkedAreaMapData ?? ownMapData,
      conditions: [],
      loading: false,
    };
  const view = groupViews.get(`${resort.id}:${active.groupId}`);
  return {
    active,
    mapData: view?.data?.mapData ?? ownMapData,
    conditions: view?.data?.conditions ?? [],
    loading: !view || view.status === "loading",
  };
}

/** 地図・営業状況に使うデータ。同時表示中は相手のスキー場も含めた地図にする */
export function useDisplayedResortMapData(resort: MapResort | null) {
  return useSimultaneousView(resort).mapData;
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
  // 営業状況の欄。「コース」「リフト」の見出しと同じ文字の大きさ
  section: "h-8 gap-1.5 px-2 text-base font-semibold text-slate-900",
} as const;

type ToggleProps = {
  resort: Resort;
  onSelectResort?: (id: string) => void;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
};

type Partner = { id: string; label: string };

/**
 * 「〇〇も同時に表示」「ニセコ全山で表示」。チェックで相手のスキー場も含めた
 * 地図・営業状況に切り替え、スキー場名を押すと、確認してからその詳細へ移る。
 * 選択肢は連携エリアと、管理画面で作った同時表示の組。
 */
export function LinkedAreaMapToggle(props: ToggleProps) {
  if (!props.resort.simultaneousOptions?.length) return null;
  return <ToggleList {...props} />;
}

function ToggleList({
  resort,
  onSelectResort,
  size = "compact",
  className,
}: ToggleProps) {
  const router = useRouter();
  const options = resort.simultaneousOptions ?? [];
  const { active, loading } = useSimultaneousView(resort);
  const [target, setTarget] = useState<Partner | null>(null);

  return (
    <>
      <div className="flex min-w-0 flex-wrap gap-px">
        {options.map(option => {
          const shown = active?.key === option.key;
          const partners = option.partners.map(partner => ({
            id: partner.id,
            label: getResortLabelName(
              partner.id,
              partner.nameJa,
              partner.shortName,
            ),
          }));
          const text = option.label
            ? `${option.label}で表示`
            : `${partners.map(partner => partner.label).join("・")}も同時に表示`;
          const toggle = () => setOptionShown(options, option.key, !shown);
          return (
            <div
              key={option.key}
              aria-busy={shown && loading}
              className={cn(
                "pointer-events-auto flex w-max max-w-full shrink-0 items-center rounded-md border border-slate-300 bg-white whitespace-nowrap text-slate-700 shadow-sm",
                SIZE_CLASS[size],
                className,
              )}
            >
              <button
                type="button"
                aria-pressed={shown}
                aria-label={text}
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
              {option.label ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={toggle}
                  className="flex h-full min-w-0 items-center truncate"
                >
                  {text}
                </button>
              ) : (
                <>
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
                </>
              )}
              {shown && loading && (
                <Spinner className="size-3.5 shrink-0 text-slate-400" />
              )}
            </div>
          );
        })}
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
