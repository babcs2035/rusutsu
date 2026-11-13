"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { PanelHeader } from "@/shared/components/PanelHeader";
import { getAccountDayReports } from "./accountDayReports";
import { CommunitySettingsView } from "./CommunitySettingsView";
import type { OwnPost } from "./contract";
import { DayReportsView } from "./DayReportsView";
import { MyPostsView } from "./MyPostsView";

type DayResult = Awaited<ReturnType<typeof getAccountDayReports>>;

export function AccountCommunityDialog({
  initialView,
  onClose,
  suspended = false,
  onEdit,
  editedPost,
}: {
  initialView: "posts" | "settings";
  onClose: () => void;
  /** 編集中は隠す。中身は残し、戻ったとき一覧とスクロール位置をそのまま出す */
  suspended?: boolean;
  onEdit?: (post: OwnPost) => void;
  editedPost?: { id: string; token: number } | null;
}) {
  const [view, setView] = useState(initialView);
  const [postsOpened, setPostsOpened] = useState(initialView === "posts");
  const [day, setDay] = useState<{
    authorId: string;
    observedOn: string;
  } | null>(null);
  const [result, setResult] = useState<DayResult | null>(null);
  const request = useRef(0);
  // 隠すと一覧のスクロール位置が失われるので、編集へ移る前に覚えて戻す
  const postsRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef<number | null>(null);
  const scroller = useCallback(
    () =>
      postsRef.current?.querySelector<HTMLElement>(".overflow-y-auto") ?? null,
    [],
  );
  useLayoutEffect(() => {
    if (suspended || savedScroll.current === null) return;
    const top = savedScroll.current;
    savedScroll.current = null;
    // 表示が戻るのを待ってから戻す
    requestAnimationFrame(() => {
      const element = scroller();
      if (element) element.scrollTop = top;
    });
  }, [suspended, scroller]);
  const closeDay = () => {
    ++request.current;
    setDay(null);
    setResult(null);
  };
  const loadDay = async (authorId: string, observedOn: string) => {
    const current = ++request.current;
    setDay({ authorId, observedOn });
    setResult(null);
    const loaded = await getAccountDayReports(authorId, observedOn);
    if (request.current === current) setResult(loaded);
  };
  return (
    <Dialog
      open={!suspended}
      onOpenChange={open => {
        if (open) return;
        if (day) closeDay();
        else onClose();
      }}
    >
      <DialogContent
        keepMounted
        showCloseButton={false}
        overlayClassName="z-[999]"
        className={cn(
          "z-[1000] flex h-dvh max-h-dvh max-w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 text-sm font-sans sm:max-w-full md:h-[min(48rem,calc(100dvh-2rem))] md:max-w-2xl md:rounded-lg md:border md:border-gray-200",
          day && "md:h-[calc(100dvh-2rem)] md:max-w-[calc(100%-2rem)]",
        )}
      >
        <DialogTitle className="sr-only">
          {day ? "現地レポート" : view === "posts" ? "自分の投稿" : "設定"}
        </DialogTitle>
        {/* 地図から戻るときも一覧・スクロール位置を保つ。 */}
        {postsOpened && (
          <div
            ref={postsRef}
            className={cn(
              "h-full min-h-0",
              (day || view !== "posts") && "hidden",
            )}
          >
            <MyPostsView
              onClose={onClose}
              onEdit={
                onEdit &&
                (post => {
                  savedScroll.current = scroller()?.scrollTop ?? null;
                  onEdit(post);
                })
              }
              editedPost={editedPost}
              onSettings={() => setView("settings")}
              onViewDay={(authorId, observedOn) =>
                void loadDay(authorId, observedOn)
              }
            />
          </div>
        )}
        {!day && view === "settings" && (
          <CommunitySettingsView
            onClose={onClose}
            onPosts={() => {
              setPostsOpened(true);
              setView("posts");
            }}
          />
        )}
        {day && (
          <div className="flex h-full min-h-0 flex-col">
            {result?.ok ? (
              <DayReportsView
                data={result.data}
                maps={result.maps}
                onClose={closeDay}
              />
            ) : (
              <>
                <PanelHeader title="現地レポート" onClose={closeDay} />
                {result ? (
                  <div className="space-y-3 p-4">
                    <p role="alert" className="text-sm text-red-700">
                      {result.error}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => void loadDay(day.authorId, day.observedOn)}
                    >
                      再試行
                    </Button>
                  </div>
                ) : (
                  <LoadingSpinner className="flex-1" text="地図を読み込み中…" />
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
