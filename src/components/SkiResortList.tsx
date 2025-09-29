"use client";

import type { SkiResortT } from "@/types";

// 親コンポーネントから受け取る props の型
type Props = {
  resorts: SkiResortT[];
  onSelectResort: (id: string) => void;
};

/**
 * 右カラムに表示されるスキー場一覧コンポーネント
 */
export const SkiResortList = ({ resorts, onSelectResort }: Props) => {
  return (
    <div className="h-full bg-gray-100 overflow-y-auto">
      <div className="p-4">
        <h2 className="font-bold text-lg mb-2">
          {resorts.length}件見つかりました
        </h2>
        {/* TODO: ソート機能の実装 */}
      </div>
      <ul className="space-y-2 p-2">
        {resorts.map(resort => (
          <li key={resort.id}>
            <button
              type="button"
              onClick={() => onSelectResort(resort.id)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectResort(resort.id);
                }
              }}
              className="w-full text-left bg-white p-3 rounded-md shadow hover:shadow-lg cursor-pointer transition-shadow"
            >
              <h3 className="font-bold">{resort.name.ja}</h3>
              <p className="text-sm text-gray-600">
                {resort.location.prefecture}
              </p>
              <div className="flex justify-between text-sm mt-2">
                <span>⭐️ {resort.outline?.review || "レビューなし"}</span>
                <span>コース: {resort.courses.numberOfCourses}</span>
                <span>標高差: {resort.courses.vertical}m</span>
                <input type="checkbox" onClick={e => e.stopPropagation()} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
