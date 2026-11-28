"use client";

import { LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Input } from "@/components/ui/input";
import type { MapSkiResort } from "@/types/skiResorts";
import { useCompareLists } from "./CompareListsProvider";
import { ResortListEditButton } from "./ResortListEditButton";
import { COMPARE_LIST_NAME_MAX, type CompareListSummary } from "./types";

/**
 * 保存済みの比較リストを、比較画面を閉じずに編集する。
 * 名前の変更・削除・追加・並び替えは、操作したその場でリストへ反映する。
 */
export function EditCompareListButton({
  listId,
  resorts,
  onSaved,
  className,
}: {
  listId: string;
  resorts: MapSkiResort[];
  onSaved: (list: CompareListSummary) => void;
  className?: string;
}) {
  const lists = useCompareLists();
  if (!lists) return null;
  const list = lists.lists.find(item => item.id === listId);
  const saved = (next: CompareListSummary | null) => {
    if (next) onSaved(next);
    return !!next;
  };
  return (
    <ResortListEditButton
      listLabel="比較リスト"
      targetName={list?.name ?? "比較リスト"}
      resorts={resorts}
      memberIds={list?.resortIds ?? []}
      ready={lists.ready}
      missing={!list}
      className={className}
      renderHeader={({ disabled, setBusy }) =>
        list && (
          <CompareListNameField
            list={list}
            disabled={disabled}
            setBusy={setBusy}
            rename={lists.rename}
            onSaved={onSaved}
          />
        )
      }
      onAdd={async ids => saved(await lists.addResorts(listId, ids))}
      onRemove={async id => saved(await lists.removeResort(listId, id))}
      onReorder={async ids => saved(await lists.reorder(listId, ids))}
    />
  );
}

/** リスト名。欄を離れる・確定したときに保存する */
function CompareListNameField({
  list,
  disabled,
  setBusy,
  rename,
  onSaved,
}: {
  list: CompareListSummary;
  disabled: boolean;
  setBusy: (busy: boolean) => void;
  rename: (id: string, name: string) => Promise<CompareListSummary | null>;
  onSaved: (list: CompareListSummary) => void;
}) {
  const [name, setName] = useState(list.name);
  const [renaming, setRenaming] = useState(false);

  const commitName = async () => {
    const next = name.trim();
    if (!next || next === list.name) {
      setName(list.name);
      return;
    }
    if (renaming || disabled) return;
    setRenaming(true);
    setBusy(true);
    const saved = await rename(list.id, next);
    setRenaming(false);
    setBusy(false);
    if (!saved) {
      setName(list.name);
      return;
    }
    setName(saved.name);
    onSaved(saved);
  };

  return (
    <form
      className="flex shrink-0 flex-col gap-1"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void commitName();
      }}
    >
      <label
        htmlFor={`compare-list-name-${list.id}`}
        className="text-base font-bold text-gray-900"
      >
        リスト名
      </label>
      <div className="relative">
        <Input
          id={`compare-list-name-${list.id}`}
          value={name}
          maxLength={COMPARE_LIST_NAME_MAX}
          enterKeyHint="done"
          disabled={renaming || disabled}
          className="pr-9"
          onChange={event => setName(event.target.value)}
          onBlur={() => void commitName()}
        />
        {renaming && (
          <LoaderCircle className="absolute inset-y-0 right-3 my-auto size-4 animate-spin text-gray-500" />
        )}
      </div>
    </form>
  );
}
