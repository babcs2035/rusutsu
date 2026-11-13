"use client";

import { ListMinus, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useHomeCompare } from "@/features/home/compareContext";
import { useCompareLists } from "./CompareListsProvider";

/** 保存した比較リストだけを編集し、お気に入りには触れない。 */
export function CompareListResortButton({
  resortId,
  name,
}: {
  resortId: string;
  name: string;
}) {
  const compare = useHomeCompare();
  const lists = useCompareLists();
  const busy = useRef(false);
  const [removing, setRemoving] = useState(false);
  if (compare?.source.kind !== "list" || !lists) return null;
  const listId = compare.source.id;
  const label = `${name}を比較リストから外す`;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="-my-1 size-7 shrink-0 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
      aria-label={label}
      title={label}
      disabled={!lists.ready || removing}
      onClick={async () => {
        if (busy.current) return;
        busy.current = true;
        setRemoving(true);
        const saved = await lists.removeResort(listId, resortId);
        busy.current = false;
        setRemoving(false);
        if (saved) compare.onListSaved(saved);
      }}
    >
      {removing ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <ListMinus className="size-5" />
      )}
    </Button>
  );
}
