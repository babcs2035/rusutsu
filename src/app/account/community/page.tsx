"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  deleteCommunityAccount,
  getCommunityAccount,
  getNotifications,
  markNotificationsRead,
  saveCommunityProfile,
  startCommunityLogin,
} from "@/features/community/actions";
import type {
  CommunityAccount,
  CommunityNotificationDto,
} from "@/features/community/contract";
export default function CommunityAccountPage() {
  const [account, setAccount] = useState<CommunityAccount | null>(null);
  const [mode, setMode] = useState<"GOOGLE" | "NICKNAME" | "ANONYMOUS">(
    "ANONYMOUS",
  );
  const [nickname, setNickname] = useState("");
  const [notes, setNotes] = useState<CommunityNotificationDto[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  const [_busy, start] = useTransition();
  const refresh = () => {
    void getCommunityAccount().then(r => {
      if (r.ok) {
        setAccount(r.data);
        if (!r.data) {
          void startCommunityLogin("/rusutsu/account/community");
          return;
        }
        setMode(r.data?.nameMode ?? "ANONYMOUS");
        setNickname(r.data?.publicName ?? "");
      }
    });
    void getNotifications().then(r => {
      if (r.ok) {
        setNotes(r.data.notifications);
        setCount(r.data.unreadCount);
      }
    });
  };
  useEffect(refresh, []);
  return (
    <main className="mx-auto max-w-xl space-y-5 p-4">
      <Link href="/" className="text-sm underline">
        ← 戻る
      </Link>
      <h1 className="text-xl font-bold">コミュニティ設定</h1>
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
              checked={mode === m}
              onChange={() => setMode(m)}
            />
            {label}
          </label>
        ))}
        {mode === "NICKNAME" && (
          <input
            className="h-10 w-full rounded border px-3"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
          />
        )}
        <button
          type="button"
          className="rounded bg-sky-700 px-3 py-2 text-sm text-white"
          onClick={() =>
            start(async () => {
              const r = await saveCommunityProfile(mode, nickname);
              if (r.ok) setAccount(r.data);
              else setError(r.error);
            })
          }
        >
          公開名を保存
        </button>
        {account?.googleName && (
          <p className="text-xs text-gray-500">
            Googleアカウント名: {account.googleName}（自分だけに表示）
          </p>
        )}
      </section>
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            通知 {count > 0 && <span className="text-red-700">({count})</span>}
          </h2>
          <button
            type="button"
            className="text-xs underline"
            onClick={() =>
              start(async () => {
                await markNotificationsRead();
                refresh();
              })
            }
          >
            すべて既読
          </button>
        </div>
        {notes.map(n => (
          <Link
            key={n.id}
            className="block rounded border p-2 text-sm"
            href={`/community/post/${n.postId}`}
          >
            {n.kind} · {new Date(n.createdAt).toLocaleString("ja-JP")}
            {!n.readAt && <b className="ml-2 text-sky-700">未読</b>}
          </Link>
        ))}
      </section>
      <section className="space-y-2 border-t pt-4">
        <h2 className="font-semibold text-red-800">アカウント削除</h2>
        <p className="text-xs text-gray-600">
          投稿・写真・コメント・いいねなど、コミュニティのデータを削除します。
        </p>
        <button
          type="button"
          className="rounded border border-red-700 px-3 py-2 text-sm text-red-800"
          onClick={() => {
            if (prompt("削除するには「削除」と入力してください") !== "削除")
              return;
            start(async () => {
              const r = await deleteCommunityAccount("削除");
              if (r.ok) location.href = "/rusutsu";
              else setError(r.error);
            });
          }}
        >
          アカウントを削除
        </button>
      </section>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </main>
  );
}
