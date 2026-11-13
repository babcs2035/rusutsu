"use client";

import { ListPlus, LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFavorites } from "@/features/favorites/FavoritesProvider";
import { useCompareLists } from "./CompareListsProvider";
import {
  COMPARE_LIST_NAME_MAX,
  type CompareListSummary,
  type CompareSource,
} from "./types";

/**
 * 比較画面の見出し行に置く「リストに保存」。押すと名前を付けて保存する。
 * 保存したリストから開いたときは、同じリストへの上書きと別名での保存を選べる。
 */
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
  const [saving, setSaving] = useState<"update" | "create" | null>(null);
  if (!compareLists) return null;
  const listSource = source.kind === "list" ? source : null;
  const trimmed = name.trim();
  const save = async (mode: "update" | "create") => {
    if (!trimmed || saving) return;
    setSaving(mode);
    const saved = await compareLists.save({
      id: mode === "update" ? listSource?.id : null,
      name: trimmed,
      resortIds,
    });
    setSaving(null);
    if (!saved) return;
    setOpen(false);
    onSaved(saved);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save(listSource ? "update" : "create");
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-7 shrink-0 gap-1 rounded-md border-blue-600 px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 hover:text-blue-800 md:h-8 md:text-sm"
        aria-label="この比較をリストに保存"
        disabled={resortIds.length === 0}
        onClick={() => {
          setName(
            listSource?.name ??
              (source.kind === "favorites" ? "お気に入り" : ""),
          );
          setOpen(true);
        }}
      >
        <ListPlus className="size-4" />
        <span className="md:hidden">保存</span>
        <span className="hidden md:inline">リストに保存</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="z-[1000] sm:max-w-sm"
          overlayClassName="z-[999]"
        >
          <DialogTitle>
            {listSource ? "比較リストを保存" : "比較リストに保存"}
          </DialogTitle>
          {!compareLists.userId ? (
            <>
              <DialogDescription>
                比較リストはアカウントに保存します。ログインすると、この
                {resortIds.length}件の比較をそのまま保存できます。
              </DialogDescription>
              <Button
                className="font-semibold"
                disabled={!favorites}
                onClick={() => favorites?.login()}
              >
                ログインして保存
              </Button>
            </>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <DialogDescription>
                {resortIds.length}件のスキー場を、名前を付けて保存します。
              </DialogDescription>
              <Input
                autoFocus
                value={name}
                maxLength={COMPARE_LIST_NAME_MAX}
                placeholder="例: 北海道でよく行くスキー場"
                aria-label="リストの名前"
                onChange={event => setName(event.target.value)}
              />
              <div className="flex flex-wrap justify-end gap-2">
                {listSource ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!trimmed || !!saving}
                      onClick={() => void save("create")}
                    >
                      {saving === "create" && (
                        <LoaderCircle className="size-4 animate-spin" />
                      )}
                      新しいリストとして保存
                    </Button>
                    <Button type="submit" disabled={!trimmed || !!saving}>
                      {saving === "update" && (
                        <LoaderCircle className="size-4 animate-spin" />
                      )}
                      上書き保存
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpen(false)}
                    >
                      キャンセル
                    </Button>
                    <Button type="submit" disabled={!trimmed || !!saving}>
                      {saving && (
                        <LoaderCircle className="size-4 animate-spin" />
                      )}
                      保存
                    </Button>
                  </>
                )}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
