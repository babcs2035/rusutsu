"use client";

import { Heart, MessageCircle } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  getCommunityAccount,
  getPostDetail,
  saveComment,
  setPostLike,
  startCommunityLogin,
} from "@/features/community/actions";
import type { PublicComment, PublicPost } from "@/features/community/contract";
import { cn } from "@/lib/utils";

// いいね・コメントはログインが必要。押した時点で初めて確かめ、未ログインならログインへ進める。
let accountCheck: Promise<boolean> | null = null;
async function ensureSignedIn() {
  accountCheck ??= getCommunityAccount()
    .then(result => result.ok && result.data != null)
    .catch(() => false);
  if (await accountCheck) return true;
  accountCheck = null;
  await startCommunityLogin(
    `${window.location.pathname}${window.location.search}`,
  );
  return false;
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

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

/** 投稿カードの下に並べる、コメントといいね（押しやすいよう当たり判定を広く取る）と投稿日時 */
export function PostInteractions({ post }: { post: PublicPost }) {
  const [liked, setLiked] = useState(post.liked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<PublicComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, startSending] = useTransition();
  const liking = useRef(false);

  const loadComments = async () => {
    const result = await getPostDetail(post.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setComments(result.data.comments);
    setCommentCount(result.data.comments.length);
  };
  const toggleComments = () => {
    setError("");
    setCommentsOpen(open => !open);
    if (!comments) void loadComments();
  };
  const toggleLike = async () => {
    if (liking.current) return;
    liking.current = true;
    setError("");
    try {
      if (!(await ensureSignedIn())) return;
      // 押した瞬間に見た目を変え、失敗したら戻す
      const next = !liked;
      setLiked(next);
      setLikeCount(count => count + (next ? 1 : -1));
      const result = await setPostLike(post.id, next);
      if (!result.ok) {
        setLiked(!next);
        setLikeCount(count => count + (next ? -1 : 1));
        setError(result.error);
      }
    } finally {
      liking.current = false;
    }
  };
  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setError("");
    startSending(async () => {
      if (!(await ensureSignedIn())) return;
      const result = await saveComment(post.id, body, crypto.randomUUID());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft("");
      await loadComments();
    });
  };

  const action =
    "h-9 gap-1.5 rounded-full px-2.5 text-xs font-normal text-gray-500 tabular-nums @max-[18rem]:gap-1 @max-[18rem]:px-1.5";
  return (
    // 狭いカード（320pxのスマホ）では、ボタンの間隔と余白を詰めて1行に収める
    <div className="@container mt-1">
      <div className="-ml-2.5 flex items-center gap-4 @max-[18rem]:-ml-1.5 @max-[18rem]:gap-1">
        <Button
          type="button"
          variant="ghost"
          aria-label={`コメント ${commentCount}件`}
          aria-expanded={commentsOpen}
          className={cn(
            action,
            "hover:bg-sky-50 hover:text-sky-600",
            commentsOpen && "text-sky-600",
          )}
          onClick={toggleComments}
        >
          <MessageCircle className="size-[18px]" />
          {commentCount}
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-label={liked ? "いいねを取り消す" : "いいね"}
          aria-pressed={liked}
          className={cn(
            action,
            "hover:bg-pink-50 hover:text-pink-500",
            liked && "text-pink-500",
          )}
          onClick={() => void toggleLike()}
        >
          <Heart className={cn("size-[18px]", liked && "fill-pink-500")} />
          {likeCount}
        </Button>
        <time
          dateTime={post.createdAt}
          className="ml-auto shrink-0 text-xs text-gray-500 tabular-nums"
        >
          <span className="mr-1 text-gray-400">投稿日時</span>
          {formatPostedAt(post.createdAt)}
        </time>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
      {commentsOpen && (
        <div className="mt-1 space-y-2 border-t border-gray-100 pt-2">
          {comments == null ? (
            <Spinner className="size-4 text-gray-400" />
          ) : (
            comments.map(comment => (
              <div key={comment.id} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-gray-900">
                    {comment.author.publicName}
                  </span>
                  <time className="text-xs text-gray-400">
                    {formatDate(comment.createdAt)}
                  </time>
                </div>
                <p className="whitespace-pre-wrap break-words text-gray-700">
                  {comment.body}
                </p>
              </div>
            ))
          )}
          <form
            className="flex items-center gap-1.5"
            onSubmit={event => {
              event.preventDefault();
              send();
            }}
          >
            <Input
              aria-label="コメントを書く"
              placeholder="コメントを書く"
              maxLength={2000}
              className="h-8 min-w-0 flex-1 text-sm"
              value={draft}
              onChange={event => setDraft(event.target.value)}
            />
            <Button
              type="submit"
              className="h-8 shrink-0 px-3"
              disabled={sending || !draft.trim()}
            >
              送信
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
