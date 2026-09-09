"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResortLink } from "@/features/lift/types";
import { saveSocialLinks } from "./actions";
import {
  isSocialUrl,
  SOCIAL_PLATFORMS,
  type SocialKey,
  type SocialLinksMap,
  type SocialResort,
  socialSaveSchema,
} from "./model";

const fieldId = (id: string, platform: SocialKey) => `${id}/${platform}`;
const equal = (a: ResortLink[], b: ResortLink[]) =>
  JSON.stringify(a) === JSON.stringify(b);

export function SocialAdminClient({
  resorts,
  initialLinks,
}: {
  resorts: SocialResort[];
  initialLinks: SocialLinksMap;
}) {
  const [links, setLinks] = useState(initialLinks);
  const [drafts, setDrafts] = useState<Record<string, ResortLink[]>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [platform, setPlatform] = useState<SocialKey>("xUrls");
  const [query, setQuery] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [limit, setLimit] = useState(20);
  const dirtyCount = Object.keys(drafts).length;
  const label =
    SOCIAL_PLATFORMS.find(item => item.key === platform)?.label ?? "";
  useEffect(() => {
    if (!dirtyCount) return;
    const listener = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirtyCount]);
  const search = query.normalize("NFKC").toLowerCase().trim();
  const filtered = resorts.filter(
    resort =>
      (!prefecture || resort.prefecture === prefecture) &&
      (!missingOnly || !links[resort.id]?.[platform]?.length) &&
      `${resort.name} ${resort.searchName} ${resort.id}`
        .normalize("NFKC")
        .toLowerCase()
        .includes(search),
  );
  const registered = resorts.filter(
    resort => links[resort.id]?.[platform]?.length,
  ).length;
  const updateDraft = (id: string, key: SocialKey, values: ResortLink[]) =>
    setDrafts(current => {
      const next = { ...current };
      if (equal(values, links[id]?.[key] ?? [])) delete next[fieldId(id, key)];
      else next[fieldId(id, key)] = values;
      return next;
    });
  return (
    <main className="mx-auto max-w-5xl min-w-0 px-3 py-5 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">SNSリンク編集</h1>
          <p className="mt-2 text-sm text-gray-600">
            SNSを選んで、スキー場ごとにリンクと補足を登録できます。
          </p>
        </div>
        <Link
          href="/admin"
          className="py-2 text-sm underline"
          onNavigate={event => {
            if (
              dirtyCount &&
              !window.confirm(
                "未保存の入力があります。破棄して管理画面へ戻りますか？",
              )
            )
              event.preventDefault();
          }}
        >
          管理画面へ
        </Link>
      </div>
      <section
        aria-label="SNSの種類"
        className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6"
      >
        {SOCIAL_PLATFORMS.map(item => (
          <Button
            key={item.key}
            aria-pressed={platform === item.key}
            variant={platform === item.key ? "default" : "outline"}
            className="min-h-11 px-2"
            onClick={() => {
              setPlatform(item.key);
              setLimit(20);
            }}
          >
            {item.label}
          </Button>
        ))}
      </section>
      <section
        aria-label="スキー場の絞り込み"
        className="mb-5 space-y-3 rounded-xl border bg-white p-4"
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <label className="space-y-1 text-sm font-medium">
            スキー場を検索
            <Input
              type="search"
              placeholder="スキー場名・別名・ID"
              value={query}
              className="mt-1 min-h-11 text-base"
              onChange={event => {
                setQuery(event.target.value);
                setLimit(20);
              }}
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            都道府県
            <select
              className="mt-1 block h-11 w-full rounded-md border bg-white px-3 text-base"
              value={prefecture}
              onChange={event => {
                setPrefecture(event.target.value);
                setLimit(20);
              }}
            >
              <option value="">すべて</option>
              {[...new Set(resorts.map(resort => resort.prefecture))]
                .filter(Boolean)
                .map(value => (
                  <option key={value}>{value}</option>
                ))}
            </select>
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={missingOnly}
            className="size-5"
            onChange={event => {
              setMissingOnly(event.target.checked);
              setLimit(20);
            }}
          />
          {label}が未登録のスキー場のみ
        </label>
        <p className="text-sm text-gray-600">
          {label}登録済み {registered} / {resorts.length}施設 · 表示対象{" "}
          {filtered.length}施設
        </p>
        {dirtyCount > 0 && (
          <p role="status" className="text-sm text-amber-800">
            未保存の入力: {dirtyCount}
            件（SNSや絞り込みを切り替えても保持されます）
          </p>
        )}
      </section>
      <div className="space-y-4">
        {filtered.slice(0, limit).map(resort => (
          <SocialResortCard
            key={fieldId(resort.id, platform)}
            resort={resort}
            platform={platform}
            label={label}
            saved={links[resort.id]?.[platform] ?? []}
            draft={drafts[fieldId(resort.id, platform)]}
            isSaving={saving[fieldId(resort.id, platform)] ?? false}
            onPendingChange={pending =>
              setSaving(current => ({
                ...current,
                [fieldId(resort.id, platform)]: pending,
              }))
            }
            onChange={values => updateDraft(resort.id, platform, values)}
            onSaved={values => {
              setLinks(current => ({
                ...current,
                [resort.id]: { ...current[resort.id], [platform]: values },
              }));
              setDrafts(current => {
                const next = { ...current };
                delete next[fieldId(resort.id, platform)];
                return next;
              });
            }}
          />
        ))}
      </div>
      {!filtered.length && (
        <p className="rounded-xl border bg-white p-8 text-center text-gray-600">
          条件に一致するスキー場はありません。
        </p>
      )}
      {filtered.length > limit && (
        <Button
          variant="outline"
          className="mt-5 min-h-11 w-full"
          onClick={() => setLimit(current => current + 20)}
        >
          さらに20施設を表示（残り{filtered.length - limit}施設）
        </Button>
      )}
    </main>
  );
}

function SocialResortCard({
  resort,
  platform,
  label,
  saved,
  draft,
  onChange,
  onSaved,
  isSaving,
  onPendingChange,
}: {
  resort: SocialResort;
  platform: SocialKey;
  label: string;
  saved: ResortLink[];
  draft?: ResortLink[];
  onChange: (values: ResortLink[]) => void;
  onSaved: (values: ResortLink[]) => void;
  isSaving: boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const values = draft ?? saved;
  const [localPending, startTransition] = useTransition();
  const pending = isSaving || localPending;
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const change = (next: ResortLink[]) => {
    setMessage("");
    onChange(next);
  };
  return (
    <section
      aria-label={`${resort.name} ${label}`}
      className="min-w-0 rounded-xl border bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="mb-4">
        <p className="text-xs text-gray-500">{resort.prefecture}</p>
        <h2 className="mt-1 break-words text-lg font-bold">{resort.name}</h2>
        <p className="break-all text-xs text-gray-500">{resort.id}</p>
      </div>
      <form
        onSubmit={event => {
          event.preventDefault();
          if (pending) return;
          const request = socialSaveSchema.safeParse({
            resortId: resort.id,
            platform,
            links: values.filter(
              value => value.url.trim() || value.description?.trim(),
            ),
            expectedLinks: saved,
          });
          if (!request.success) {
            setError(true);
            setMessage(
              request.error.issues.map(issue => issue.message).join("\n"),
            );
            return;
          }
          onPendingChange(true);
          startTransition(async () => {
            try {
              const result = await saveSocialLinks(request.data);
              setError(!result.ok);
              setMessage(result.ok ? "保存しました。" : result.message);
              if (result.ok) onSaved(result.links);
            } catch {
              setError(true);
              setMessage(
                "通信に失敗しました。入力内容は残っています。再度保存してください。",
              );
            } finally {
              onPendingChange(false);
            }
          });
        }}
      >
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          {values.length === 0 && (
            <p className="text-sm text-gray-500">
              {label}のリンクは未登録です。
            </p>
          )}
          {values.map((value, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: All inputs are controlled and URLs may be blank or duplicated while editing.
              key={index}
              className="min-w-0 space-y-2 rounded-lg bg-gray-50 p-3"
            >
              <label className="block text-sm font-medium">
                {label}のリンク {index + 1}
                <Input
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={value.url}
                  placeholder="https://..."
                  className="mt-1 min-h-11 min-w-0 text-base"
                  onChange={event =>
                    change(
                      values.map((item, i) =>
                        i === index
                          ? { ...item, url: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label className="block text-sm font-medium">
                補足（任意）
                <Input
                  value={value.description ?? ""}
                  placeholder="例：公式アカウント、パーク情報"
                  maxLength={2000}
                  className="mt-1 min-h-11 text-base"
                  onChange={event =>
                    change(
                      values.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              description: event.target.value || undefined,
                            }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <div className="flex items-center justify-between gap-2">
                {isSocialUrl(platform, value.url) ? (
                  <a
                    href={value.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 text-sm underline"
                  >
                    リンクを開く ↗
                  </a>
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 text-red-700"
                  aria-label={`${label}のリンク ${index + 1}を削除`}
                  onClick={() => change(values.filter((_, i) => i !== index))}
                >
                  削除
                </Button>
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => change([...values, { url: "" }])}
            >
              ＋ {label}のリンクを追加
            </Button>
            <Button type="submit" className="min-h-11" disabled={!draft}>
              {pending ? "保存中…" : "このスキー場のSNSを保存"}
            </Button>
          </div>
        </fieldset>
        {message && (
          <p
            role={error ? "alert" : "status"}
            className={`mt-3 whitespace-pre-line break-words text-sm ${error ? "text-red-700" : "text-green-700"}`}
          >
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
