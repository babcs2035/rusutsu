"use client";

import { ListPlus, LoaderCircle } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFavorites } from "@/features/favorites/FavoritesProvider";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { useCompareLists } from "./CompareListsProvider";
import {
  COMPARE_LIST_NAME_MAX,
  type CompareListSummary,
  type CompareSource,
} from "./types";

/** 比較画面の選択中スキー場を、既存または新しい比較リストへ保存する。 */
export function SaveCompareListButton({
  resortIds,
  source,
  onSaved,
}: {
  resortIds: string[];
  source: CompareSource;
  onSaved: (list: CompareListSummary) => void;
}) {
  const compareLists = useCompareLists();
  const favorites = useFavorites();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState<"add" | "create" | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const busy = useRef(false);
  if (!compareLists || source.kind !== "selection") return null;

  const trimmed = name.trim();
  const saveNew = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!trimmed || busy.current) return;
    busy.current = true;
    setSaving("create");
    const saved = await compareLists.save({ name: trimmed, resortIds });
    busy.current = false;
    setSaving(null);
    if (!saved) return;
    setOpen(false);
    onSaved(saved);
  };
  const addToList = async (list: CompareListSummary) => {
    if (busy.current) return;
    busy.current = true;
    setAddingId(list.id);
    setSaving("add");
    const saved = await compareLists.addResorts(list.id, resortIds);
    busy.current = false;
    setAddingId(null);
    setSaving(null);
    if (!saved) return;
    setOpen(false);
    onSaved(saved);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="size-7 shrink-0 rounded-md border-blue-600 p-0 text-blue-700 hover:bg-blue-50 hover:text-blue-800 md:h-8 md:w-auto md:gap-1 md:px-2"
        aria-label="この比較をリストに保存"
        title="リストに保存"
        disabled={resortIds.length === 0}
        onClick={() => {
          setName("");
          setOpen(true);
        }}
      >
        <ListPlus className="size-4" />
        <span className="hidden text-xs font-semibold md:inline md:text-sm">
          リストに保存
        </span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={nextOpen => {
          if (busy.current) return;
          setOpen(nextOpen);
        }}
      >
        <DialogContent
          className="z-[1000] max-h-[85dvh] overflow-y-auto sm:max-w-sm"
          overlayClassName="z-[999]"
          closeDisabled={!!saving}
        >
          <DialogTitle>比較リストに保存</DialogTitle>
          <DialogDescription className="sr-only">
            追加先の比較リストを選ぶか、新しいリストを作成します。
          </DialogDescription>
          {!compareLists.ready ? (
            <div className="h-40">
              <LoadingSpinner text="リストを読み込み中..." />
            </div>
          ) : !compareLists.userId ? (
            <>
              <p className="text-sm text-gray-600">
                比較リストはアカウントに保存します。ログインすると、この
                {resortIds.length}件の比較を保存できます。
              </p>
              <Button
                className="font-semibold"
                disabled={!favorites}
                onClick={() => favorites?.login()}
              >
                ログインして保存
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">既存のリストに追加</h3>
                <p className="text-sm text-muted-foreground">
                  {resortIds.length}件のスキー場を追加します。
                </p>
                {compareLists.lists.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    保存済みリストはありません。
                  </p>
                ) : (
                  <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                    {compareLists.lists.map(list => {
                      const missing = resortIds.filter(
                        id => !list.resortIds.includes(id),
                      );
                      const complete = missing.length === 0;
                      return (
                        <li key={list.id}>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-auto min-h-9 w-full justify-between gap-2 text-left"
                            disabled={complete || !!saving}
                            onClick={() => void addToList(list)}
                          >
                            <span className="min-w-0 truncate">
                              {list.name}
                            </span>
                            {addingId === list.id ? (
                              <span className="flex shrink-0 items-center gap-1 text-xs">
                                <LoaderCircle className="size-4 animate-spin" />
                                追加中...
                              </span>
                            ) : (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {complete ? "登録済み" : "追加"}
                              </span>
                            )}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              <form
                className="flex flex-col gap-2 border-t pt-3"
                onSubmit={event => void saveNew(event)}
              >
                <h3 className="text-sm font-semibold">新しいリストを作成</h3>
                <Input
                  autoFocus={compareLists.lists.length === 0}
                  value={name}
                  maxLength={COMPARE_LIST_NAME_MAX}
                  placeholder="例: 北海道でよく行くスキー場"
                  aria-label="新しいリストの名前"
                  disabled={!!saving}
                  onChange={event => setName(event.target.value)}
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={!trimmed || !!saving}>
                    {saving === "create" && (
                      <LoaderCircle className="size-4 animate-spin" />
                    )}
                    {saving === "create" ? "作成中..." : "作成して保存"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
