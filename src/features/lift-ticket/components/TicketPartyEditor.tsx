"use client";

import { ChevronDown, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  SELECTABLE_TICKET_PARTY_CATEGORIES,
  TICKET_DISABILITY_BASE_CATEGORIES,
  TICKET_HOUR_OPTIONS,
  type TicketDayPlan,
  type TicketPartyCategory,
  type TicketPartyGroup,
  type TicketRentalRequest,
} from "../types";
import {
  nextDateOf,
  schoolAgeMismatchOf,
  TICKET_PARTY_CATEGORY_LABELS,
} from "../utils/calculateLiftTicket";
import {
  defaultRentalRequestOf,
  formatRentalRequest,
  rentalItemsOf,
  TICKET_RENTAL_ITEM_LABELS,
  TICKET_RENTAL_SPORT_LABELS,
  type TicketRentalOptions,
} from "../utils/rental";

type Props = {
  value: LiftTicketSearchInput;
  onChange: (value: LiftTicketSearchInput) => void;
  compact?: boolean;
  /**
   * そのスキー場で借りられる物。指定すると利用者ごとにレンタルの有無と
   * 借りる物を選べる（料金計算の画面だけ。レンタル料金が無いスキー場では null）
   */
  rentalOptions?: TicketRentalOptions | null;
  /** 年齢を入力しないと料金が決まらない利用者の id。年齢欄を赤枠にし、新たに必要になった欄へフォーカスする */
  ageRequiredGroupIds?: string[];
  onInputBlur?: () => void;
  onInputFocus?: () => void;
};

// Base UI の SelectValue は items が無いと生の値（day / adult）を表示するので、
// トリガーに出すラベルを Root に渡す
const DURATION_LABELS: Record<string, string> = {
  day: "1日",
  "day-night": "1日＋ナイター",
  night: "ナイター",
  ...Object.fromEntries(
    TICKET_HOUR_OPTIONS.map(hours => [`h${hours}`, `${hours}時間`]),
  ),
};

/**
 * 滑る長さは1つのドロップダウンで選ぶ（「1日」「1日＋ナイター」「ナイター」「1〜9時間」）。
 * 時間を別の入力欄にすると、数字だけ（「4」）では何のことか分からず、行も折り返す
 */
const durationKeyOf = (duration: TicketDayPlan["duration"]) =>
  duration.kind === "hours"
    ? `h${duration.hours}`
    : duration.kind === "night"
      ? "night"
      : duration.withNight
        ? "day-night"
        : "day";

const durationOfKey = (key: string): TicketDayPlan["duration"] =>
  key.startsWith("h")
    ? { kind: "hours", hours: Number(key.slice(1)) }
    : key === "night"
      ? { kind: "night" }
      : { kind: "day", withNight: key === "day-night" };

const sanitizeNumber = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits ? Number.parseInt(digits, 10) : null;
};

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
    <span className="text-gray-900 text-sm font-bold">{title}</span>
    {/* 追加は補助の操作なので、塗りの青ではなく枠だけの小さいボタンにする */}
    <Button
      type="button"
      variant="outline"
      className="h-7 flex-shrink-0 gap-0.5 border-blue-200 bg-white px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 hover:text-blue-800"
      onClick={onAction}
    >
      <Plus size={13} strokeWidth={2.5} />
      {actionLabel}
    </Button>
  </div>
);

/**
 * 入力欄の見た目。灰色の枠の中で透明背景だと薄く見えるので白背景にする。
 * 文字の大きさ・太さは Input / Select の既定（本文と同じ）に合わせる。
 * スマホの入力欄を16px未満にすると iOS がフォーカス時に拡大するので、Input の既定のままにする
 */
const FIELD_CLASS =
  "h-9 bg-background text-foreground placeholder:text-muted-foreground";

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

/**
 * 人数の −／＋。入力欄にすると、1人増やすだけでもキーボードが出る。
 * 行が2つ以上あるときは、1人から減らすとその行を消す（消すための列を別に作らない）
 */
const CountStepper = ({
  label,
  count,
  canRemove,
  onChange,
  onRemove,
}: {
  label: string;
  count: number;
  canRemove: boolean;
  onChange: (count: number) => void;
  onRemove: () => void;
}) => {
  const removes = count <= 1 && canRemove;
  return (
    <div className="flex h-9 items-center justify-between rounded-md border border-input bg-white">
      <button
        type="button"
        aria-label={removes ? `${label}の行を削除` : `${label}の人数を減らす`}
        className="flex h-full w-[1.375rem] shrink-0 items-center justify-center rounded-l-md @min-[19rem]/party:w-7 text-gray-700 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
        disabled={count <= 1 && !canRemove}
        onClick={() => (removes ? onRemove() : onChange(count - 1))}
      >
        {removes ? <Trash2 size={14} /> : <Minus size={14} strokeWidth={2.5} />}
      </button>
      <output
        aria-label={`${label}の人数`}
        className="min-w-0 flex-1 text-center text-base font-semibold tabular-nums text-gray-900"
      >
        {count}
      </output>
      <button
        type="button"
        aria-label={`${label}の人数を増やす`}
        className="flex h-full w-[1.375rem] shrink-0 items-center justify-center rounded-r-md @min-[19rem]/party:w-7 text-gray-700 hover:bg-gray-100 disabled:text-gray-300"
        disabled={count >= 99}
        onClick={() => onChange(count + 1)}
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
};

/**
 * レンタルの欄。押すと小窓が開き、借りない／種目（スキー・スノーボード）と、
 * 板・ブーツ・ストック・ウェア…を1つずつ選べる。欄には「なし」「スキー3点」のように
 * 選んだ内容を出す。行の下に別の段を足さないので、選んでも縦に伸びない。
 * **選択肢はそのスキー場の料金表にある物だけ**（料金の無い物を選ばせて「未確定」にしない）
 */
const RentalPicker = ({
  rental,
  options,
  onChange,
}: {
  rental: TicketRentalRequest | null;
  options: TicketRentalOptions;
  onChange: (rental: TicketRentalRequest | null) => void;
}) => {
  const items = rentalItemsOf(rental);
  const summary = formatRentalRequest(rental);
  const available = rental ? options.itemsBySport[rental.sport] : [];
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`レンタルを選ぶ（${summary}）`}
        className={cn(
          "flex h-9 w-full min-w-0 items-center justify-between gap-0.5 rounded-md border pr-0.5 pl-1.5 text-left text-xs font-semibold @min-[19rem]/party:pr-1 @min-[19rem]/party:pl-2 @min-[19rem]/party:text-xs",
          rental
            ? "border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100"
            : "border-input bg-white text-gray-700 hover:bg-gray-50",
        )}
      >
        <span className="min-w-0 truncate">{summary}</span>
        {/* 狭い枠では「スキー3点」を切らないよう、矢印を省く */}
        <ChevronDown
          className="hidden size-3.5 shrink-0 opacity-70 @min-[19rem]/party:block"
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-2.5">
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${options.sports.length + 1}, minmax(0, 1fr))`,
          }}
        >
          <Button
            type="button"
            variant={rental ? "outline" : "default"}
            className="h-8 px-1 text-sm whitespace-nowrap"
            aria-pressed={!rental}
            onClick={() => onChange(null)}
          >
            なし
          </Button>
          {options.sports.map(sport => {
            const selected = rental?.sport === sport;
            return (
              <Button
                key={sport}
                type="button"
                variant={selected ? "default" : "outline"}
                className="h-8 px-1 text-sm whitespace-nowrap"
                aria-pressed={selected}
                onClick={() =>
                  onChange(defaultRentalRequestOf(options, sport, items))
                }
              >
                {TICKET_RENTAL_SPORT_LABELS[sport]}
              </Button>
            );
          })}
        </div>
        {rental && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 px-0.5">
            {available.map(item => (
              <label
                key={item}
                className="flex items-center gap-1.5 text-sm text-gray-900 whitespace-nowrap"
              >
                <Checkbox
                  checked={items.includes(item)}
                  onCheckedChange={checked =>
                    onChange({
                      ...rental,
                      items: checked
                        ? [...items, item]
                        : items.filter(current => current !== item),
                    })
                  }
                />
                {TICKET_RENTAL_ITEM_LABELS[item]}
              </label>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export const TicketPartyEditor = ({
  value,
  onChange,
  onInputBlur,
  onInputFocus,
  rentalOptions = null,
  ageRequiredGroupIds = [],
}: Props) => {
  const nextGroupIdRef = useRef(value.party.length + 1);
  const nextDayIdRef = useRef((value.days?.length ?? 1) + 1);
  const ageInputRefs = useRef(new Map<string, HTMLInputElement>());
  // 開いた時点で既に必要な欄にはフォーカスしない（画面を開いただけでキーボードを出さない）。
  // 区分を未就学児に変えたときなど、操作で新たに必要になった欄だけにフォーカスする
  const prevAgeRequiredRef = useRef<string[] | null>(null);
  const ageRequiredKey = ageRequiredGroupIds.join(",");
  useEffect(() => {
    const current = ageRequiredKey ? ageRequiredKey.split(",") : [];
    const previous = prevAgeRequiredRef.current;
    prevAgeRequiredRef.current = current;
    if (previous == null) return;
    const added = current.find(id => !previous.includes(id));
    if (added) ageInputRefs.current.get(added)?.focus();
  }, [ageRequiredKey]);

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

  const showRental = rentalOptions != null;
  const canRemoveGroup = value.party.length > 1;
  // 年齢は2桁と「任意」が収まる幅。人数は −／＋ と数字、レンタルは「スキー3点」が収まる幅。
  // 枠が19rem未満（幅320pxのスマホ、346pxの詳細パネル）では各列を詰めて区分の幅を残す
  const partyGrid = showRental
    ? "grid-cols-[minmax(0,1fr)_2.5rem_4rem_4rem] @min-[19rem]/party:grid-cols-[minmax(0,1fr)_2.75rem_4.5rem_5.5rem]"
    : "grid-cols-[minmax(0,1fr)_3rem_5.25rem]";

  return (
    <div className="@container/party flex flex-col gap-3">
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
                // iOS の日付入力がネイティブの最小サイズで隣の列にはみ出さないようにする。
                className={cn(
                  FIELD_CLASS,
                  "block max-w-full appearance-none px-2",
                )}
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
                  className={cn(FIELD_CLASS, "min-w-0 w-full px-2.5")}
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
          title="利用者"
          actionLabel="利用者を追加"
          onAction={addGroup}
        />
        {/* 見出しは1回だけ。行ごとに「区分・年齢・人数」を繰り返すと縦に長くなる */}
        <div
          className={cn(
            "grid gap-1.5 -mb-1 text-gray-500 text-xs font-medium",
            partyGrid,
          )}
        >
          <span>区分</span>
          <span className="text-center">年齢</span>
          <span className="text-center">人数</span>
          {showRental && (
            <span className="text-center whitespace-nowrap">レンタル</span>
          )}
        </div>
        {value.party.map(group => {
          const ageRequired = ageRequiredGroupIds.includes(group.id);
          const ageMismatch = schoolAgeMismatchOf(group);
          return (
            <div
              key={group.id}
              className={cn("grid gap-1.5 items-center", partyGrid)}
            >
              <div className="flex min-w-0 flex-col gap-1.5">
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
                    className={cn(
                      FIELD_CLASS,
                      "w-full gap-0.5 px-1.5 @min-[19rem]/party:px-2.5",
                    )}
                  >
                    <SelectValue className="min-w-0 truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    {SELECTABLE_TICKET_PARTY_CATEGORIES.map(category => (
                      <SelectItem key={category} value={category}>
                        {TICKET_PARTY_CATEGORY_LABELS[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {group.category === "disabled" && (
                  <Select
                    items={TICKET_PARTY_CATEGORY_LABELS}
                    value={group.baseCategory ?? "adult"}
                    onValueChange={value => {
                      if (value == null) return;
                      updateGroup(group.id, current => ({
                        ...current,
                        baseCategory: value as TicketPartyGroup["baseCategory"],
                      }));
                    }}
                  >
                    <SelectTrigger
                      aria-label="障がい者の学校区分"
                      className={cn(FIELD_CLASS, "w-full px-2.5")}
                    >
                      <SelectValue className="min-w-0 truncate" />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_DISABILITY_BASE_CATEGORIES.map(category => (
                        <SelectItem key={category} value={category}>
                          {TICKET_PARTY_CATEGORY_LABELS[category]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Input
                ref={element => {
                  if (element) ageInputRefs.current.set(group.id, element);
                  else ageInputRefs.current.delete(group.id);
                }}
                aria-label={`${TICKET_PARTY_CATEGORY_LABELS[group.category]}の年齢`}
                aria-invalid={ageRequired || ageMismatch != null || undefined}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={group.age ?? ""}
                // 年齢が必要な欄は赤枠と計算結果の案内で伝えるので、「任意」を消すだけにする
                placeholder={ageRequired ? undefined : "任意"}
                onChange={event =>
                  updateGroup(group.id, current => ({
                    ...current,
                    age: sanitizeNumber(event.target.value),
                  }))
                }
                onBlur={onInputBlur}
                onFocus={onInputFocus}
                className={cn(
                  FIELD_CLASS,
                  "px-0.5 text-center @min-[19rem]/party:px-1",
                )}
              />
              <CountStepper
                label={TICKET_PARTY_CATEGORY_LABELS[group.category]}
                count={Math.max(1, group.count)}
                canRemove={canRemoveGroup}
                onChange={count =>
                  updateGroup(group.id, current => ({ ...current, count }))
                }
                onRemove={() => removeGroup(group.id)}
              />
              {rentalOptions && (
                <RentalPicker
                  rental={group.rental ?? null}
                  options={rentalOptions}
                  onChange={rental =>
                    updateGroup(group.id, current => ({ ...current, rental }))
                  }
                />
              )}
              {/* 学校区分にあり得ない年齢は、計算結果ではなく入力した行のすぐ下で知らせる */}
              {ageMismatch && (
                <p className="col-span-full -mt-0.5 text-xs font-semibold text-red-600 leading-snug">
                  {ageMismatch}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
