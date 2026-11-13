import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 項目名の下に「必須」「任意」を小さく添える。欄の高さ（h-8）に収まるよう行送りを詰める
const labelClass =
  "flex w-[4.5rem] shrink-0 flex-col pt-0.5 text-sm leading-tight font-medium text-gray-700 md:text-base";

export const chipClass = (selected: boolean) =>
  cn(
    "h-7 min-w-0 rounded-md border px-2 text-xs font-medium whitespace-nowrap",
    selected
      ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-600 hover:text-white hover:brightness-95"
      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900",
  );

/** 投稿・修正の入力欄。左に項目名、右に入力を置く */
export function Field({
  label,
  required = false,
  note,
  labelClassName,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  /** 項目名の列の幅を変える（長い項目名が並ぶ欄で使う） */
  labelClassName?: string;
  /** 項目名の下に添える文字。未指定は「必須」「任意」、null なら出さない */
  note?: ReactNode | null;
  /** 投稿を押したときに足りなかった必須項目の警告 */
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className={cn(labelClass, labelClassName)}>
        <span className="flex items-center gap-1">{label}</span>
        {note !== null && (
          <span
            className={cn(
              "text-[10px] leading-3 font-normal",
              note === undefined && required ? "text-red-600" : "text-gray-400",
            )}
          >
            {note ?? (required ? "必須" : "任意")}
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        {children}
        {error && (
          <p data-field-error className="mt-1 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** 選択肢を並べたチップ。選んだものを青で塗る */
export function Chips<T extends string>({
  label,
  values,
  selected,
  multiple = false,
  labels,
  onChange,
}: {
  label: string;
  values: readonly T[];
  selected: readonly T[];
  multiple?: boolean;
  /** 値と表示を分けたいときの表示名 */
  labels?: Partial<Record<T, string>>;
  onChange: (values: T[]) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-1.5">
      <legend className="sr-only">{label}</legend>
      {values.map(value => {
        const checked = selected.includes(value);
        return (
          <Button
            type="button"
            key={value}
            variant="outline"
            aria-pressed={checked}
            className={chipClass(checked)}
            onClick={() =>
              onChange(
                checked
                  ? selected.filter(item => item !== value)
                  : multiple
                    ? [...selected, value]
                    : [value],
              )
            }
          >
            {labels?.[value] ?? value}
          </Button>
        );
      })}
    </fieldset>
  );
}
