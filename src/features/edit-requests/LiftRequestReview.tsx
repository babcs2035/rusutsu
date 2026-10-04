"use client";

import { type ReactNode, useEffect, useId, useState } from "react";
import type { LiftReview } from "./liftReview";

const statusLabel = {
  added: "追加",
  removed: "削除",
  changed: "変更あり",
  unchanged: "変更なし",
} as const;

export function LiftRequestReview({
  review,
  selectedId,
  onSelect,
  editor,
  extraContent,
}: {
  review: LiftReview;
  selectedId: string | null;
  onSelect: (id: string) => void;
  editor?: ReactNode;
  extraContent?: ReactNode;
}) {
  const [onlyChanged, setOnlyChanged] = useState(false);
  const tabId = useId();
  const selected = review.items.find(item => item.id === selectedId);
  useEffect(() => {
    if (selectedId && selected?.status === "unchanged") setOnlyChanged(false);
  }, [selectedId, selected?.status]);
  const visible = onlyChanged
    ? review.items.filter(item => item.status !== "unchanged")
    : review.items;
  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label="リフトの申請内容"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-900">
            リフト {review.items.length}件
          </span>
          <span className="ml-2">変更 {review.changedCount}件</span>
          {review.orderChanged && (
            <span className="ml-2 text-amber-700">表示順も変更</span>
          )}
        </p>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={onlyChanged}
            onChange={event => {
              setOnlyChanged(event.target.checked);
              if (event.target.checked && selected?.status === "unchanged") {
                const first = review.items.find(
                  item => item.status !== "unchanged",
                );
                if (first) onSelect(first.id);
              }
            }}
          />
          変更のみ
        </label>
      </div>
      <div
        role="tablist"
        aria-label="リフト一覧"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 p-2"
      >
        {visible.map(item => (
          <button
            key={item.id}
            id={`${tabId}-${item.id}`}
            type="button"
            role="tab"
            aria-controls={`${tabId}-panel`}
            aria-selected={selectedId === item.id}
            tabIndex={selectedId === item.id ? 0 : -1}
            onClick={() => onSelect(item.id)}
            onKeyDown={event => {
              const index = visible.findIndex(row => row.id === item.id);
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % visible.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + visible.length) % visible.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? visible.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              onSelect(visible[next].id);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
                [next]?.focus();
            }}
            className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs ${selectedId === item.id ? "border-blue-400 bg-white font-semibold text-blue-950 shadow-sm" : "border-transparent text-slate-600 hover:bg-white"}`}
          >
            {item.status !== "unchanged" && (
              <span
                className={`h-1.5 w-1.5 rounded-full ${item.status === "removed" ? "bg-rose-500" : "bg-amber-500"}`}
              />
            )}
            {item.name}
          </button>
        ))}
        {!visible.length && (
          <p className="p-2 text-xs text-slate-500">
            変更があるリフトはありません。
          </p>
        )}
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
        data-request-content="true"
      >
        {selected && (!onlyChanged || selected.status !== "unchanged") && (
          <article
            role="tabpanel"
            id={`${tabId}-panel`}
            aria-labelledby={`${tabId}-${selected.id}`}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-950">
                {selected.name}
              </h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${selected.status === "unchanged" ? "bg-slate-100 text-slate-600" : selected.status === "removed" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}
              >
                {editor ? "編集中" : statusLabel[selected.status]}
              </span>
            </div>
            {editor ?? (
              <>
                {(selected.movedFrom || selected.movedTo) && (
                  <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                    所属スキー場: {selected.movedFrom} → {selected.movedTo}
                  </p>
                )}
                {selected.geometryChanged && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                    地図上の線・位置を変更しています。
                  </p>
                )}
                <dl className="grid grid-cols-2 gap-2">
                  {selected.fields.map(field => (
                    <div
                      key={field.key}
                      className={`min-w-0 rounded-lg border px-3 py-2 ${["name", "note", "searchWord", "link"].includes(field.key) ? "col-span-2" : ""} ${field.changed ? "border-amber-300 bg-amber-50" : "border-slate-100 bg-slate-50"}`}
                    >
                      <dt className="text-[11px] font-medium text-slate-600">
                        {field.label}
                        {field.changed && (
                          <span className="ml-1.5 text-amber-700">変更</span>
                        )}
                      </dt>
                      <dd className="mt-1 break-words text-sm text-slate-900">
                        {selected.status === "removed" ? (
                          field.before
                        ) : (
                          <>
                            {field.changed && selected.status !== "added" && (
                              <span className="mr-2 text-xs text-slate-500 line-through">
                                {field.before}
                              </span>
                            )}
                            <span
                              className={field.changed ? "font-semibold" : ""}
                            >
                              {field.after}
                            </span>
                          </>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div
                  className={`rounded-lg border p-3 ${selected.mappingChanged ? "border-amber-200 bg-amber-50" : "border-slate-200"}`}
                >
                  <h3 className="text-xs font-semibold text-slate-800">
                    営業情報との対応
                    {selected.mappingChanged && (
                      <span className="ml-2 text-amber-700">変更</span>
                    )}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    公式ページの名前:{" "}
                    <span className="text-slate-900">
                      {selected.mappingNames.join("、") || "未対応"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    地図上の名前:{" "}
                    <span className="text-slate-900">
                      {selected.mapName ?? selected.name}
                    </span>
                  </p>
                </div>
              </>
            )}
          </article>
        )}
        {extraContent && <div className="mt-4">{extraContent}</div>}
      </div>
    </section>
  );
}
