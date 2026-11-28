"use client";

import type { ReactNode } from "react";
import { FavoriteButton } from "@/features/favorites/FavoriteButton";
import { cn } from "@/lib/utils";
import { CompareResortButton } from "@/shared/components/CompareResortButton";
import { CopyResortNameButton } from "@/shared/components/CopyResortNameButton";
import { FormerResortNames } from "@/shared/components/FormerResortNames";
import { PanelCloseButton } from "@/shared/components/PanelCloseButton";
import { RubyText } from "@/shared/components/RubyText";
import { useDetailHeaderActions } from "../detailHeaderActions";
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
  const actions = useDetailHeaderActions();
  const compareBtnClassName = cn(
    "flex shrink-0 items-center justify-center rounded-lg gap-1 transition-colors",
    "h-7",
  );

  return (
    <div className="w-full border-b border-border px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 flex-1 font-heading text-lg font-bold leading-snug text-foreground">
          <RubyText segments={resort.nameRuby} fallback={resort.nameJa} />
          {/* 名前のすぐ後ろに置く。行ボックスを広げないよう行送りより小さくする */}
          <CopyResortNameButton
            name={resort.nameJa}
            className="ml-1 size-4 align-middle"
          />
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {actions.favorite && (
            <FavoriteButton resortId={resort.id} name={resort.nameJa} />
          )}
          <PanelCloseButton label="詳細を閉じる" onClose={onClose} />
        </div>
      </div>
      {resort.formerNames.length > 0 && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          旧称: <FormerResortNames names={resort.formerNames} />
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="min-w-0 truncate">
            {resort.prefecture}・{resort.town}
          </span>
          <ResortFeatureChips
            hasYukiMagi={resort.yukiMagi}
            hasEvCharger={resort.hasEvCharger ?? false}
            data={resort.features ?? null}
          />
        </p>
        {actions.compare && !actions.floatingCompare && (
          <CompareResortButton
            isSelected={isCompareSelected}
            resortName={resort.nameJa}
            className={cn(
              compareBtnClassName,
              "w-auto min-w-[5.75rem] px-2 text-xs",
            )}
            onClick={() => onToggleCompare(resort.id, !isCompareSelected)}
          />
        )}
      </div>
      {children && <div className="mt-1.5">{children}</div>}
    </div>
  );
};
