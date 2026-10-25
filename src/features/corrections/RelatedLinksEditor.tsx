"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ResortLink } from "@/features/lift/types";
import {
  LINK_CATEGORIES,
  type LinkKey,
  type LinksMap,
} from "@/features/links/model";
import { submitCorrection } from "./actions";
import { withAnonymousCheck } from "./anonymousCheck";

export function RelatedLinksEditor({
  resortId,
  resortName,
  current,
  returnTo,
}: {
  resortId: string;
  resortName: string;
  current: LinksMap[string];
  returnTo: string;
}) {
  const [category, setCategory] = useState<LinkKey>(LINK_CATEGORIES[0].key);
  const baseline = useRef(current);
  const [links, setLinks] = useState<ResortLink[]>([]);
  const [key, setKey] = useState(crypto.randomUUID());
  const [loaded, setLoaded] = useState("");
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [step, setStep] = useState<"edit" | "review" | "done">("edit");
  const [busy, startTransition] = useTransition();
  const draftKey = `correction-links:${resortId}:${category}`;
  const original = baseline.current[category] ?? [];
  useEffect(() => {
    let restored: ResortLink[] | null = null;
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (
        saved &&
        Date.now() - saved.updatedAt < 86400000 &&
        Array.isArray(saved.links)
      ) {
        restored = saved.links;
        setComment(saved.comment ?? "");
        setKey(saved.operationKey ?? crypto.randomUUID());
      } else {
        localStorage.removeItem(draftKey);
        setKey(crypto.randomUUID());
        setComment("");
      }
    } catch {
      localStorage.removeItem(draftKey);
    }
    setLinks(restored ?? baseline.current[category] ?? []);
    setLoaded(draftKey);
    setStep("edit");
  }, [draftKey, category]);
  useEffect(() => {
    if (loaded === draftKey)
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          updatedAt: Date.now(),
          links,
          comment,
          operationKey: key,
        }),
      );
  }, [links, key, draftKey, loaded, comment]);
  const changed = JSON.stringify(links) !== JSON.stringify(original);
  return (
    <main className="mx-auto max-w-2xl space-y-3 p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">{resortName}の関連リンク</h1>
        <Link href={returnTo} className="text-sm underline">
          戻る
        </Link>
      </header>
      <p className="text-sm text-slate-600">
        匿名で提案できます。管理者が確認してから反映します。
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {step === "done" ? (
        <>
          <p>提案を受け付けました。</p>
          <Link className="underline" href={`/corrections/${resortId}`}>
            他の箇所も修正する
          </Link>
        </>
      ) : (
        <>
          <label className="block text-sm">
            リンクの種類
            <Select
              disabled={busy || step === "review"}
              value={category}
              items={LINK_CATEGORIES.map(item => ({
                value: item.key,
                label: item.label,
              }))}
              onValueChange={value => setCategory(value as LinkKey)}
            >
              <SelectTrigger aria-label="リンクの種類" className="ml-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINK_CATEGORIES.map(item => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {step === "review" ? (
            <div className="grid gap-3 rounded border p-3 sm:grid-cols-2">
              <section>
                <h2 className="font-semibold">現在</h2>
                {original.map(link => (
                  <p key={link.url} className="break-all text-sm">
                    {link.description} {link.url}
                  </p>
                ))}
              </section>
              <section>
                <h2 className="font-semibold">変更後</h2>
                {links.length ? (
                  links.map(link => (
                    <p key={link.url} className="break-all text-sm">
                      {link.description} {link.url}
                    </p>
                  ))
                ) : (
                  <p className="text-sm">リンクを削除</p>
                )}
              </section>
            </div>
          ) : (
            <div className="space-y-2">
              {links.map((link, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: fully controlled rows have no independent component state
                  key={`${category}-${index}`}
                  className="flex items-start gap-2 rounded border p-2"
                >
                  <div className="flex-1 space-y-1">
                    <input
                      aria-label={`リンク${index + 1}のURL`}
                      type="url"
                      value={link.url}
                      onChange={event =>
                        setLinks(values =>
                          values.map((entry, i) =>
                            i === index
                              ? { ...entry, url: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      className="w-full rounded border p-2 text-sm"
                      placeholder="https://"
                    />
                    <input
                      aria-label={`リンク${index + 1}の説明`}
                      value={link.description ?? ""}
                      onChange={event =>
                        setLinks(values =>
                          values.map((entry, i) =>
                            i === index
                              ? { ...entry, description: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      className="w-full rounded border p-2 text-sm"
                      placeholder="説明（任意）"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setLinks(values => values.filter((_, i) => i !== index))
                    }
                  >
                    削除
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                disabled={links.length >= 50}
                onClick={() => setLinks(values => [...values, { url: "" }])}
              >
                リンクを追加
              </Button>
            </div>
          )}
          <form
            action={form =>
              startTransition(async () => {
                const photos = new FormData();
                for (const file of form.getAll("photos"))
                  if (file instanceof File && file.size)
                    photos.append("photos", file);
                const answer = await withAnonymousCheck(proof =>
                  submitCorrection(
                    {
                      resortId,
                      operationKey: key,
                      returnTo,
                      proof,
                      items: [
                        {
                          targetKind: "resort",
                          field: `links:${category}`,
                          before: original,
                          proposed: links,
                        },
                      ],
                      comment,
                    },
                    photos,
                  ),
                );
                if (answer.ok) {
                  localStorage.removeItem(draftKey);
                  setStep("done");
                } else setError(answer.error);
              })
            }
            className="space-y-2"
          >
            <label className="block text-sm">
              補足（任意）
              <textarea
                name="comment"
                value={comment}
                onChange={event => setComment(event.target.value)}
                maxLength={2000}
                className="block w-full rounded border p-2"
              />
            </label>
            <label className="block text-sm">
              写真（任意・最大3枚）
              <input
                name="photos"
                type="file"
                multiple
                onChange={event => {
                  const files = Array.from(event.target.files ?? []);
                  if (
                    files.length > 3 ||
                    files.some(file => file.size > 8 * 1024 * 1024)
                  ) {
                    event.target.value = "";
                    setError("写真は1枚8MB以内、3枚までです。");
                  } else setError("");
                }}
                accept="image/jpeg,image/png,image/webp,image/heic"
                className="block w-full"
              />
            </label>
            <p className="text-xs text-slate-500">
              写真は管理者のみ閲覧します。サイト外では二次利用しません。
            </p>
            <div className="flex gap-2">
              {step === "edit" ? (
                <Button
                  type="button"
                  disabled={!changed || busy}
                  onClick={() => setStep("review")}
                >
                  内容を確認
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={busy}
                    onClick={() => setStep("edit")}
                  >
                    入力に戻る
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy ? "送信中…" : "提案を送信"}
                  </Button>
                </>
              )}
            </div>
          </form>
        </>
      )}
    </main>
  );
}
