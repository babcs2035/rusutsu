"use client";

import { Check, Copy, Search, X } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResortLink } from "@/features/lift/types";
import { cn } from "@/lib/utils";
import { SortableLinkList } from "@/shared/components/resort-editor/SortableLinkList";
import { saveResortLink } from "./actions";
import {
  isValidLinkUrl,
  LINK_CATEGORIES,
  type LinkKey,
  type LinkResort,
  type LinksMap,
  linkSaveSchema,
} from "./model";

const fieldId = (id: string, category: LinkKey) => `${id}/${category}`;
const equal = (a: ResortLink[], b: ResortLink[]) =>
  JSON.stringify(a) === JSON.stringify(b);

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // 権限などで Clipboard API が使えない場合は従来方式を試す。
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const succeeded = document.execCommand("copy");
  textarea.remove();
  if (!succeeded) throw new Error("Copy command failed");
};

// 「スキー場名 + 項目名」で検索できるようにする行。SNSアプリ内検索など、
// 新しいタブでの検索がやりづらい場合に備えて文字列コピーも用意する。
function SearchWordRow({ searchWord }: { searchWord: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );
  const handleCopy = async () => {
    try {
      await copyText(searchWord);
      setCopied(true);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mb-4 rounded-lg bg-gray-50 p-3">
      {/* 検索ワードの文字列自体はモバイルだと縦に長くなりがちなので、
          画面に余裕のあるsm以上でだけ表示する */}
      <p className="mb-2 hidden break-words text-sm text-gray-700 sm:block">
        検索ワード: <span className="font-medium">{searchWord}</span>
      </p>
      <div className="flex gap-2">
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(searchWord)}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`「${searchWord}」で検索`}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-input bg-white px-2 text-sm font-medium hover:bg-gray-50"
        >
          <Search className="size-4" />
          検索
        </a>
        <Button
          type="button"
          variant="outline"
          title={`「${searchWord}」をコピー`}
          className={cn(
            "min-h-11 flex-1",
            copied && "border-green-600 text-green-700",
          )}
          onClick={() => void handleCopy()}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "コピーしました" : "コピー"}
        </Button>
      </div>
    </div>
  );
}

// 入力欄の右端に×を出し、1タップで全消去できるようにする（モバイルで長いURLを
// 選択してから削除するのは手間が大きいため）。
function ClearableInput({
  value,
  onClear,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { onClear: () => void }) {
  return (
    <div className="relative">
      <Input
        value={value}
        className={cn("min-h-11 pr-10 text-base", className)}
        {...props}
      />
      {typeof value === "string" && value.length > 0 && (
        <button
          type="button"
          aria-label="入力内容をクリア"
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 hover:text-gray-600"
          onClick={onClear}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function LinksAdminClient({
  resorts,
  initialLinks,
}: {
  resorts: LinkResort[];
  initialLinks: LinksMap;
}) {
  const [links, setLinks] = useState(initialLinks);
  const [drafts, setDrafts] = useState<Record<string, ResortLink[]>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [category, setCategory] = useState<LinkKey>(LINK_CATEGORIES[0].key);
  const [query, setQuery] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [limit, setLimit] = useState(20);
  const dirtyCount = Object.keys(drafts).length;
  const label =
    LINK_CATEGORIES.find(item => item.key === category)?.label ?? "";
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
      (!missingOnly || !links[resort.id]?.[category]?.length) &&
      `${resort.name} ${resort.searchName} ${resort.id}`
        .normalize("NFKC")
        .toLowerCase()
        .includes(search),
  );
  const registered = resorts.filter(
    resort => links[resort.id]?.[category]?.length,
  ).length;
  const updateDraft = (id: string, key: LinkKey, values: ResortLink[]) =>
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
          <h1 className="text-2xl font-bold">リンク編集</h1>
          <p className="mt-2 text-sm text-gray-600">
            項目を選んで、スキー場ごとに公式サイト・SNS・スクールなど各種リンクと補足を登録できます。
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
        aria-label="スキー場の絞り込み"
        className="mb-5 space-y-3 rounded-xl border bg-white p-4"
      >
        <label className="block space-y-1 text-sm font-medium">
          編集する項目
          <select
            className="mt-1 block h-11 w-full rounded-md border bg-white px-3 text-base"
            value={category}
            onChange={event => {
              setCategory(event.target.value as LinkKey);
              setLimit(20);
            }}
          >
            {LINK_CATEGORIES.map(item => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
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
            件（項目や絞り込みを切り替えても保持されます）
          </p>
        )}
      </section>
      <div className="space-y-4">
        {filtered.slice(0, limit).map(resort => (
          <LinkResortCard
            key={fieldId(resort.id, category)}
            resort={resort}
            category={category}
            label={label}
            saved={links[resort.id]?.[category] ?? []}
            draft={drafts[fieldId(resort.id, category)]}
            isSaving={saving[fieldId(resort.id, category)] ?? false}
            onPendingChange={pending =>
              setSaving(current => ({
                ...current,
                [fieldId(resort.id, category)]: pending,
              }))
            }
            onChange={values => updateDraft(resort.id, category, values)}
            onSaved={values => {
              setLinks(current => ({
                ...current,
                [resort.id]: { ...current[resort.id], [category]: values },
              }));
              setDrafts(current => {
                const next = { ...current };
                delete next[fieldId(resort.id, category)];
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

function LinkResortCard({
  resort,
  category,
  label,
  saved,
  draft,
  onChange,
  onSaved,
  isSaving,
  onPendingChange,
}: {
  resort: LinkResort;
  category: LinkKey;
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
  const changeAt = (index: number, value: Partial<ResortLink>) =>
    change(
      values.map((item, i) => (i === index ? { ...item, ...value } : item)),
    );
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
      <SearchWordRow searchWord={`${resort.searchName} ${label}`.trim()} />
      <form
        onSubmit={event => {
          event.preventDefault();
          if (pending) return;
          const request = linkSaveSchema.safeParse({
            resortId: resort.id,
            platform: category,
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
              const result = await saveResortLink(request.data);
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
          <SortableLinkList
            label={label}
            values={values}
            onChange={change}
            disabled={pending}
            className="flex flex-col gap-4"
          >
            {(value, index, handle) => (
              <div className="min-w-0 space-y-2 rounded-lg bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {label}のリンク {index + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    {handle}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 text-gray-500 hover:text-red-700"
                      aria-label={`${label}のリンク ${index + 1}を削除`}
                      onClick={() =>
                        change(values.filter((_, i) => i !== index))
                      }
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid min-w-0 grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <label className="block text-sm font-medium">
                      URL
                      <ClearableInput
                        type="url"
                        inputMode="url"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        required
                        value={value.url}
                        placeholder="https://..."
                        className="mt-1"
                        onChange={event =>
                          changeAt(index, { url: event.target.value })
                        }
                        onClear={() => changeAt(index, { url: "" })}
                      />
                    </label>
                    {/* URLを入力・確認したその場ですぐ開けるよう、補足欄より前に置く */}
                    {isValidLinkUrl(category, value.url) && (
                      <a
                        href={value.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-input bg-white text-sm font-medium hover:bg-gray-50"
                      >
                        リンクを開く ↗
                      </a>
                    )}
                  </div>
                  <label className="block min-w-0 text-sm font-medium">
                    補足（任意）
                    <ClearableInput
                      value={value.description ?? ""}
                      placeholder="例：公式アカウント、パーク情報"
                      maxLength={2000}
                      className="mt-1"
                      onChange={event =>
                        changeAt(index, {
                          description: event.target.value || undefined,
                        })
                      }
                      onClear={() =>
                        changeAt(index, { description: undefined })
                      }
                    />
                  </label>
                </div>
              </div>
            )}
          </SortableLinkList>
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
              {pending ? "保存中…" : "このスキー場のリンクを保存"}
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
