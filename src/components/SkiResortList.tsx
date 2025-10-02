"use client";

import type { SkiResortT } from "@/types";

// 親コンポーネントから受け取る props の型をシンプルに戻す
type Props = {
  resorts: SkiResortT[];
  onSelectResort: (id: string) => void;
};

/**
 * 右カラムまたはボトムシートに表示されるスキー場一覧コンポーネント
 */
export const SkiResortList = ({ resorts, onSelectResort }: Props) => {
  return (
    // 親要素(vaulのコンテナ)の高さいっぱいに広がるコンテナ
    <div className="flex h-full flex-col bg-gray-100">
      {/* ヘッダーエリア */}
      <div className="p-4 pt-2 md:pt-4">
        <h2 className="text-lg font-bold text-gray-800">
          {resorts.length}件のスキー場
        </h2>
      </div>

      {/* スクロール可能なリスト本体 */}
      <ul className="flex-grow space-y-2 overflow-y-auto px-2 pb-2">
        {resorts.map(resort => (
          <li key={resort.id}>
            <button
              type="button"
              onClick={() => onSelectResort(resort.id)}
              className="w-full cursor-pointer rounded-md bg-white p-3 text-left shadow transition-shadow hover:shadow-lg"
            >
              <h3 className="font-bold">{resort.name.ja}</h3>
              <p className="text-sm text-gray-600">
                {resort.location.prefecture}
              </p>
              <div className="mt-2 flex justify-between text-sm">
                <span>⭐️ {resort.outline?.review || "評価なし"}</span>
                <span>コース: {resort.courses.numberOfCourses}</span>
                <span>標高差: {resort.courses.vertical}m</span>
                <input
                  type="checkbox"
                  onClick={e => e.stopPropagation()}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  aria-label={`${resort.name.ja}を比較対象に追加`}
                />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
