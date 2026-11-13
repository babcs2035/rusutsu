"use client";

import { ExternalLink, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { EvChargerCandidate } from "@/server/ev-chargers/candidates";
import {
  type EvCharger,
  formatEvChargerOutput,
  parseEvChargers,
} from "@/shared/utils/evChargers";
import { saveResortEvChargers } from "./actions";

type AdminResort = {
  id: string;
  name: string;
  prefecture: string;
  isActive: boolean;
  searchName: string;
  updatedAt: string;
  evChargers: unknown;
  candidates: EvChargerCandidate[];
};

/** 入力中の1行。数値も文字のまま持ち、保存するときに数に直す */
type Row = {
  key: string;
  kind: "quick" | "normal";
  kw: string;
  count: string;
  operator: string;
  url: string;
  note: string;
};

/** 未確認（null）・確認済みで無し（none）・あり（rows） */
type Draft =
  | { state: "unknown" }
  | { state: "none" }
  | { state: "rows"; rows: Row[] };

type StatusFilter =
  | "all"
  | "unknown"
  | "unknownWithCandidates"
  | "none"
  | "rows";

let rowSequence = 0;
const newKey = () => `row-${++rowSequence}`;

const toRow = (charger: Partial<EvCharger>): Row => ({
  key: newKey(),
  kind: charger.kind ?? "normal",
  kw: charger.kw ? String(charger.kw) : "",
  count: charger.count ? String(charger.count) : "1",
  operator: charger.operator ?? "",
  url: charger.url ?? "",
  note: charger.note ?? "",
});

const draftOf = (chargers: EvCharger[] | null): Draft =>
  chargers === null
    ? { state: "unknown" }
    : chargers.length === 0
      ? { state: "none" }
      : { state: "rows", rows: chargers.map(toRow) };

const chargersOfDraft = (draft: Draft): EvCharger[] | null | "invalid" => {
  if (draft.state === "unknown") return null;
  if (draft.state === "none") return [];
  const chargers: EvCharger[] = [];
  for (const row of draft.rows) {
    const kw = Number(row.kw);
    const count = Number(row.count);
    if (!(kw > 0) || !Number.isInteger(count) || count < 1) return "invalid";
    chargers.push({
      kind: row.kind,
      kw: Math.round(kw * 10) / 10,
      count,
      operator: row.operator.trim() || null,
      url: row.url.trim() || null,
      note: row.note.trim() || null,
    });
  }
  return chargers.length ? chargers : [];
};

const statusOf = (chargers: EvCharger[] | null) =>
  chargers === null ? "unknown" : chargers.length ? "rows" : "none";

const STATUS_LABEL = { unknown: "未確認", none: "なし", rows: "あり" } as const;
const STATUS_TONE = {
  unknown: "bg-gray-100 text-gray-600",
  none: "bg-slate-200 text-slate-700",
  rows: "bg-emerald-100 text-emerald-800",
} as const;

export function EvChargersAdminClient({
  resorts: initialResorts,
  candidateInfo,
}: {
  resorts: AdminResort[];
  candidateInfo: { surveyDate: string; radiusM: number } | null;
}) {
  const [saved, setSaved] = useState(() =>
    Object.fromEntries(
      initialResorts.map(resort => [
        resort.id,
        {
          updatedAt: resort.updatedAt,
          chargers: parseEvChargers(resort.evChargers),
        },
      ]),
    ),
  );
  const [query, setQuery] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("unknownWithCandidates");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const search = query.normalize("NFKC").toLowerCase().trim();
  const filtered = useMemo(
    () =>
      initialResorts.filter(resort => {
        const status = statusOf(saved[resort.id]?.chargers ?? null);
        if (prefecture && resort.prefecture !== prefecture) return false;
        if (filter === "unknownWithCandidates") {
          if (status !== "unknown" || resort.candidates.length === 0)
            return false;
        } else if (filter !== "all" && status !== filter) return false;
        return `${resort.name} ${resort.searchName} ${resort.id}`
          .normalize("NFKC")
          .toLowerCase()
          .includes(search);
      }),
    [initialResorts, saved, prefecture, filter, search],
  );
  const counts = useMemo(() => {
    const result = { unknown: 0, none: 0, rows: 0 };
    for (const resort of initialResorts)
      result[statusOf(saved[resort.id]?.chargers ?? null)]++;
    return result;
  }, [initialResorts, saved]);
  const dirtyCount = Object.keys(drafts).length;
  useEffect(() => {
    if (!dirtyCount) return;
    const listener = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirtyCount]);

  const selected =
    initialResorts.find(resort => resort.id === selectedId) ?? null;
  const selectedIndex = filtered.findIndex(resort => resort.id === selectedId);
  const next = filtered[selectedIndex + 1] ?? null;

  return (
    <main className="flex h-dvh min-h-0 flex-col bg-gray-50">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-white px-4 py-2">
        <h1 className="text-lg font-bold">EV充電</h1>
        <p className="text-xs text-gray-600">
          あり {counts.rows}・なし {counts.none}・未確認 {counts.unknown}
          {candidateInfo
            ? `（候補は ${candidateInfo.surveyDate} 調査・${candidateInfo.radiusM / 1000}km以内）`
            : "（候補ファイルがありません）"}
        </p>
        {dirtyCount > 0 && (
          <p role="status" className="text-xs font-semibold text-amber-700">
            未保存 {dirtyCount}件
          </p>
        )}
        <Link
          href="/admin"
          className="ml-auto text-sm underline"
          onNavigate={event => {
            if (
              dirtyCount &&
              !window.confirm("未保存の入力があります。破棄して戻りますか？")
            )
              event.preventDefault();
          }}
        >
          管理画面へ
        </Link>
      </header>
      <div className="grid min-h-0 flex-1 md:grid-cols-[320px_minmax(0,1fr)]">
        <aside
          className={cn(
            "flex min-h-0 flex-col border-r bg-white",
            selected && "hidden md:flex",
          )}
        >
          <div className="space-y-2 border-b p-3">
            <Input
              type="search"
              placeholder="スキー場名・別名・ID"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="状態"
                className="h-8 rounded-md border bg-white px-2 text-sm"
                value={filter}
                onChange={event =>
                  setFilter(event.target.value as StatusFilter)
                }
              >
                <option value="unknownWithCandidates">未確認・候補あり</option>
                <option value="unknown">未確認</option>
                <option value="rows">あり</option>
                <option value="none">なし</option>
                <option value="all">すべて</option>
              </select>
              <select
                aria-label="都道府県"
                className="h-8 rounded-md border bg-white px-2 text-sm"
                value={prefecture}
                onChange={event => setPrefecture(event.target.value)}
              >
                <option value="">全都道府県</option>
                {[...new Set(initialResorts.map(resort => resort.prefecture))]
                  .filter(Boolean)
                  .map(value => (
                    <option key={value}>{value}</option>
                  ))}
              </select>
            </div>
            <p className="text-xs text-gray-500">{filtered.length}件</p>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {filtered.map(resort => {
              const status = statusOf(saved[resort.id]?.chargers ?? null);
              return (
                <li key={resort.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(resort.id)}
                    className={cn(
                      "flex w-full items-center gap-2 border-b px-3 py-2 text-left hover:bg-blue-50",
                      resort.id === selectedId && "bg-blue-50",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {resort.name}
                        {!resort.isActive && (
                          <span className="ml-1 text-xs text-gray-400">
                            非公開
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {resort.prefecture}・候補 {resort.candidates.length}
                      </span>
                    </span>
                    {drafts[resort.id] && (
                      <span className="text-xs font-semibold text-amber-700">
                        未保存
                      </span>
                    )}
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                        STATUS_TONE[status],
                      )}
                    >
                      {STATUS_LABEL[status]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <section
          className={cn(
            "min-h-0 overflow-y-auto",
            !selected && "hidden md:block",
          )}
        >
          {selected ? (
            <ResortEditor
              key={selected.id}
              resort={selected}
              saved={saved[selected.id]}
              draft={drafts[selected.id]}
              next={next}
              onBack={() => setSelectedId(null)}
              onNext={() => next && setSelectedId(next.id)}
              onDraftChange={draft =>
                setDrafts(current => {
                  const copy = { ...current };
                  if (draft) copy[selected.id] = draft;
                  else delete copy[selected.id];
                  return copy;
                })
              }
              onSaved={value =>
                setSaved(current => ({ ...current, [selected.id]: value }))
              }
            />
          ) : (
            <p className="p-8 text-sm text-gray-500">
              左の一覧からスキー場を選んでください。
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function ResortEditor({
  resort,
  saved,
  draft: storedDraft,
  next,
  onBack,
  onNext,
  onDraftChange,
  onSaved,
}: {
  resort: AdminResort;
  saved: { updatedAt: string; chargers: EvCharger[] | null } | undefined;
  draft: Draft | undefined;
  next: AdminResort | null;
  onBack: () => void;
  onNext: () => void;
  onDraftChange: (draft: Draft | null) => void;
  onSaved: (value: { updatedAt: string; chargers: EvCharger[] | null }) => void;
}) {
  const savedChargers = saved?.chargers ?? null;
  const draft = storedDraft ?? draftOf(savedChargers);
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const value = chargersOfDraft(draft);
  const isDirty =
    value === "invalid" ||
    JSON.stringify(value) !== JSON.stringify(savedChargers);

  const update = (nextDraft: Draft) => {
    setMessage(null);
    const nextValue = chargersOfDraft(nextDraft);
    onDraftChange(
      nextValue !== "invalid" &&
        JSON.stringify(nextValue) === JSON.stringify(savedChargers)
        ? null
        : nextDraft,
    );
  };
  const rows = draft.state === "rows" ? draft.rows : [];
  const setRows = (nextRows: Row[]) =>
    update(
      nextRows.length ? { state: "rows", rows: nextRows } : { state: "none" },
    );
  const addRows = (added: Row[]) => setRows([...rows, ...added]);

  const save = () => {
    if (value === "invalid") {
      setMessage({ tone: "error", text: "出力（kW）と口数を入れてください。" });
      return;
    }
    startTransition(async () => {
      const result = await saveResortEvChargers(
        resort.id,
        saved?.updatedAt ?? resort.updatedAt,
        value,
      );
      if (result.status === "error") {
        setMessage({ tone: "error", text: result.message });
        return;
      }
      if (!result.submitted) {
        onSaved({
          updatedAt: result.updatedAt,
          chargers: parseEvChargers(result.evChargers),
        });
        onDraftChange(null);
      }
      setMessage({ tone: "ok", text: result.message });
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-sm text-blue-700 underline md:hidden"
          onClick={onBack}
        >
          一覧へ
        </button>
        <h2 className="text-lg font-bold">{resort.name}</h2>
        <span className="text-sm text-gray-500">
          {resort.prefecture}・{resort.id}
        </span>
        <a
          href={`https://www.google.com/maps/search/${encodeURIComponent(`${resort.name} EV充電`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-sm text-blue-700 underline"
        >
          Googleマップで探す
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>

      <section className="space-y-3 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-bold">スキー中に使える充電器</h3>
          <div role="radiogroup" aria-label="状態" className="flex gap-1">
            {(["unknown", "none", "rows"] as const).map(state => (
              <button
                key={state}
                type="button"
                role="radio"
                aria-checked={draft.state === state}
                onClick={() =>
                  update(
                    state === "rows"
                      ? {
                          state: "rows",
                          rows: rows.length ? rows : [toRow({})],
                        }
                      : { state },
                  )
                }
                className={cn(
                  "h-7 rounded-md border px-3 text-sm",
                  draft.state === state
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-50",
                )}
              >
                {STATUS_LABEL[state]}
              </button>
            ))}
          </div>
        </div>

        {draft.state === "rows" && (
          <div className="space-y-2">
            <div className="hidden grid-cols-[88px_76px_64px_1fr_1fr_1fr_32px] gap-2 text-xs font-semibold text-gray-500 md:grid">
              <span>種類</span>
              <span>出力kW</span>
              <span>口数</span>
              <span>管理会社</span>
              <span>URL（任意）</span>
              <span>メモ</span>
              <span />
            </div>
            {rows.map((row, index) => {
              const change = (patch: Partial<Row>) =>
                setRows(
                  rows.map(item =>
                    item.key === row.key ? { ...item, ...patch } : item,
                  ),
                );
              return (
                <div
                  key={row.key}
                  className="grid grid-cols-[88px_76px_64px_minmax(0,1fr)_32px] gap-2 rounded-lg border p-2 md:grid-cols-[88px_76px_64px_1fr_1fr_1fr_32px] md:border-0 md:p-0"
                >
                  <select
                    aria-label={`${index + 1}行目の種類`}
                    className="h-8 rounded-md border bg-white px-1 text-sm"
                    value={row.kind}
                    onChange={event =>
                      change({ kind: event.target.value as Row["kind"] })
                    }
                  >
                    <option value="quick">急速</option>
                    <option value="normal">普通</option>
                  </select>
                  <Input
                    aria-label={`${index + 1}行目の出力kW`}
                    inputMode="decimal"
                    value={row.kw}
                    placeholder="6"
                    className="h-8"
                    onChange={event => change({ kw: event.target.value })}
                  />
                  <Input
                    aria-label={`${index + 1}行目の口数`}
                    inputMode="numeric"
                    value={row.count}
                    className="h-8"
                    onChange={event => change({ count: event.target.value })}
                  />
                  <Input
                    aria-label={`${index + 1}行目の管理会社`}
                    value={row.operator}
                    placeholder="Terra Charge"
                    className="h-8 md:order-none"
                    onChange={event => change({ operator: event.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${index + 1}行目を消す`}
                    className="md:order-last"
                    onClick={() =>
                      setRows(rows.filter(item => item.key !== row.key))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <Input
                    aria-label={`${index + 1}行目のURL`}
                    value={row.url}
                    placeholder="https://ev.gogo.gs/detail/…"
                    className="col-span-3 h-8 md:col-span-1"
                    onChange={event => change({ url: event.target.value })}
                  />
                  <Input
                    aria-label={`${index + 1}行目のメモ`}
                    value={row.note}
                    placeholder="第2駐車場・日帰り客も可"
                    className="col-span-2 h-8 md:col-span-1"
                    onChange={event => change({ note: event.target.value })}
                  />
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addRows([toRow({})])}
            >
              <Plus className="size-4" />
              行を足す
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button type="button" disabled={!isDirty || isPending} onClick={save}>
            {isPending ? "保存中…" : "保存"}
          </Button>
          {isDirty && (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                setMessage(null);
                onDraftChange(null);
              }}
            >
              元に戻す
            </Button>
          )}
          {next && (
            <Button type="button" variant="ghost" onClick={onNext}>
              次へ：{next.name}
            </Button>
          )}
          {message && (
            <p
              role="status"
              className={cn(
                "text-sm",
                message.tone === "ok" ? "text-emerald-700" : "text-red-700",
              )}
            >
              {message.text}
            </p>
          )}
        </div>
      </section>

      <CandidateList
        candidates={resort.candidates}
        onAdd={added => addRows(added)}
      />
    </div>
  );
}

function CandidateList({
  candidates,
  onAdd,
}: {
  candidates: EvChargerCandidate[];
  onAdd: (rows: Row[]) => void;
}) {
  if (!candidates.length)
    return (
      <p className="rounded-xl border bg-white p-4 text-sm text-gray-500">
        調査データに近くの充電器の候補はありません。
      </p>
    );
  return (
    <section className="rounded-xl border bg-white">
      <h3 className="border-b px-4 py-2 text-sm font-bold">
        近くの充電器の候補（{candidates.length}件・近い順）
        <span className="ml-2 font-normal text-gray-500">
          スキー場の登録地点からの直線距離。同じ施設が両方のサイトに載っていることがあります
        </span>
      </h3>
      <ul className="divide-y">
        {candidates.map(candidate => {
          const rowsOf = (plugs: EvChargerCandidate["plugs"]) =>
            plugs.map(plug =>
              toRow({
                kind: plug.kind,
                kw: plug.kw ?? undefined,
                count: plug.count,
                operator: candidate.company,
                url: candidate.url,
                note: candidate.name,
              }),
            );
          return (
            <li
              key={`${candidate.source}-${candidate.url}`}
              className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2"
            >
              <span className="w-14 shrink-0 text-sm font-bold tabular-nums">
                {candidate.distanceM}m
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span
                    className={cn(
                      "mr-1.5 rounded px-1.5 py-0.5 text-[0.6875rem] font-semibold",
                      candidate.source === "GoGoEV"
                        ? "bg-orange-100 text-orange-800"
                        : "bg-sky-100 text-sky-800",
                    )}
                  >
                    {candidate.source}
                  </span>
                  <span className="font-medium">{candidate.name}</span>
                  {candidate.company && (
                    <span className="ml-1 text-gray-500">
                      / {candidate.company}
                    </span>
                  )}
                  <a
                    href={candidate.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="元のページを開く"
                    className="ml-1 inline-flex align-middle text-blue-700"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </p>
                {candidate.notes && (
                  <p className="text-xs text-gray-500">{candidate.notes}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {candidate.plugs.map((plug, index) => (
                    <button
                      // 同じ出力の口が並ぶことがあるので位置で区別する
                      // biome-ignore lint/suspicious/noArrayIndexKey: 並びは変わらない
                      key={index}
                      type="button"
                      title={`${plug.label} を1行として足す`}
                      onClick={() => onAdd(rowsOf([plug]))}
                      className={cn(
                        "inline-flex h-6 items-center gap-0.5 rounded-full border px-2 text-xs font-semibold hover:bg-emerald-50",
                        plug.kind === "quick"
                          ? "border-emerald-600 text-emerald-800"
                          : "border-gray-300 text-gray-700",
                      )}
                    >
                      <Plus className="size-3" />
                      {plug.kw
                        ? formatEvChargerOutput({
                            kind: plug.kind,
                            kw: plug.kw,
                            count: plug.count,
                          })
                        : `${plug.label}×${plug.count}（出力不明）`}
                    </button>
                  ))}
                </div>
              </div>
              {candidate.plugs.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => onAdd(rowsOf(candidate.plugs))}
                >
                  全部足す
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
