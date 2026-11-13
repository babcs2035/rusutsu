"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/features/favorites/FavoriteButton";
import { cn } from "@/lib/utils";
import { CompareResortButton } from "@/shared/components/CompareResortButton";
import { CopyResortNameButton } from "@/shared/components/CopyResortNameButton";
import { FormerResortNames } from "@/shared/components/FormerResortNames";
import { RubyText } from "@/shared/components/RubyText";
import type { Resort } from "../types";
import {
  ResortFeatureChips,
  type ResortFeatureData,
} from "./ResortFeatureChips";

type ResortInfo = Pick<
  Resort,
  "id" | "nameJa" | "nameRuby" | "formerNames" | "prefecture" | "town"
> & {
  yukiMagi: boolean;
  hasEvCharger?: boolean;
  /** 読み込み前は null。雪マジ・EV充電のチップは押せない */
  features?: ResortFeatureData | null;
};

export const InfoSection = ({
  resort,
  isCompareSelected,
  onToggleCompare,
  onClose,
  children,
}: {
  resort: ResortInfo;
  isCompareSelected: boolean;
  onToggleCompare: (id: string, selected: boolean) => void;
  onClose: () => void;
  /** 都道府県・市町村の下に出す操作（「〇〇も同時に表示」） */
  children?: ReactNode;
}) => {
  const compareBtnClassName = cn(
    "flex shrink-0 items-center justify-center rounded-lg gap-1 transition-colors",
    "h-7",
  );

  return (
    <div className="w-full px-3.5 py-2.5 border-b border-gray-200">
      <div className="flex items-start justify-between gap-1.5">
        <h2 className="flex-1 min-w-0 pt-0.5 text-gray-900 text-lg leading-snug font-bold font-[var(--font-heading)]">
          <RubyText segments={resort.nameRuby} fallback={resort.nameJa} />
          {/* 名前のすぐ後ろに置く。行ボックスを広げないよう行送りより小さくする */}
          <CopyResortNameButton
            name={resort.nameJa}
            className="ml-1 size-4 align-middle"
          />
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <FavoriteButton resortId={resort.id} name={resort.nameJa} />
          <Button
            type="button"
            variant="ghost"
            className="flex size-7 min-h-7 shrink-0 items-center justify-center rounded-full border border-gray-200 shadow-sm hover:bg-gray-50 hover:text-gray-900 text-lg p-0 text-gray-500 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10"
            onClick={onClose}
            aria-label="詳細を閉じる"
          >
            <X size={18} strokeWidth={2.5} />
          </Button>
        </div>
      </div>
      {resort.formerNames.length > 0 && (
        <p className="mt-1 text-xs leading-loose text-gray-500">
          旧称: <FormerResortNames names={resort.formerNames} />
        </p>
      )}
      <div className="mt-1 flex items-center gap-2">
        <p className="flex flex-1 min-w-0 items-center gap-2 text-xs text-blue-600 font-medium">
          <span className="min-w-0 truncate">
            {resort.prefecture}・{resort.town}
          </span>
          <ResortFeatureChips
            hasYukiMagi={resort.yukiMagi}
            hasEvCharger={resort.hasEvCharger ?? false}
            data={resort.features ?? null}
          />
        </p>
        <CompareResortButton
          isSelected={isCompareSelected}
          resortName={resort.nameJa}
          className={cn(
            compareBtnClassName,
            "w-auto min-w-[5.75rem] px-2 text-xs",
          )}
          onClick={() => onToggleCompare(resort.id, !isCompareSelected)}
        />
      </div>
      {children && <div className="mt-1.5">{children}</div>}
    </div>
  );
};
