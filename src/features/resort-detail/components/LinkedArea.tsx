"use client";

import { ArrowLeftRight, Ticket } from "lucide-react";
import { Fragment, useState } from "react";
import { getResortLabelName } from "@/lib/resortAliases";
import type { Resort } from "../types";

type ResortName = { id: string; nameJa: string; shortName: string | null };

const labelOf = (resort: ResortName) =>
  getResortLabelName(resort.id, resort.nameJa, resort.shortName);

/** 連携エリアで、開いているスキー場以外の所属スキー場。 */
export const linkedPartnersOf = (resort: Resort) =>
  resort.linkedArea?.members.filter(member => member.id !== resort.id) ?? [];

function ResortLinks({
  resorts,
  onSelectResort,
}: {
  resorts: ResortName[];
  onSelectResort?: (id: string) => void;
}) {
  return resorts.map((partner, index) => (
    <Fragment key={partner.id}>
      {index > 0 && "・"}
      {onSelectResort ? (
        <button
          type="button"
          className="font-semibold underline decoration-current/40 underline-offset-2 hover:decoration-current"
          onClick={() => onSelectResort(partner.id)}
        >
          {labelOf(partner)}
        </button>
      ) : (
        <span className="font-semibold">{labelOf(partner)}</span>
      )}
    </Fragment>
  ));
}

/**
 * ゲレンデがつながっているスキー場と、共通券で滑れるスキー場を1行ずつ出す。
 * 名前を押すと、そのスキー場の詳細に移る。
 */
export function ResortRelations({
  resort,
  onSelectResort,
}: {
  resort: Resort;
  onSelectResort?: (id: string) => void;
}) {
  const linked = linkedPartnersOf(resort);
  const linkedIds = new Set(linked.map(partner => partner.id));
  // つながっているスキー場は共通券の案内に重ねて出さない
  const ticketPartners = (resort.ticketPartners ?? []).filter(
    partner => !linkedIds.has(partner.id),
  );
  if (!linked.length && !ticketPartners.length) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-1.5 text-xs leading-5">
      {linked.length > 0 && (
        <p className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-sky-800">
          <ArrowLeftRight className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <ResortLinks resorts={linked} onSelectResort={onSelectResort} />{" "}
            とつながっています
          </span>
        </p>
      )}
      {ticketPartners.length > 0 && (
        <p className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">
          <Ticket className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            共通券で{" "}
            <ResortLinks
              resorts={ticketPartners}
              onSelectResort={onSelectResort}
            />{" "}
            も滑走可
          </span>
        </p>
      )}
    </div>
  );
}

/** 連携エリアで、天気・積雪などを見るスキー場。最初は開いたスキー場。 */
export function useLinkedMember(resort: Resort) {
  const members = resort.linkedArea?.members ?? [];
  const [selectedId, setSelectedId] = useState(resort.id);
  const activeId = members.some(member => member.id === selectedId)
    ? selectedId
    : resort.id;
  return {
    members,
    activeId,
    activeMember: members.find(member => member.id === activeId) ?? null,
    setActiveId: setSelectedId,
  };
}

/** 連携エリアの所属スキー場を切り替える。連携していなければ何も出さない。 */
export function LinkedMemberTabs({
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
