"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDayReports, getPostDetail } from "./actions";
import { dayReportsPath, dayShareText, dayShareTitle } from "./dayShare";
import { ShareDayButton } from "./ShareDayButton";

const shareClass =
  "h-8 w-full gap-1.5 rounded-lg border-border px-2.5 text-sm font-medium text-foreground";

/**
 * 投稿した直後に、その日の投稿をまとめたページを見る・共有するための2つのボタン。
 * 投稿者と滑走日は保存された投稿から読む。読めるまでは同じ大きさの押せないボタンを置き、
 * 完了画面の高さを変えない。
 */
export function DayShareActions({ postId }: { postId: string }) {
  const [day, setDay] = useState<{
    authorId: string;
    observedOn: string;
    text: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    setDay(null);
    void (async () => {
      const detail = await getPostDetail(postId);
      if (!active || !detail.ok) return;
      const { post } = detail.data;
      const next = {
        authorId: post.author.id,
        observedOn: post.observedOn,
        text: dayShareTitle([post], post.observedOn),
      };
      setDay(next);
      // 共有の文に入れる件数は、その日の投稿を読んでから入れる
      const reports = await getDayReports(next.authorId, next.observedOn);
      if (active && reports.ok && reports.data.posts.length)
        setDay({
          ...next,
          text: dayShareText(reports.data.posts, next.observedOn),
        });
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [postId]);
  return (
    <div className="grid grid-cols-2 gap-2">
      {day ? (
        <>
          <Link
            href={dayReportsPath(day.authorId, day.observedOn)}
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            この日の投稿を見る
          </Link>
          <ShareDayButton
            authorId={day.authorId}
            observedOn={day.observedOn}
            text={day.text}
            label="この日の投稿を共有"
            className={shareClass}
          />
        </>
      ) : (
        <>
          <Button variant="outline" className="w-full" disabled>
            この日の投稿を見る
          </Button>
          <Button variant="outline" className="w-full" disabled>
            この日の投稿を共有
          </Button>
        </>
      )}
    </div>
  );
}
