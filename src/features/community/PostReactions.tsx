"use client";

import { Check, CircleSlash, ThumbsUp } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { setPostReaction } from "@/features/community/actions";
import {
  EXISTENCE_REACTIONS,
  type PublicPost,
  REACTION_LABELS,
  type ReactionKind,
} from "@/features/community/contract";
import { withAnonymousCheck } from "@/features/corrections/anonymousCheck";
import { cn } from "@/lib/utils";
import { applyReaction, formatMonthDay, latestExistence } from "./reactions";

// 滑走日時（YYYY-MM-DD HH:mm）と同じ書き方で、投稿した日時を日本時間で出す
const formatPostedAt = (value: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map(part => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

/**
 * 投稿の下に並べるリアクション。ログインなしで押せる。
 * コブ・パークには、あとから行った人の「まだあった／なかった」を1段目に出す。
 */
export function PostReactions({
  post,
  showPostedAt = true,
  trailing,
}: {
  post: PublicPost;
  /** 投稿日時を右端に出す。地図の投稿など、幅の狭い場所では出さない */
  showPostedAt?: boolean;
  /** 同じ行の右端に置く操作（通報など） */
  trailing?: ReactNode;
}) {
  const [reactions, setReactions] = useState(post.reactions);
  const [error, setError] = useState("");
  const sending = useRef(false);
  // 一覧を読み直したら、サーバーの件数に合わせる。自分で押したあとは、遅れて届いた
  // 古い一覧で押した結果を戻さないよう、押した結果のほうを残す。
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setReactions(post.reactions);
  }, [post.reactions]);

  const toggle = async (kind: ReactionKind) => {
    const current = reactions.find(reaction => reaction.kind === kind);
    if (!current || sending.current) return;
    sending.current = true;
    touched.current = true;
    setError("");
    const active = !current.mine;
    // 押した瞬間に見た目を変え、失敗したら戻す
    setReactions(applyReaction(reactions, kind, active));
    try {
      const result = await withAnonymousCheck(proof =>
        setPostReaction(post.id, kind, active, proof),
      );
      if (result.ok) setReactions(result.data.reactions);
      else {
        setReactions(reactions);
        setError(result.error);
      }
    } catch {
      setReactions(reactions);
      setError("リアクションを保存できませんでした。");
    } finally {
      sending.current = false;
    }
  };

  const existence = reactions.filter(reaction =>
    EXISTENCE_REACTIONS.includes(reaction.kind),
  );
  const latest = latestExistence(reactions);
  const iconButton =
    "h-9 gap-1.5 rounded-full px-2.5 text-xs font-normal text-gray-500 tabular-nums @max-[18rem]:gap-1 @max-[18rem]:px-1.5";
  return (
    <div className="@container mt-1">
      {existence.length > 0 && (
        // あとから行った人の確認。日付は幅が足りなければ次の行へ回す
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {existence.map(reaction => {
            const there = reaction.kind === "STILL_THERE";
            return (
              <Button
                key={reaction.kind}
                type="button"
                variant="outline"
                aria-pressed={reaction.mine}
                className={cn(
                  "h-8 gap-1 rounded-full border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 tabular-nums",
                  reaction.mine &&
                    (there
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      : "border-slate-600 bg-slate-100 text-slate-900 hover:bg-slate-200"),
                )}
                onClick={() => void toggle(reaction.kind)}
              >
                {there ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : (
                  <CircleSlash className="size-3.5" />
                )}
                {REACTION_LABELS[reaction.kind]}
                {reaction.count > 0 && <span>{reaction.count}</span>}
              </Button>
            );
          })}
          {latest && (
            // 両方の確認があるときだけ、どちらが新しいかを書く
            <span className="ml-auto text-xs whitespace-nowrap text-gray-500">
              {existence.every(reaction => reaction.count > 0) ? (
                <>
                  <span className="mr-1 text-gray-400">最新</span>
                  {formatMonthDay(latest.at)} {REACTION_LABELS[latest.kind]}
                </>
              ) : (
                <>
                  {formatMonthDay(latest.at)}
                  <span className="ml-1 text-gray-400">確認</span>
                </>
              )}
            </span>
          )}
        </div>
      )}
      {/* 狭いカード（320pxのスマホ）では、ボタンの間隔と余白を詰めて1行に収める */}
      <div className="-ml-2.5 flex items-center gap-2 @max-[18rem]:-ml-1.5 @max-[18rem]:gap-1">
        {reactions
          .filter(reaction => reaction.kind === "HELPFUL")
          .map(reaction => {
            const label = REACTION_LABELS[reaction.kind];
            return (
              <Button
                key={reaction.kind}
                type="button"
                variant="ghost"
                title={label}
                aria-label={
                  reaction.mine ? `${label}を取り消す` : `${label}を付ける`
                }
                aria-pressed={reaction.mine}
                className={cn(
                  iconButton,
                  "hover:bg-sky-50 hover:text-sky-600",
                  reaction.mine && "text-sky-600",
                )}
                onClick={() => void toggle(reaction.kind)}
              >
                <ThumbsUp
                  className={cn("size-[18px]", reaction.mine && "fill-sky-100")}
                />
                {reaction.count}
              </Button>
            );
          })}
        {showPostedAt && (
          <time
            dateTime={post.createdAt}
            className="ml-auto shrink-0 text-xs text-gray-500 tabular-nums"
          >
            <span className="mr-1 text-gray-400">投稿日時</span>
            {formatPostedAt(post.createdAt)}
          </time>
        )}
        {trailing && (
          <div className={cn("shrink-0", !showPostedAt && "ml-auto")}>
            {trailing}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
