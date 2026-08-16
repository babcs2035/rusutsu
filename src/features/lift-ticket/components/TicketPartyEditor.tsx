"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  LiftTicketSearchInput,
  TicketDayPlan,
  TicketPartyCategory,
  TicketPartyGroup,
} from "../types";
import {
  nextDateOf,
  TICKET_PARTY_CATEGORY_LABELS,
} from "../utils/calculateLiftTicket";

type Props = {
  value: LiftTicketSearchInput;
  onChange: (value: LiftTicketSearchInput) => void;
  /** 選ばれた券種の説明（「7時間 → 9時間券 ¥6,300」のような結果の要約） */
  durationHint?: string | null;
  compact?: boolean;
  onInputBlur?: () => void;
  onInputFocus?: () => void;
};

const sanitizeNumber = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits ? Number.parseInt(digits, 10) : null;
};

export const TicketPartyEditor = ({
  value,
  onChange,
  durationHint,
  onInputBlur,
  onInputFocus,
}: Props) => {
  const nextGroupIdRef = useRef(value.party.length + 1);
  const nextDayIdRef = useRef((value.days?.length ?? 1) + 1);

  // 日ごとの計画。未設定なら visitDate から1日ぶんを作る（他画面との後方互換）
  const days: TicketDayPlan[] =
    value.days && value.days.length > 0
      ? value.days
      : [
          {
            id: "day-1",
            date: value.visitDate,
            duration: { kind: "day", withNight: false },
          },
        ];

  const commitDays = (nextDays: TicketDayPlan[]) => {
    onChange({
      ...value,
      // 1日目は他画面（絞り込み・比較）が visitDate として使うので同期する
      visitDate: nextDays[0]?.date ?? "",
      days: nextDays,
    });
  };

  const updateDay = (
    dayId: string,
    updater: (day: TicketDayPlan) => TicketDayPlan,
  ) => {
    commitDays(days.map(day => (day.id === dayId ? updater(day) : day)));
  };

  const addDay = () => {
    const dayNumber = nextDayIdRef.current;
    nextDayIdRef.current += 1;
    const last = days[days.length - 1];
    commitDays([
      ...days,
      {
        id: `day-${dayNumber}`,
        // 既定は最後の日の翌日。連続で滑る人が多いので入力を減らす
        date: nextDateOf(last?.date ?? ""),
        duration: last?.duration ?? { kind: "day", withNight: false },
      },
    ]);
  };

  const removeDay = (dayId: string) => {
    if (days.length <= 1) return;
    commitDays(days.filter(day => day.id !== dayId));
  };

  const updateGroup = (
    groupId: string,
    updater: (group: TicketPartyGroup) => TicketPartyGroup,
  ) => {
    onChange({
      ...value,
      party: value.party.map(group =>
        group.id === groupId ? updater(group) : group,
      ),
    });
  };

  const addGroup = () => {
    const groupNumber = nextGroupIdRef.current;
    nextGroupIdRef.current += 1;
    onChange({
      ...value,
      party: [
        ...value.party,
        {
          id: `party-${groupNumber}`,
          category: "elementary",
          age: null,
          count: 0,
        },
      ],
    });
  };

  const removeGroup = (groupId: string) => {
    if (value.party.length <= 1) return;
    onChange({
      ...value,
      party: value.party.filter(group => group.id !== groupId),
    });
  };

  return (
    <div className="flex flex-col gap-2.5 md:gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-gray-600 text-xs font-medium">利用日</p>
          <Button
            type="button"
            variant="default"
            className="flex-shrink-0 h-9 gap-1 font-bold text-sm"
            onClick={addDay}
          >
            <Plus size={14} />
            日を追加
          </Button>
        </div>

        {days.map((day, index) => {
          const duration = day.duration;
          return (
            <div key={day.id} className="flex gap-1.5 items-center flex-wrap">
              <Input
                aria-label={`${index + 1}日目の日付`}
                type="date"
                value={day.date}
                onChange={event =>
                  updateDay(day.id, current => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
                onBlur={onInputBlur}
                onFocus={onInputFocus}
                className="flex-[1_1_9rem] min-w-[8.5rem] h-[2.25rem]"
              />

              {/* 「1日（ナイター無）」「1日（ナイター込）」「○時間」の3択 */}
              <Select
                value={
                  duration.kind === "hours"
                    ? "hours"
                    : duration.withNight
                      ? "day-night"
                      : "day"
                }
                onValueChange={value => {
                  updateDay(day.id, current => ({
                    ...current,
                    duration:
                      value === "hours"
                        ? { kind: "hours", hours: 4 }
                        : {
                            kind: "day",
                            withNight: value === "day-night",
                          },
                  }));
                }}
              >
                <SelectTrigger
                  className="h-9 w-[10.5rem] flex-shrink-0"
                  aria-label={`${index + 1}日目の滑る長さ`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">1日（ナイター無）</SelectItem>
                  <SelectItem value="day-night">1日（ナイター込）</SelectItem>
                  <SelectItem value="hours">時間で指定</SelectItem>
                </SelectContent>
              </Select>

              {duration.kind === "hours" && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Input
                    aria-label={`${index + 1}日目の滑る時間`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={String(duration.hours)}
                    onChange={event => {
                      const next = sanitizeNumber(event.target.value);
                      updateDay(day.id, current => ({
                        ...current,
                        duration: {
                          kind: "hours",
                          hours: Math.min(24, Math.max(1, next ?? 1)),
                        },
                      }));
                    }}
                    onBlur={onInputBlur}
                    onFocus={onInputFocus}
                    className="w-14 h-[2.25rem] px-1 text-center"
                  />
                  <p className="text-gray-700 text-sm font-medium">時間</p>
                </div>
              )}

              <Button
                type="button"
                aria-label={`${index + 1}日目を削除`}
                size="xs"
                className="h-9 w-9 p-0 text-gray-500"
                variant="ghost"
                disabled={days.length <= 1}
                onClick={() => removeDay(day.id)}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          );
        })}

        {durationHint && (
          <p className="text-gray-600 text-[0.6875rem] leading-relaxed">
            {durationHint}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-gray-600 text-xs font-medium">利用者情報</p>
          <Button
            type="button"
            variant="default"
            className="flex-shrink-0 h-9 gap-1 font-bold text-sm"
            onClick={addGroup}
          >
            <Plus size={14} />
            利用者を追加
          </Button>
        </div>
        {value.party.map(group => (
          <div
            key={group.id}
            className="grid grid-cols-[minmax(0,1fr)_4.25rem_4rem_1.75rem] gap-1.5 items-end"
          >
            <div>
              <Label className="block mb-0.5 text-gray-500 text-[0.6875rem] font-medium">
                区分
              </Label>
              <Select
                value={group.category}
                onValueChange={value =>
                  updateGroup(group.id, current => ({
                    ...current,
                    category: value as TicketPartyCategory,
                  }))
                }
              >
                <SelectTrigger className="h-9 w-full px-2 bg-white border border-gray-200 text-xs">
                  <SelectValue className="min-w-0 truncate" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TICKET_PARTY_CATEGORY_LABELS).map(
                    ([category, label]) => (
                      <SelectItem key={category} value={category}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="block mb-0.5 text-gray-500 text-[0.6875rem] font-medium">
                年齢
              </Label>
              <Input
                aria-label={`${TICKET_PARTY_CATEGORY_LABELS[group.category]}の年齢`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={group.age ?? ""}
                placeholder="任意"
                onChange={event =>
                  updateGroup(group.id, current => ({
                    ...current,
                    age: sanitizeNumber(event.target.value),
                  }))
                }
                onBlur={onInputBlur}
                onFocus={onInputFocus}
                className={cn(
                  "text-center h-9 bg-gray-50 border-gray-200 border-[1.5px] text-base",
                  "md:h-8 md:bg-white md:border-gray-200 md:border md:text-sm",
                )}
              />
            </div>
            <div>
              <Label className="block mb-0.5 text-gray-500 text-[0.6875rem] font-medium">
                人数
              </Label>
              <Input
                aria-label={`${TICKET_PARTY_CATEGORY_LABELS[group.category]}の人数`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={group.count === 0 ? "" : group.count}
                onChange={event =>
                  updateGroup(group.id, current => ({
                    ...current,
                    count: Math.min(
                      99,
                      Math.max(0, sanitizeNumber(event.target.value) ?? 0),
                    ),
                  }))
                }
                onBlur={onInputBlur}
                onFocus={onInputFocus}
                className={cn(
                  "text-center h-9 bg-gray-50 border-gray-200 border-[1.5px] text-base",
                  "md:h-8 md:bg-white md:border-gray-200 md:border md:text-sm",
                )}
              />
            </div>
            <Button
              type="button"
              aria-label="この人数行を削除"
              className="h-9 min-w-7 w-7 p-0 text-gray-500 bg-transparent"
              variant="ghost"
              disabled={value.party.length <= 1}
              onClick={() => removeGroup(group.id)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};
