"use client";

import { cn } from "@/lib/utils";
import { CompareResortNameCell } from "./CompareResortNameCell";
import type { Resort } from "./types";

type Column = {
  label: string;
  getValue: (resort: Resort) => string;
};

const COLUMNS: Column[] = [
  { label: "コース数", getValue: resort => `${resort.numberOfCourses}` },
  { label: "リフト数", getValue: resort => `${resort.numberOfLifts}` },
  {
    label: "最高標高",
    getValue: resort => `${resort.topElevation.toLocaleString()} m`,
  },
  {
    label: "最低標高",
    getValue: resort => `${resort.baseElevation.toLocaleString()} m`,
  },
  {
    label: "標高差",
    getValue: resort => `${resort.verticalDrop.toLocaleString()} m`,
  },
];

// スキー場名の列。スプレッドシートの「先頭列固定」と同じ見え方にする。
// 幅は 13px で 6 文字ぶん（= 78px）＋左右の余白。
const NAME_COLUMN_CLASS =
  "sticky left-0 z-10 w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-1.5 py-1.5 text-left align-top after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-gray-200";

export const CompareOverviewTab = ({
  resorts,
  onSelectResort,
}: {
  resorts: Resort[];
  /** 「詳細」で開くスキー場。渡さなければボタンを出さない */
  onSelectResort?: (id: string) => void;
}) => (
  <div className="scroll-touch w-full overflow-x-auto rounded-xl border border-gray-200 bg-white">
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="bg-gray-50">
          <th
            scope="col"
            className={cn(
              NAME_COLUMN_CLASS,
              "bg-gray-50 text-[11px] font-semibold text-gray-500",
            )}
          >
            スキー場
          </th>
          {COLUMNS.map(column => (
            <th
              key={column.label}
              scope="col"
              className="whitespace-nowrap px-3 py-1.5 text-left text-[11px] font-semibold text-gray-500"
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {resorts.map(resort => (
          <tr key={resort.id} className="border-t border-gray-200">
            <th
              scope="row"
              className={cn(NAME_COLUMN_CLASS, "bg-white font-normal")}
            >
              <CompareResortNameCell
                resort={resort}
                onSelectResort={onSelectResort}
              />
            </th>
            {COLUMNS.map(column => (
              <td
                key={column.label}
                // §6: 数値は font-mono（列の桁揃えのため）
                className="whitespace-nowrap px-3 py-1.5 align-top font-mono text-[13px] font-bold text-gray-900"
              >
                {column.getValue(resort)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
