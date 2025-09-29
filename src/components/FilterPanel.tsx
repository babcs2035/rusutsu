"use client";

import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useId, useState } from "react";

// フィルターの状態を管理するための型
export type Filters = {
  keyword: string;
  status: boolean;
  yukiMagi: boolean;
  beginnerFriendly: boolean;
  minVertical: number;
  minCourses: number;
};

type Props = {
  filters: Filters;
  onFilterChange: (newFilters: Filters) => void;
};

export const FilterPanel = ({ filters, onFilterChange }: Props) => {
  const [isOpen, setIsOpen] = useState(true);

  // フォーム要素のID
  const keywordId = useId();
  const statusId = useId();
  const yukiMagiId = useId();
  const beginnerFriendlyId = useId();
  const minVerticalId = useId();
  const minCoursesId = useId();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    const processedValue =
      type === "checkbox"
        ? checked
        : type === "number"
          ? value === ""
            ? 0
            : parseInt(value, 10)
          : value;

    onFilterChange({ ...filters, [name]: processedValue });
  };

  const handleReset = () => {
    onFilterChange({
      keyword: "",
      status: false,
      yukiMagi: false,
      beginnerFriendly: false,
      minVertical: 0,
      minCourses: 0,
    });
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="absolute top-4 left-4 z-[1000] flex items-center gap-2 rounded-lg bg-slate-800/80 px-4 py-2 text-white shadow-lg transition-colors hover:bg-slate-700/90 cursor-pointer"
      >
        <FontAwesomeIcon icon={faFilter} />
        <span>フィルター</span>
      </button>
    );
  }

  return (
    <div className="absolute top-4 left-4 z-[1000] w-72 rounded-xl border border-white/10 bg-slate-800/80 p-4 text-slate-200 shadow-xl backdrop-blur-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">フィルター</h2>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-2xl text-slate-400 transition-colors hover:text-white  cursor-pointer"
        >
          &times;
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-5">
        {/* キーワード検索 */}
        <div>
          <label
            htmlFor={keywordId}
            className="mb-1 block text-sm font-medium text-slate-300"
          >
            キーワード検索
          </label>
          <input
            id={keywordId}
            type="text"
            name="keyword"
            value={filters.keyword}
            onChange={handleChange}
            className="w-full rounded-md border-slate-600 bg-slate-700/50 text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        {/* チェックボックス (2x2グリッド) */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <label
            htmlFor={statusId}
            className="flex select-none items-center gap-2"
          >
            <input
              id={statusId}
              type="checkbox"
              name="status"
              checked={filters.status}
              onChange={handleChange}
              className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-indigo-500 focus:ring-indigo-500/50"
            />
            <span>営業中</span>
          </label>
          <label
            htmlFor={yukiMagiId}
            className="flex select-none items-center gap-2"
          >
            <input
              id={yukiMagiId}
              type="checkbox"
              name="yukiMagi"
              checked={filters.yukiMagi}
              onChange={handleChange}
              className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-indigo-500 focus:ring-indigo-500/50"
            />
            <span>雪マジ対応</span>
          </label>
          <label
            htmlFor={beginnerFriendlyId}
            className="flex select-none items-center gap-2"
          >
            <input
              id={beginnerFriendlyId}
              type="checkbox"
              name="beginnerFriendly"
              checked={filters.beginnerFriendly}
              onChange={handleChange}
              className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-indigo-500 focus:ring-indigo-500/50"
            />
            <span>初心者向け</span>
          </label>
        </div>

        {/* 数値入力 */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 items-center gap-2">
            <label htmlFor={minVerticalId} className="col-span-1 text-sm">
              標高差
            </label>
            <input
              id={minVerticalId}
              type="number"
              name="minVertical"
              value={filters.minVertical}
              onChange={handleChange}
              className="col-span-2 w-full rounded-md border-slate-600 bg-slate-700/50 text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-3 items-center gap-2">
            <label htmlFor={minCoursesId} className="col-span-1 text-sm">
              コース数
            </label>
            <input
              id={minCoursesId}
              type="number"
              name="minCourses"
              value={filters.minCourses}
              onChange={handleChange}
              className="col-span-2 w-full rounded-md border-slate-600 bg-slate-700/50 text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* リセットボタン */}
        <button
          type="button"
          onClick={handleReset}
          className="rounded-lg bg-slate-600 px-4 py-2 font-bold text-white shadow-md transition-colors hover:bg-slate-500  cursor-pointer"
        >
          リセット
        </button>
      </div>
    </div>
  );
};
