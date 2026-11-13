"use client";

import { Check, ListPlus, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getResortLabelName } from "@/lib/resortAliases";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type { MapSkiResort } from "@/types/skiResorts";
import { useCompareLists } from "./CompareListsProvider";
import type { CompareListSummary } from "./types";

/** 保存済みリストに、比較画面を閉じずにスキー場を追加する。 */
export function AddCompareListResortsButton({
  listId,
  resorts,
  onSaved,
}: {
  listId: string;
  resorts: MapSkiResort[];
  onSaved: (list: CompareListSummary) => void;
}) {
  const lists = useCompareLists();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  if (!lists) return null;
  const list = lists.lists.find(item => item.id === listId);
  const existing = new Set(list?.resortIds ?? []);
  const terms = keyword.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const candidates = resorts.filter(resort => {
    if (existing.has(resort.id)) return false;
    const text = [
      resort.nameJa,
      resort.shortName,
      resort.reading,
      resort.prefecture,
      resort.town,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
  const toAdd = selected.filter(id => !existing.has(id));
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="size-7 shrink-0 gap-1 rounded-md border-blue-600 p-0 text-xs font-semibold text-blue-700 hover:bg-blue-50 md:h-8 md:w-auto md:px-2 md:text-sm"
        aria-label="比較リストにスキー場を追加"
        title="比較リストにスキー場を追加"
        onClick={() => {
          setSelected([]);
          setKeyword("");
          setOpen(true);
        }}
      >
        <ListPlus className="size-4" />
        <span className="hidden md:inline">追加</span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!busy.current) setOpen(value);
        }}
      >
        <DialogContent
          className="z-[1000] flex max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-hidden sm:max-w-sm"
          overlayClassName="z-[999]"
          closeDisabled={saving}
        >
          <DialogTitle>スキー場を追加</DialogTitle>
          <DialogDescription className="text-sm md:text-sm">
            「{list?.name ?? "比較リスト"}」に追加するスキー場を選んでください。
          </DialogDescription>
          <Input
            autoFocus
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            placeholder="スキー場名・都道府県で検索"
            aria-label="追加するスキー場を検索"
            disabled={saving}
          />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {!lists.ready ? (
              <LoadingSpinner text="比較リストを読み込み中..." />
            ) : !list ? (
              <p className="py-4 text-sm text-gray-500">
                比較リストを読み込めませんでした。開き直してください。
              </p>
            ) : candidates.length === 0 ? (
              <p className="py-4 text-sm text-gray-500">
                追加できるスキー場がありません。
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
                        disabled={saving}
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
                            {getResortLabelName(
                              resort.id,
                              resort.nameJa,
                              resort.shortName,
                            )}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {[resort.prefecture, resort.town]
                              .filter(Boolean)
                              .join(" ")}
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
          <div className="flex shrink-0 justify-end gap-2">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              disabled={!lists.ready || !list || !toAdd.length || saving}
              onClick={async () => {
                if (busy.current) return;
                busy.current = true;
                setSaving(true);
                const saved = await lists.addResorts(listId, toAdd);
                busy.current = false;
                setSaving(false);
                if (!saved) return;
                setOpen(false);
                onSaved(saved);
              }}
            >
              {saving && <LoaderCircle className="size-4 animate-spin" />}
              {toAdd.length ? `${toAdd.length}件を追加` : "追加"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
