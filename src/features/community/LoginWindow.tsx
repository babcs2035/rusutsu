"use client";

import { useEffect, useState } from "react";
import { startCommunityLogin } from "./actions";

// Googleのログインは別ウィンドウで行い、元の画面（地図・入力内容）を読み込み直さない。
const CHANNEL = "rusutsu:login";
const START_PATH = "/rusutsu/login/start";
const DONE_PATH = "/rusutsu/login/done";

const isSitePath = (value: string | null): value is string =>
  !!value && /^\/rusutsu(\/|$)/.test(value) && !value.startsWith("//");

/**
 * ログイン用の小さいウィンドウ（スマホでは新しいタブ）を開く。開けないときは false を返すので、
 * 呼び出し側はこれまでどおり画面ごとログインへ移動する。押した操作の中で同期的に呼ぶこと。
 */
export function openLoginWindow(returnTo: string) {
  const url = `${START_PATH}?returnTo=${encodeURIComponent(returnTo)}`;
  const width = 480;
  const height = 640;
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
  const popup = window.open(
    url,
    "rusutsu-login",
    `popup,width=${width},height=${height},left=${left},top=${top}`,
  );
  return popup != null;
}

/** 別ウィンドウでログインが終わったら呼ぶ。元の画面はログイン状態だけを読み直す。 */
export function onLoginWindowDone(callback: () => void) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = event => {
    if (event.data !== "signed-in") return;
    // 受け取ったことを返し、ログイン用ウィンドウを閉じてもらう
    channel.postMessage("received");
    callback();
  };
  return () => channel.close();
}

/** ログイン用ウィンドウの最初の画面。すぐにGoogleのログインへ進む。 */
export function LoginWindowStart() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const returnTo = new URL(window.location.href).searchParams.get("returnTo");
    const done = new URL(DONE_PATH, window.location.origin);
    if (isSitePath(returnTo)) done.searchParams.set("returnTo", returnTo);
    startCommunityLogin(`${done.pathname}${done.search}`).catch(error => {
      // 成功時のページ移動は Next が例外として扱うので、それ以外だけを失敗とする
      if (!(error instanceof Error && "digest" in error)) setFailed(true);
    });
  }, []);
  return (
    <main className="flex h-dvh items-center justify-center p-6 text-sm text-gray-700">
      {failed
        ? "ログインを開始できませんでした。このウィンドウを閉じて、もう一度お試しください。"
        : "Googleのログイン画面へ移動しています…"}
    </main>
  );
}

/**
 * ログイン完了後の画面。元の画面へ知らせ、受け取られたら閉じる。
 * Googleの画面を経由すると親ウィンドウとのつながり（opener）が切れることがあるため、
 * 同じサイトのタブ同士で届く BroadcastChannel で確かめる。元の画面がなければそこへ戻る。
 */
export function LoginWindowDone() {
  useEffect(() => {
    const returnTo = new URL(window.location.href).searchParams.get("returnTo");
    const goBack = () =>
      window.location.replace(isSitePath(returnTo) ? returnTo : "/rusutsu");
    if (typeof BroadcastChannel === "undefined") {
      goBack();
      return;
    }
    const channel = new BroadcastChannel(CHANNEL);
    const fallback = window.setTimeout(() => {
      channel.close();
      goBack();
    }, 1500);
    channel.onmessage = event => {
      if (event.data !== "received") return;
      window.clearTimeout(fallback);
      channel.close();
      window.close();
    };
    channel.postMessage("signed-in");
    return () => {
      window.clearTimeout(fallback);
      channel.close();
    };
  }, []);
  return (
    <main className="flex h-dvh items-center justify-center p-6 text-sm text-gray-700">
      ログインしました。このウィンドウを閉じて元の画面に戻ってください。
    </main>
  );
}
