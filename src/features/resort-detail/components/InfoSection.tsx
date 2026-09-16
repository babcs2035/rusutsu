"use client";

import { Check, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CopyResortNameButton } from "@/shared/components/CopyResortNameButton";
import { FormerResortNames } from "@/shared/components/FormerResortNames";
import { RubyText } from "@/shared/components/RubyText";
import type { Resort } from "../types";

type ResortInfo = Pick<
  Resort,
  | "id"
  | "nameJa"
  | "nameRuby"
  | "formerNames"
  | "prefecture"
  | "town"
  | "descriptionShort"
  | "yukiMagi"
>;

export const InfoSection = ({
  resort,
  isCompareSelected,
  onToggleCompare,
  onClose,
}: {
  resort: ResortInfo;
  isCompareSelected: boolean;
  onToggleCompare: (id: string, selected: boolean) => void;
  onClose: () => void;
}) => {
  const compareBtnClassName = cn(
    "flex shrink-0 items-center justify-center rounded-lg gap-1 transition-colors",
    "h-7 md:h-8",
  );

  return (
    <div className="w-full px-4 py-3 border-b border-gray-200">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex-1 min-w-0 text-gray-900 text-xl md:text-2xl leading-snug font-bold font-[var(--font-heading)]">
          <RubyText segments={resort.nameRuby} fallback={resort.nameJa} />
        </h2>
        <CopyResortNameButton name={resort.nameJa} />
        <Button
          type="button"
          variant="ghost"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 shadow-sm hover:bg-gray-50 hover:text-gray-900 text-lg p-0 min-h-8 text-gray-500 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10"
          onClick={onClose}
          aria-label="詳細を閉じる"
        >
          <X size={18} strokeWidth={2.5} />
        </Button>
      </div>
      {resort.formerNames.length > 0 && (
        <p className="mt-1 text-xs leading-loose text-gray-500">
          旧称: <FormerResortNames names={resort.formerNames} />
        </p>
      )}
      <div className="mt-0.5 md:mt-2.5 flex items-center gap-2">
        <p className="flex-1 min-w-0 text-sm text-blue-600 font-medium">
          {resort.prefecture} • {resort.town}
          {resort.yukiMagi && (
            <Badge
              variant="secondary"
              className="ml-2 rounded-full bg-pink-50 text-pink-700 text-[0.6875rem] font-semibold whitespace-nowrap"
            >
              雪マジ
            </Badge>
          )}
        </p>
        <Button
          type="button"
          variant={isCompareSelected ? "default" : "outline"}
          className={cn(
            compareBtnClassName,
            "w-auto min-w-[5.75rem] md:w-[5.75rem] px-2 text-xs",
          )}
          aria-pressed={isCompareSelected}
          aria-label={`${resort.nameJa}を${
            isCompareSelected ? "比較から外す" : "比較に追加"
          }`}
          onClick={() => onToggleCompare(resort.id, !isCompareSelected)}
        >
          {isCompareSelected ? (
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          ) : (
            <Plus className="h-3.5 w-3.5 text-blue-600" strokeWidth={2.5} />
          )}
          <span>{isCompareSelected ? "比較から外す" : "比較に追加"}</span>
        </Button>
      </div>
      <p className="mt-2 text-gray-700 text-sm leading-snug">
        {resort.descriptionShort}
      </p>
    </div>
  );
};
