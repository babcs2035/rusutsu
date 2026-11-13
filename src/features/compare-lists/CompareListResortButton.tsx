"use client";

import { useRef, useState } from "react";
import { useHomeCompare } from "@/features/home/compareContext";
import { CompareResortButton } from "@/shared/components/CompareResortButton";
import { useCompareLists } from "./CompareListsProvider";

/**
 * 保存した比較リストだけを編集し、お気に入りには触れない。
 * 外してもカードはタブを切り替えるまで残し、もう一度押せば戻せる。
 */
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
  const [saving, setSaving] = useState(false);
  if (compare?.source.kind !== "list" || !lists) return null;
  const listId = compare.source.id;
  const list = lists.lists.find(item => item.id === listId);
  const isSelected = list ? list.resortIds.includes(resortId) : true;
  return (
    <CompareResortButton
      isSelected={isSelected}
      resortName={name}
      size="sm"
      className="h-6 min-w-16 rounded-lg text-xs transition-smooth"
      disabled={!lists.ready || saving}
      onClick={async () => {
        if (busy.current) return;
        busy.current = true;
        setSaving(true);
        if (isSelected) await lists.removeResort(listId, resortId);
        else await lists.addResorts(listId, [resortId]);
        busy.current = false;
        setSaving(false);
      }}
    />
  );
}
