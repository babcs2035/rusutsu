"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  type LiftTicketSearchInput,
  TICKET_PARTY_CATEGORIES,
  type TicketDayPlan,
  type TicketPartyCategory,
  type TicketPartyGroup,
} from "../types";
import {
  nextDateOf,
  TICKET_PARTY_CATEGORY_LABELS,
} from "../utils/calculateLiftTicket";

type Props = {
  value: LiftTicketSearchInput;
  onChange: (value: LiftTicketSearchInput) => void;
  compact?: boolean;
  onInputBlur?: () => void;
  onInputFocus?: () => void;
};

// Base UI の SelectValue は items が無いと生の値（day / adult）を表示するので、
// トリガーに出すラベルを Root に渡す
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const DURATION_LABELS: Record<string, string> = {
  day: "1日",
  "day-night": "1日＋ナイター",
  ...Object.fromEntries(
    HOUR_OPTIONS.map(hours => [`h${hours}`, `${hours}時間`]),
  ),
};

/**
 * 滑る長さは1つのドロップダウンで選ぶ（「1日」「1日＋ナイター」「1〜12時間」）。
 * 時間を別の入力欄にすると、数字だけ（「4」）では何のことか分からず、行も折り返す
 */
const durationKeyOf = (duration: TicketDayPlan["duration"]) =>
  duration.kind === "hours"
    ? `h${duration.hours}`
    : duration.withNight
      ? "day-night"
      : "day";

const durationOfKey = (key: string): TicketDayPlan["duration"] =>
  key.startsWith("h")
    ? { kind: "hours", hours: Number(key.slice(1)) }
    : { kind: "day", withNight: key === "day-night" };

const sanitizeNumber = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits ? Number.parseInt(digits, 10) : null;
};

/**
 * 画面で選べる区分。「学校区分なし」（other）は大人と同じ扱いなので出さない。
 * 保存済みの入力に残っていても表示できるよう、型とラベルは残す
 */
const SELECTABLE_CATEGORIES = TICKET_PARTY_CATEGORIES.filter(
  category => category !== "other",
);

const SectionHeader = ({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) => (
  <div className="flex items-center justify-between gap-2">
    {/* p にしない。フィルタ画面の AlertDescription が p に下余白を付ける */}
    <span className="text-gray-900 text-sm font-semibold">{title}</span>
    <Button
      type="button"
      variant="default"
      className="flex-shrink-0 h-8 gap-1 font-bold text-sm"
      onClick={onAction}
    >
      <Plus size={14} />
      {actionLabel}
    </Button>
  </div>
);

/**
 * 入力欄の見た目。灰色の枠の中で透明背景だと薄く見えるので白背景にする。
 * 文字の大きさ・太さは Input / Select の既定（本文と同じ）に合わせる。
 * スマホの入力欄を16px未満にすると iOS がフォーカス時に拡大するので、Input の既定のままにする
 */
const FIELD_CLASS = "h-9 bg-white text-gray-900 placeholder:text-gray-400";

const RemoveButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => (
  <Button
    type="button"
    aria-label={label}
    variant="ghost"
    className="h-9 w-8 p-0 text-gray-500"
    onClick={onClick}
  >
    <Trash2 size={16} />
  </Button>
);

export const TicketPartyEditor = ({
  value,
  onChange,
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
          // 追加した行は1人いる前提。0人の行を足す人はいない
          count: 1,
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

  const canRemoveGroup = value.party.length > 1;
  const partyGrid = canRemoveGroup
    ? "grid-cols-[minmax(0,1fr)_4rem_4rem_2rem]"
    : "grid-cols-[minmax(0,1fr)_4rem_4rem]";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <SectionHeader
          title="利用日"
          actionLabel="日を追加"
          onAction={addDay}
        />

        {days.map((day, index) => {
          const duration = day.duration;
          return (
            <div
              key={day.id}
              className={cn(
                "grid gap-1.5 items-center",
                days.length > 1
                  ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem]"
                  : "grid-cols-2",
              )}
            >
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
                className={cn(FIELD_CLASS, "px-2")}
              />

              <Select
                items={DURATION_LABELS}
                value={durationKeyOf(duration)}
                onValueChange={value => {
                  if (value == null) return;
                  updateDay(day.id, current => ({
                    ...current,
                    duration: durationOfKey(String(value)),
                  }));
                }}
              >
                <SelectTrigger
                  className={cn(FIELD_CLASS, "w-full px-2.5")}
                  aria-label={`${index + 1}日目の滑る長さ`}
                >
                  <SelectValue className="min-w-0 truncate" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DURATION_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {days.length > 1 && (
                <RemoveButton
                  label={`${index + 1}日目を削除`}
                  onClick={() => removeDay(day.id)}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionHeader
          title="利用者情報"
          actionLabel="利用者を追加"
          onAction={addGroup}
        />
        {/* 見出しは1回だけ。行ごとに「区分・年齢・人数」を繰り返すと縦に長くなる */}
        <div
          className={cn(
            "grid gap-1.5 -mb-0.5 text-gray-800 text-sm font-medium",
            partyGrid,
          )}
        >
          <span>区分</span>
          <span className="text-center">年齢</span>
          <span className="text-center">人数</span>
        </div>
        {value.party.map(group => (
          <div
            key={group.id}
            className={cn("grid gap-1.5 items-center", partyGrid)}
          >
            <Select
              items={TICKET_PARTY_CATEGORY_LABELS}
              value={group.category}
              onValueChange={value =>
                updateGroup(group.id, current => ({
                  ...current,
                  category: value as TicketPartyCategory,
                }))
              }
            >
              <SelectTrigger
                aria-label="区分"
                className={cn(FIELD_CLASS, "w-full px-2.5")}
              >
                <SelectValue className="min-w-0 truncate" />
              </SelectTrigger>
              <SelectContent>
                {SELECTABLE_CATEGORIES.map(category => (
                  <SelectItem key={category} value={category}>
                    {TICKET_PARTY_CATEGORY_LABELS[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              className={cn(FIELD_CLASS, "text-center")}
            />
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
              className={cn(FIELD_CLASS, "text-center")}
            />
            {canRemoveGroup && (
              <RemoveButton
                label="この利用者を削除"
                onClick={() => removeGroup(group.id)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
