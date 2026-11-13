"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteCommunityAccount,
  getCommunityAccount,
  getNotifications,
  markNotificationsRead,
  saveCommunityProfile,
  startCommunityLogin,
} from "@/features/community/actions";
import {
  type CommunityAccount,
  type CommunityNotificationDto,
  REACTION_LABELS,
  type ReactionKind,
} from "@/features/community/contract";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { PanelHeader } from "@/shared/components/PanelHeader";

const notificationText = (kind: string) => {
  const label = REACTION_LABELS[kind as ReactionKind];
  if (!label) return kind;
  return kind === "STILL_THERE" || kind === "GONE"
    ? `「${label}」が付きました`
    : `${label}が付きました`;
};

export function CommunitySettingsView({
  onClose,
  onPosts,
}: {
  onClose: () => void;
  onPosts: () => void;
}) {
  const [account, setAccount] = useState<CommunityAccount | null>(null);
  const [mode, setMode] = useState<"GOOGLE" | "NICKNAME" | "ANONYMOUS">(
    "ANONYMOUS",
  );
  const [nickname, setNickname] = useState("");
  const [notes, setNotes] = useState<CommunityNotificationDto[]>([]);
  const [count, setCount] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [busy, start] = useTransition();

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setError("");
    try {
      const [accountResult, notificationResult] = await Promise.all([
        getCommunityAccount(),
        getNotifications(),
      ]);
      if (!accountResult.ok) throw new Error(accountResult.error);
      if (!notificationResult.ok) throw new Error(notificationResult.error);
      if (!accountResult.data) {
        setRedirecting(true);
        void startCommunityLogin("/rusutsu/account/community");
        return;
      }
      setAccount(accountResult.data);
      setMode(accountResult.data.nameMode ?? "ANONYMOUS");
      setNickname(accountResult.data.publicName ?? "");
      setNotes(notificationResult.data.notifications);
      setCount(notificationResult.data.unreadCount);
    } catch (cause) {
      setLoadError(
        cause instanceof Error ? cause.message : "設定を読み込めませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex h-full min-h-0 flex-col text-sm font-sans">
      <PanelHeader
        title="設定"
        onClose={onClose}
        actions={
          <Button
            type="button"
            variant="outline"
            className="h-8 font-semibold text-sm"
            onClick={onPosts}
          >
            自分の投稿
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
        {loading || redirecting ? (
          <LoadingSpinner className="h-48" />
        ) : loadError ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-red-700">
              {loadError}
            </p>
            <Button
              type="button"
              variant="outline"
              className="font-semibold"
              onClick={() => void refresh()}
            >
              再試行
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <section className="space-y-2">
              <h2 className="font-semibold">公開名</h2>
              <p className="text-xs text-gray-600">
                Googleの名前は選択した場合だけ表示します。
              </p>
              {(
                [
                  ["GOOGLE", "Googleアカウント名"],
                  ["NICKNAME", "ニックネーム"],
                  ["ANONYMOUS", "匿名"],
                ] as const
              ).map(([m, label]) => (
                <label key={m} className="flex gap-2">
                  <input
                    type="radio"
                    disabled={busy}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  {label}
                </label>
              ))}
              {mode === "NICKNAME" && (
                <Input
                  aria-label="ニックネーム"
                  maxLength={40}
                  disabled={busy}
                  className="text-sm"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                />
              )}
              <Button
                type="button"
                variant="default"
                className="font-semibold"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    try {
                      const result = await saveCommunityProfile(mode, nickname);
                      if (result.ok) {
                        setAccount(result.data);
                        setError("");
                      } else setError(result.error);
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "保存できませんでした。",
                      );
                    }
                  })
                }
              >
                公開名を保存
              </Button>
              {account?.googleName && (
                <p className="text-xs text-gray-500">
                  Googleアカウント名: {account.googleName}（自分だけに表示）
                </p>
              )}
            </section>
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">
                  通知{" "}
                  {count > 0 && <span className="text-red-700">({count})</span>}
                </h2>
                <Button
                  type="button"
                  variant="link"
                  className="h-8 px-1 text-sm font-semibold"
                  disabled={busy}
                  onClick={() =>
                    start(async () => {
                      try {
                        const result = await markNotificationsRead();
                        if (!result.ok) {
                          setError(result.error);
                          return;
                        }
                        await refresh();
                      } catch (cause) {
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "通知を更新できませんでした。",
                        );
                      }
                    })
                  }
                >
                  すべて既読
                </Button>
              </div>
              {notes.length === 0 && (
                <p className="text-xs text-gray-600">通知はありません。</p>
              )}
              {notes.map(n => (
                <Link
                  key={n.id}
                  className="block rounded border border-gray-200 p-2 text-sm"
                  href={`/community/post/${n.postId}`}
                >
                  {notificationText(n.kind)} ·{" "}
                  {new Date(n.createdAt).toLocaleString("ja-JP")}
                  {!n.readAt && <b className="ml-2 text-sky-700">未読</b>}
                </Link>
              ))}
            </section>
            <section className="space-y-2 border-t border-gray-200 pt-4">
              <h2 className="font-semibold text-red-800">アカウント削除</h2>
              <p className="text-xs text-gray-600">
                投稿・写真・リアクションなど、コミュニティのデータを削除します。
              </p>
              <Button
                type="button"
                variant="outline"
                className="border-red-700 font-semibold text-red-800"
                disabled={busy}
                onClick={() => {
                  if (
                    prompt("削除するには「削除」と入力してください") !== "削除"
                  )
                    return;
                  start(async () => {
                    try {
                      const result = await deleteCommunityAccount("削除");
                      if (result.ok) location.href = "/rusutsu";
                      else setError(result.error);
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "削除できませんでした。",
                      );
                    }
                  });
                }}
              >
                アカウントを削除
              </Button>
            </section>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
