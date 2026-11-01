"use client";

import { getResortLabelName } from "@/lib/resortAliases";

type ResortName = {
  id: string;
  nameJa: string;
  shortName: string | null;
  /** 同時表示の組で付けた表示名 */
  label?: string | null;
};

const labelOf = (resort: ResortName) =>
  resort.label ??
  getResortLabelName(resort.id, resort.nameJa, resort.shortName);

/** 同時表示中に、天気などを見るスキー場を切り替える。1か所なら何も出さない。 */
export function ResortTabs({
  members,
  activeId,
  onChange,
  label,
}: {
  members: ResortName[];
  activeId: string;
  onChange: (id: string) => void;
  label: string;
}) {
  if (members.length < 2) return null;
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full border border-slate-200 bg-white p-0.5"
    >
      {members.map(member => {
        const isActive = member.id === activeId;
        return (
          <button
            key={member.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(member.id)}
            className={`min-h-7 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors ${
              isActive
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {labelOf(member)}
          </button>
        );
      })}
    </div>
  );
}
