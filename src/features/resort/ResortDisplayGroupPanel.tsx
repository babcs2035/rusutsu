"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getResortLabelName } from "@/lib/resortAliases";
import type { AdminSkiResortRecord } from "@/server/ski-resorts/adminContract";
import { isMergedSource } from "@/server/ski-resorts/adminContract";
import type { DisplayGroup } from "@/server/ski-resorts/displayGroupContract";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import {
  deleteDisplayGroupFromAdmin,
  listDisplayGroupsFromAdmin,
  saveDisplayGroupFromAdmin,
} from "./displayGroupActions";

export type DisplayGroupDraft = {
  id?: string;
  updatedAt?: string;
  label: string;
  ids: string[];
  /** スキー場ごとの表示名（空欄なら短縮名） */
  labels?: Record<string, string>;
};

/**
 * 詳細画面の「〇〇も同時に表示」で合わせて見るスキー場の組。
 * 開いているスキー場が入っている組の一覧と、追加・編集・削除。
 */
export function ResortDisplayGroupPanel({
  resort,
  resorts,
  onMessage,
}: {
  resort: AdminSkiResortRecord;
  resorts: AdminSkiResortRecord[];
  onMessage: (message: string) => void;
}) {
  const [groups, setGroups] = useState<DisplayGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DisplayGroupDraft | null>(null);
  const [deleting, setDeleting] = useState<DisplayGroup | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void listDisplayGroupsFromAdmin().then(result => {
      if (!active) return;
      if (result.status === "ok") setGroups(result.groups);
      else setError(result.message);
    });
    return () => {
      active = false;
    };
  }, []);

  const own = (groups ?? []).filter(group =>
    group.members.some(member => member.id === resort.id),
  );

  const remove = (group: DisplayGroup) =>
    startTransition(async () => {
      setError(null);
      const result = await deleteDisplayGroupFromAdmin({
        id: group.id,
        expectedUpdatedAt: group.updatedAt,
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setGroups(current => current?.filter(item => item.id !== group.id) ?? []);
      onMessage("同時表示の組を削除しました。");
    });

  return (
    <section
      aria-label="地図の同時表示"
      className="shrink-0 space-y-2 border-b border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1">
          <span className="font-bold">地図の同時表示</span>
          ：詳細画面の「〇〇も同時に表示」で、地図・営業状況などを合わせて見られる組です。
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={groups === null || pending}
          onClick={() => setDraft({ label: "", ids: [resort.id] })}
        >
          組を追加
        </Button>
      </div>
      {own.map(group => (
        <div
          key={group.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-white/70 px-3 py-2"
        >
          <p className="min-w-0 flex-1">
            <span className="font-bold">
              {group.label ? `${group.label}で表示` : "表示名なし"}
            </span>
            ：{group.members.map(member => member.nameJa).join("・")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              setDraft({
                id: group.id,
                updatedAt: group.updatedAt,
                label: group.label ?? "",
                ids: group.members.map(member => member.id),
                labels: memberLabelsOf(group),
              })
            }
          >
            編集
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setDeleting(group)}
          >
            削除
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-red-800">
          {error}
        </p>
      )}
      {draft && (
        <DisplayGroupEditor
          draft={draft}
          resorts={resorts}
          onClose={() => setDraft(null)}
          onSaved={group => {
            setGroups(current => [
              ...(current ?? []).filter(item => item.id !== group.id),
              group,
            ]);
            setDraft(null);
            onMessage("同時表示の組を保存しました。");
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => {
          if (!open) setDeleting(null);
        }}
        title="同時表示の組を削除しますか？"
        description="組に入っているすべてのスキー場の詳細画面から、この「同時に表示」が消えます。スキー場のデータは変わりません。"
        confirmLabel="削除"
        cancelLabel="キャンセル"
        onConfirm={() => {
          if (deleting) remove(deleting);
          setDeleting(null);
        }}
      />
    </section>
  );
}

/** 組の各スキー場に付けた表示名（付けていないものは含めない） */
export const memberLabelsOf = (group: DisplayGroup) =>
  Object.fromEntries(
    group.members.flatMap(member =>
      member.label ? [[member.id, member.label]] : [],
    ),
  );

/**
 * 組のスキー場と、それぞれの表示名の入力欄。空欄なら短縮名を出す。
 * 志賀高原どうしのように短縮名が同じになる組で、区別できる名前を付ける。
 */
export function MemberLabelFields({
  resorts,
  labels,
  onLabelChange,
  onRemove,
}: {
  resorts: Array<Pick<AdminSkiResortRecord, "id" | "nameJa" | "shortName">>;
  labels: Record<string, string>;
  onLabelChange: (id: string, label: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <ul className="divide-y rounded-md border">
      {resorts.map(resort => (
        <li key={resort.id} className="flex items-center gap-2 p-2">
          <span className="w-[40%] min-w-0 shrink-0 text-sm">
            <span className="block truncate font-medium">{resort.nameJa}</span>
            <span className="block truncate text-gray-500 text-xs">
              {resort.id}
            </span>
          </span>
          <Input
            aria-label={`${resort.nameJa}の表示名`}
            className="h-8 min-w-0 flex-1"
            maxLength={100}
            placeholder={getResortLabelName(
              resort.id,
              resort.nameJa,
              resort.shortName,
            )}
            value={labels[resort.id] ?? ""}
            onChange={event => onLabelChange(resort.id, event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0"
            aria-label={`${resort.nameJa}を組から外す`}
            onClick={() => onRemove(resort.id)}
          >
            ×
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** 空欄を除いた、保存する表示名 */
export const filledLabels = (ids: string[], labels: Record<string, string>) =>
  Object.fromEntries(
    ids.flatMap(id => (labels[id]?.trim() ? [[id, labels[id].trim()]] : [])),
  );

export function DisplayGroupEditor({
  draft,
  resorts,
  onClose,
  onSaved,
}: {
  draft: DisplayGroupDraft;
  resorts: AdminSkiResortRecord[];
  onClose: () => void;
  onSaved: (group: DisplayGroup) => void;
}) {
  const [label, setLabel] = useState(draft.label);
  const [ids, setIds] = useState(draft.ids);
  const [labels, setLabels] = useState(draft.labels ?? {});
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // 公開中の単位（完全統合の結合元は除く）だけを選べる
  const eligible = resorts.filter(
    item => item.isActive && !isMergedSource(item),
  );
  const selected = ids.map(
    id =>
      resorts.find(item => item.id === id) ?? {
        id,
        nameJa: id,
        shortName: null,
      },
  );
  const keyword = query.trim().toLowerCase();
  const filtered = keyword
    ? eligible.filter(item =>
        `${item.nameJa} ${item.nameEn} ${item.id} ${item.prefecture}`
          .toLowerCase()
          .includes(keyword),
      )
    : eligible.filter(item => ids.includes(item.id));
  const canSave = !pending && ids.length >= 2;
  const toggle = (id: string) =>
    setIds(current =>
      current.includes(id)
        ? current.filter(value => value !== id)
        : [...current, id],
    );

  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await saveDisplayGroupFromAdmin({
        ...(draft.id
          ? { id: draft.id, expectedUpdatedAt: draft.updatedAt }
          : {}),
        label: label.trim() || null,
        memberLabels: filledLabels(ids, labels),
        resortIds: ids,
      });
      if (result.status === "error") setError(result.message);
      else onSaved(result.group);
    });

  return (
    <Dialog open onOpenChange={open => !open && !pending && onClose()}>
      <DialogContent className="flex max-h-[85dvh] w-[min(560px,94vw)] max-w-[560px] flex-col gap-3 sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {draft.id ? "同時表示の組を編集" : "同時表示の組を追加"}
          </DialogTitle>
        </DialogHeader>
        <label className="space-y-1">
          <span className="block font-semibold">
            表示名
            <span className="ml-1 font-normal text-gray-600 text-xs">
              （空欄なら相手の名前で「〇〇・△△も同時に表示」）
            </span>
          </span>
          <Input
            value={label}
            maxLength={100}
            placeholder="例: ニセコ全山"
            onChange={event => setLabel(event.target.value)}
          />
          {label.trim() && (
            <span className="block text-gray-600 text-xs">
              詳細画面では「{label.trim()}で表示」と出します。
            </span>
          )}
        </label>
        <div className="space-y-1">
          <p className="font-semibold">
            スキー場と表示名（{ids.length}件、2件以上）
            <span className="ml-1 font-normal text-gray-600 text-xs">
              空欄なら短縮名
            </span>
          </p>
          {ids.length > 0 && (
            <MemberLabelFields
              resorts={selected}
              labels={labels}
              onLabelChange={(id, value) =>
                setLabels(current => ({ ...current, [id]: value }))
              }
              onRemove={toggle}
            />
          )}
        </div>
        <Input
          type="search"
          aria-label="追加するスキー場を検索"
          placeholder="スキー場名・都道府県・IDで検索"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          {filtered.map(item => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-3 border-b p-2.5 hover:bg-blue-50"
            >
              <input
                type="checkbox"
                checked={ids.includes(item.id)}
                onChange={() => toggle(item.id)}
                className="size-4"
              />
              <span className="min-w-0">
                <span className="block font-medium">{item.nameJa}</span>
                <span className="block break-all text-gray-500 text-xs">
                  {item.prefecture} / {item.id}
                </span>
              </span>
            </label>
          ))}
          {!filtered.length && (
            <p className="p-3 text-gray-500">
              {keyword
                ? "一致するスキー場がありません。"
                : "検索して追加するスキー場を選んでください。"}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-red-800">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            キャンセル
          </Button>
          <Button type="button" disabled={!canSave} onClick={save}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
