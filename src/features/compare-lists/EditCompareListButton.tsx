"use client";

import {
  Check,
  List,
  LoaderCircle,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterConditionFields } from "@/features/filters/components/FilterConditionFields";
import { DEFAULT_FILTERS } from "@/features/filters/constants";
import type { Filters } from "@/features/filters/types";
import {
  isFilterActive,
  matchesFilters,
} from "@/features/filters/utils/filterResorts";
import { getResortLabelName } from "@/lib/resortAliases";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { PanelCloseButton } from "@/shared/components/PanelCloseButton";
import type { MapSkiResort } from "@/types/skiResorts";
import { useCompareLists } from "./CompareListsProvider";
import { COMPARE_LIST_NAME_MAX, type CompareListSummary } from "./types";

const resortName = (resort: MapSkiResort) =>
  getResortLabelName(resort.id, resort.nameJa, resort.shortName);

const resortLocation = (resort: MapSkiResort) =>
  [resort.prefecture, resort.town].filter(Boolean).join(" ");

/**
 * 保存済みの比較リストを、比較画面を閉じずに編集する。
 * 名前の変更・削除・追加は、操作したその場でリストへ反映する。
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
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"edit" | "add">("edit");
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<MapSkiResort | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const busy = useRef(false);
  if (!lists) return null;
  const list = lists.lists.find(item => item.id === listId);
  const resortById = new Map(resorts.map(resort => [resort.id, resort]));
  const members = (list?.resortIds ?? []).flatMap(id => {
    const resort = resortById.get(id);
    return resort ? [resort] : [];
  });
  const existing = new Set(list?.resortIds ?? []);
  const candidates = resorts.filter(
    resort => !existing.has(resort.id) && matchesFilters(resort, filters),
  );
  const toAdd = selected.filter(id => !existing.has(id));
  // 閉じていても、キーワード以外の条件で絞っていることが分かるようにする
  const hasConditions = isFilterActive({ ...filters, keyword: "" });
  const saving = renaming || adding || removingId !== null;

  const commitName = async () => {
    if (!list) return;
    const next = name.trim();
    if (!next || next === list.name) {
      setName(list.name);
      return;
    }
    if (busy.current) return;
    busy.current = true;
    setRenaming(true);
    const saved = await lists.rename(listId, next);
    busy.current = false;
    setRenaming(false);
    if (!saved) {
      setName(list.name);
      return;
    }
    setName(saved.name);
    onSaved(saved);
  };

  const removeResort = async (resortId: string) => {
    if (busy.current) return;
    busy.current = true;
    setRemovingId(resortId);
    const saved = await lists.removeResort(listId, resortId);
    busy.current = false;
    setRemovingId(null);
    if (saved) onSaved(saved);
  };

  const addSelected = async () => {
    if (busy.current) return;
    busy.current = true;
    setAdding(true);
    const saved = await lists.addResorts(listId, toAdd);
    busy.current = false;
    setAdding(false);
    if (!saved) return;
    onSaved(saved);
    setView("edit");
  };

  const openAddView = () => {
    setSelected([]);
    setFilters(DEFAULT_FILTERS);
    setConditionsOpen(false);
    setView("add");
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn(
          "h-8 shrink-0 gap-1 rounded-md border-blue-600 px-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50",
          className,
        )}
        aria-label="比較リストを編集"
        onClick={() => {
          setView("edit");
          setName(list?.name ?? "");
          setOpen(true);
        }}
      >
        <List className="size-4" />
        編集
      </Button>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (busy.current) return;
          // 条件の画面を重ねているときは、Esc などで条件の画面だけを閉じる
          if (!value && conditionsOpen) {
            setConditionsOpen(false);
            return;
          }
          // 追加画面の×・Esc・外側のタップは、モーダルを閉じずに編集画面へ戻る
          if (!value && view === "add") {
            setView("edit");
            return;
          }
          setOpen(value);
        }}
      >
        <DialogContent
          className={cn(
            "z-[1000] flex max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-hidden sm:max-w-md",
            view === "add" &&
              "h-[calc(100dvh-2rem)] md:h-[min(44rem,calc(100dvh-4rem))]",
          )}
          overlayClassName="z-[999]"
          showCloseButton={false}
        >
          {view === "edit" ? (
            <>
              <div className="flex shrink-0 items-center gap-2">
                <DialogTitle className="pr-0">比較リストを編集</DialogTitle>
                <div className="ml-auto">
                  <PanelCloseButton
                    disabled={saving}
                    onClose={() => setOpen(false)}
                  />
                </div>
              </div>
              <DialogDescription className="sr-only">
                リスト名の変更と、スキー場の追加・削除ができます。変更はすぐに保存されます。
              </DialogDescription>
              {!lists.ready ? (
                <LoadingSpinner text="比較リストを読み込み中..." />
              ) : !list ? (
                <p className="py-4 text-sm text-gray-500">
                  比較リストを読み込めませんでした。開き直してください。
                </p>
              ) : (
                <>
                  <form
                    className="flex shrink-0 flex-col gap-1"
                    onSubmit={(event: FormEvent) => {
                      event.preventDefault();
                      void commitName();
                    }}
                  >
                    <Label
                      htmlFor={`compare-list-name-${listId}`}
                      className="text-base font-bold text-gray-900"
                    >
                      リスト名
                    </Label>
                    <div className="relative">
                      <Input
                        id={`compare-list-name-${listId}`}
                        value={name}
                        maxLength={COMPARE_LIST_NAME_MAX}
                        enterKeyHint="done"
                        disabled={renaming}
                        className="pr-9"
                        onChange={event => setName(event.target.value)}
                        onBlur={() => void commitName()}
                      />
                      {renaming && (
                        <LoaderCircle className="absolute inset-y-0 right-3 my-auto size-4 animate-spin text-gray-500" />
                      )}
                    </div>
                  </form>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-base font-bold text-gray-900">
                      一覧
                      <span className="ml-1 text-sm font-normal tabular-nums text-gray-500">
                        {members.length}件
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 gap-1 rounded-md border-blue-600 px-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                      disabled={saving}
                      onClick={openAddView}
                    >
                      <Plus className="size-4" strokeWidth={2.5} />
                      追加
                    </Button>
                  </div>
                  <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {members.length === 0 ? (
                      <p className="px-1 py-4 text-sm text-gray-500">
                        スキー場がありません。「追加」から選んでください。
                      </p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {members.map(resort => {
                          const removing = removingId === resort.id;
                          return (
                            <li
                              key={resort.id}
                              className={cn(
                                "flex items-center gap-2 px-1 py-1.5",
                                removing && "opacity-50",
                              )}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">
                                  {resortName(resort)}
                                </span>
                                <span className="block truncate text-xs text-gray-500">
                                  {resortLocation(resort)}
                                </span>
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0 text-gray-500 hover:text-red-600"
                                aria-label={`${resortName(resort)}を比較リストから削除`}
                                disabled={saving}
                                onClick={() => setConfirming(resort)}
                              >
                                {removing ? (
                                  <LoaderCircle className="size-4 animate-spin" />
                                ) : (
                                  <Trash2 className="size-4" />
                                )}
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-2">
                <DialogTitle className="pr-0">スキー場を追加</DialogTitle>
                <div className="ml-auto">
                  <PanelCloseButton
                    label="編集に戻る"
                    disabled={adding}
                    onClose={() => setView("edit")}
                  />
                </div>
              </div>
              <DialogDescription className="sr-only">
                「{list?.name ?? "比較リスト"}
                」に追加するスキー場を選んでください。
              </DialogDescription>
              <div className="relative shrink-0">
                <Input
                  autoFocus
                  className={cn(
                    "h-10 w-full border border-gray-200 bg-gray-50 text-gray-800 placeholder:text-gray-400 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10",
                    filters.keyword ? "pr-9" : "pr-3",
                  )}
                  value={filters.keyword}
                  onChange={event =>
                    setFilters({ ...filters, keyword: event.target.value })
                  }
                  placeholder="スキー場名を入力"
                  aria-label="追加するスキー場を検索"
                  disabled={adding}
                />
                {filters.keyword && (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="検索キーワードをクリア"
                    className="absolute inset-y-0 right-1.5 my-auto flex h-7 w-7 min-w-7 items-center justify-center rounded-full p-0 text-gray-600 shadow-none hover:bg-gray-100 hover:text-gray-700"
                    onClick={() => setFilters({ ...filters, keyword: "" })}
                  >
                    <X size={15} strokeWidth={2.5} />
                  </Button>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  aria-haspopup="dialog"
                  className={cn(
                    "h-8 gap-1.5 border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50",
                    hasConditions &&
                      "border-blue-600 font-semibold text-blue-700 hover:bg-blue-50",
                  )}
                  disabled={adding}
                  onClick={() => setConditionsOpen(true)}
                >
                  <SlidersHorizontal size={14} />
                  {hasConditions ? "検索条件を変更" : "検索条件を追加"}
                </Button>
                <Badge
                  variant="secondary"
                  className="ml-auto h-[26px] bg-blue-50 px-2.5 text-xs leading-none font-black text-blue-900"
                >
                  {candidates.length.toLocaleString()}件
                </Badge>
              </div>
              <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-1">
                {candidates.length === 0 ? (
                  <p className="py-4 text-sm text-gray-500">
                    条件に合う追加できるスキー場がありません。
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {candidates.map(resort => {
                      const checked = selected.includes(resort.id);
                      return (
                        <li key={resort.id}>
                          <button
                            type="button"
                            aria-pressed={checked}
                            disabled={adding}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-1 py-2 text-left hover:bg-blue-50 disabled:opacity-50",
                              checked && "bg-blue-50",
                            )}
                            onClick={() =>
                              setSelected(previous =>
                                checked
                                  ? previous.filter(id => id !== resort.id)
                                  : [...previous, resort.id],
                              )
                            }
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold">
                                {resortName(resort)}
                              </span>
                              <span className="block text-xs text-gray-500">
                                {resortLocation(resort)}
                              </span>
                            </span>
                            {checked && (
                              <Check className="size-4 shrink-0 text-blue-700" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="shrink-0">
                <Button
                  className="h-10 w-full font-bold"
                  disabled={!lists.ready || !list || !toAdd.length || adding}
                  onClick={() => void addSelected()}
                >
                  {adding && <LoaderCircle className="size-4 animate-spin" />}
                  {toAdd.length
                    ? `${toAdd.length}件を追加`
                    : "追加するスキー場を選んでください"}
                </Button>
              </div>
              {/* 条件は追加画面の上に重ね、選択中のスキー場と一覧の位置はそのまま残す */}
              {conditionsOpen && (
                <section
                  aria-label="検索条件"
                  className="absolute inset-0 flex flex-col gap-3 rounded-lg bg-popover p-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-150"
                >
                  <div className="flex shrink-0 items-center gap-2">
                    <h2 className="text-base leading-snug font-bold text-gray-900 md:text-lg">
                      検索条件
                    </h2>
                    <Button
                      type="button"
                      variant="outline"
                      className="ml-auto h-8 gap-1.5 border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-700"
                      disabled={!hasConditions}
                      onClick={() =>
                        setFilters({
                          ...DEFAULT_FILTERS,
                          keyword: filters.keyword,
                        })
                      }
                    >
                      <RotateCcw size={14} />
                      条件をクリア
                    </Button>
                    <PanelCloseButton
                      label="スキー場の選択に戻る"
                      onClose={() => setConditionsOpen(false)}
                    />
                  </div>
                  <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-1 pb-1">
                    <FilterConditionFields
                      filters={filters}
                      resorts={resorts}
                      onFilterChange={setFilters}
                    />
                  </div>
                  <Button
                    className="h-10 w-full shrink-0 font-bold"
                    onClick={() => setConditionsOpen(false)}
                  >
                    {candidates.length.toLocaleString()}件を表示
                  </Button>
                </section>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!confirming}
        onOpenChange={value => {
          if (!value) setConfirming(null);
        }}
        title="比較リストから消しますか？"
        description={
          confirming
            ? `「${resortName(confirming)}」を「${list?.name ?? "比較リスト"}」から外します。`
            : ""
        }
        confirmLabel="消す"
        onConfirm={() => {
          if (confirming) void removeResort(confirming.id);
        }}
        className="z-[1001]"
        overlayClassName="z-[1000]"
      />
    </>
  );
}
