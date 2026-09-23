"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RESORT_LINK_LABELS } from "@/features/lift/constants";
import type { ResortLink } from "@/features/lift/types";
import { isValidLinkUrl } from "@/features/links/model";
import { ElevationRefreshButton } from "./ElevationRefreshButton";
import type { ResortEditorLinks } from "./useResortEditorLinks";

export function ResortEditorTools({
  resortId,
  resortName,
  kind,
  sourceKind,
  linkEditor,
  crawlerSourceUrls = [],
}: {
  resortId: string;
  resortName: string;
  kind: "lift" | "slope";
  sourceKind?: "curated" | "osm";
  linkEditor: ResortEditorLinks;
  crawlerSourceUrls?: string[];
}) {
  const sourceUrls = [
    ...new Set(crawlerSourceUrls.map(url => url.trim())),
  ].filter(url => {
    try {
      return ["http:", "https:"].includes(new URL(url).protocol);
    } catch {
      return false;
    }
  });
  const busy = linkEditor.isSaving;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const change = (key: "mapUrls" | "mapPageUrls", next: ResortLink[]) => {
    linkEditor.setLinks(previous => ({ ...previous, [key]: next }));
    setMessage("");
    setError("");
  };
  const save = async () => {
    if (busy) return;
    setError("");
    setMessage("");
    try {
      await linkEditor.save(["mapUrls", "mapPageUrls"]);
      setMessage("ゲレンデマップURLを保存しました。");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "保存できませんでした。",
      );
    }
  };
  return (
    <section
      aria-label="編集共通ツール"
      className="shrink-0 border-b bg-white p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">ゲレンデマップURL</span>
        <Button
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "保存中…" : "URLを保存"}
        </Button>
      </div>
      <p className="mb-2 text-[11px] text-gray-600">
        最後の「すべて保存」にも含まれます。
      </p>
      <div className="flex flex-col gap-2">
        {(["mapUrls", "mapPageUrls"] as const).map(key => {
          const links = linkEditor.links[key];
          const displayed = links.length ? links : [{ url: "" }];
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">
                  {RESORT_LINK_LABELS[key]}
                </p>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  aria-label={`${RESORT_LINK_LABELS[key]}のURLを追加`}
                  disabled={busy || displayed.length >= 50}
                  onClick={() => change(key, [...displayed, { url: "" }])}
                >
                  追加
                </Button>
              </div>
              {displayed.map((link, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: URL入力中のフォーカスを保つ。行の並べ替えは行わない。
                <div key={index} className="flex flex-col gap-1">
                  <Input
                    aria-label={`${RESORT_LINK_LABELS[key]} URL ${index + 1}`}
                    type="url"
                    placeholder="https://…"
                    value={link.url}
                    disabled={busy}
                    onChange={event =>
                      change(
                        key,
                        displayed.map((item, i) =>
                          i === index
                            ? { ...item, url: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      render={
                        <a
                          href={`https://www.google.com/search?q=${encodeURIComponent(`${resortName} ゲレンデマップ`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      ゲレンデマップを検索
                    </Button>
                    {isValidLinkUrl(key, link.url) ? (
                      <Button
                        size="xs"
                        variant="outline"
                        render={
                          <a
                            href={link.url.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                          />
                        }
                      >
                        {key === "mapUrls"
                          ? "マップを表示"
                          : "掲載ページを表示"}
                      </Button>
                    ) : (
                      <Button size="xs" variant="outline" disabled>
                        {key === "mapUrls"
                          ? "マップを表示"
                          : "掲載ページを表示"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className="text-destructive"
                      aria-label={`${RESORT_LINK_LABELS[key]} URL ${index + 1}を削除`}
                      disabled={busy || links.length === 0}
                      onClick={() =>
                        change(
                          key,
                          displayed.filter((_, i) => i !== index),
                        )
                      }
                    >
                      削除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {sourceUrls.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {sourceUrls.map((url, index) => (
            <Button
              key={url}
              size="xs"
              variant="outline"
              nativeButton={false}
              title={url}
              render={
                <a href={url} target="_blank" rel="noopener noreferrer" />
              }
            >
              {kind === "slope"
                ? "コースの最新情報を表示"
                : "リフトの最新情報を表示"}
              {sourceUrls.length > 1 ? `（${index + 1}）` : ""}
            </Button>
          ))}
        </div>
      )}
      {message && (
        <p role="status" className="mt-1 text-xs text-green-800">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
      <div className="mt-2 border-t pt-2">
        <ElevationRefreshButton
          key={`${resortId}:${sourceKind}`}
          resortId={resortId}
          kind={kind}
          sourceKind={sourceKind}
        />
      </div>
    </section>
  );
}
