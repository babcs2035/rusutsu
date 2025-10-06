"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ForecastsT, SkiResortT, SnowDepthsT, WeathersT } from "@/types";
import {
  ForecastTable,
  SnowDepthLineChart,
  WeeklyWeatherChart,
} from "./WeatherChart";

type Props = {
  resort: SkiResortT;
  onClose: () => void;
};

const TABS = ["概要", "コース", "リフト", "チケット", "気候"];

/**
 * スキー場の詳細情報を表示するレスポンシブ対応モーダル
 */
export const SkiResortDetailView = ({ resort, onClose }: Props) => {
  const [activeTab, setActiveTab] = useState(TABS[0]);

  // --- データの読み込みとIDに基づいた検索 ---
  const weathersData: WeathersT | undefined = useMemo(
    () =>
      require("@/lib/weathers.json").find(
        (w: WeathersT) => w.meta.id === resort.id,
      ),
    [resort.id],
  );
  const forecastsData: ForecastsT | undefined = useMemo(
    () =>
      require("@/lib/forecasts.json").find(
        (f: ForecastsT) => f.meta.id === resort.id,
      ),
    [resort.id],
  );
  // snowdepths.json はIDをキーとするオブジェクトからデータを取得
  const snowDepthsData: SnowDepthsT | undefined = useMemo(
    () => require("@/lib/snowdepths.json")[resort.id],
    [resort.id],
  );

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-0 md:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
        aria-hidden="true"
      />
      <motion.div
        variants={{
          hidden: { opacity: 0, scale: 0.95 },
          visible: { opacity: 1, scale: 1 },
        }}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="relative z-10 flex h-full w-full flex-col overflow-hidden bg-gray-50 shadow-2xl md:h-[90vh] md:max-h-[800px] md:w-[90vw] md:max-w-4xl md:rounded-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-2xl text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/70 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer"
          aria-label="詳細モーダルを閉じる"
        >
          ✕
        </button>
        <div className="flex-grow overflow-y-auto">
          <ImageCarousel
            images={(resort.outline?.images || []).concat(
              resort.courses.images || [],
            )}
            alt={resort.name.ja}
          />
          <InfoSection resort={resort} />
          <nav className="sticky top-0 z-10 flex border-y bg-white/80 backdrop-blur-sm">
            {TABS.map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 px-2 text-center text-sm font-semibold transition-colors md:text-base cursor-pointer ${activeTab === tab ? "border-b-2 border-sky-500 text-sky-600" : "text-gray-500 hover:bg-gray-100/50"}`}
              >
                {tab}
              </button>
            ))}
          </nav>
          <div className="p-4 md:p-6">
            {activeTab === "概要" && <OverviewTab resort={resort} />}
            {activeTab === "コース" && <CoursesTab resort={resort} />}
            {activeTab === "リフト" && <LiftsTab resort={resort} />}
            {activeTab === "チケット" && <TicketsTab resort={resort} />}
            {activeTab === "気候" && (
              <WeatherTab
                weathers={weathersData}
                forecasts={forecastsData}
                snowDepths={snowDepthsData}
              />
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// --- 子コンポーネント群 ---

const ImageCarousel = ({ images, alt }: { images: string[]; alt: string }) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = useCallback(
    () => setCurrentSlide(s => (s === images.length - 1 ? 0 : s + 1)),
    [images.length],
  );
  const prevSlide = useCallback(
    () => setCurrentSlide(s => (s === 0 ? images.length - 1 : s - 1)),
    [images.length],
  );

  useEffect(() => {
    if (!images || images.length <= 1) return;
    const interval = setInterval(nextSlide, 4000);
    return () => clearInterval(interval);
  }, [images, nextSlide]);

  if (!images || images.length === 0)
    return <div className="h-48 w-full flex-shrink-0 bg-gray-300 md:h-64" />;

  return (
    <div className="relative h-48 w-full flex-shrink-0 overflow-hidden md:h-64">
      <div
        className="flex h-full w-full transition-transform duration-700 ease-in-out"
        style={{ transform: `translateX(-${currentSlide * 100}%)` }}
      >
        {images.map(src => (
          <div key={src} className="relative h-full w-full flex-shrink-0">
            <Image
              src={src}
              alt={alt}
              fill
              className="object-contain"
              unoptimized
              priority
            />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={prevSlide}
            className="absolute left-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-2xl text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/70 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer"
            aria-label="前の画像"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={nextSlide}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-2xl text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/70 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer"
            aria-label="次の画像"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
};

const InfoSection = ({ resort }: { resort: SkiResortT }) => (
  <div className="bg-white p-4 md:p-6">
    <h1 className="text-2xl font-bold md:text-3xl">{resort.name.ja}</h1>
    <p className="mt-1 text-sm text-gray-500">
      {resort.location.prefecture} {resort.location.town}
    </p>
    <p className="mt-3 text-gray-700">{resort.outline?.description.short}</p>
    <div className="mt-4 grid grid-cols-3 gap-2 text-center md:gap-4">
      <StatCard title="❄️ 雪の状態" value={resort.outline?.condition || "--"} />
      <StatCard title="🈺 営業状況" value={resort.outline?.status || "--"} />
      <StatCard title="⭐️ 評価" value={resort.outline?.review || "--"} />
    </div>
  </div>
);

const OverviewTab = ({ resort }: { resort: SkiResortT }) => (
  <div className="space-y-8">
    <section>
      <h3 className="text-xl font-semibold">📝 概要</h3>
      <p className="mt-2 whitespace-pre-wrap text-gray-800">
        {resort.outline?.description.long}
      </p>
    </section>
    <section>
      <h3 className="text-xl font-semibold">🕒 営業時間</h3>
      <div className="mt-2 w-full overflow-x-auto rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                曜日
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                営業時間
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            <tr>
              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                平日
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{`${resort.times.weekday.open} - ${resort.times.weekday.close}`}</td>
            </tr>
            <tr>
              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                週末・祝日
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{`${resort.times.weekend.open} - ${resort.times.weekend.close}`}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {resort.times.comment && (
        <div className="mt-2 text-sm text-gray-600">{resort.times.comment}</div>
      )}
    </section>
    {resort.yukiMagi?.available && (
      <section>
        <h3 className="text-xl font-semibold">🎫 雪マジ！</h3>
        <p className="mt-1 text-gray-700">{resort.yukiMagi.info}</p>
        {resort.yukiMagi.notes && (
          <p className="mt-1 text-sm text-gray-600">{resort.yukiMagi.notes}</p>
        )}
      </section>
    )}
    <section>
      <h3 className="text-xl font-semibold">🔗 関連リンク</h3>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sky-600">
        {resort.others.website && (
          <li>
            <a
              href={resort.others.website}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              公式サイト
            </a>
          </li>
        )}
        {resort.others.sources.map(src => (
          <li key={src}>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {new URL(src).hostname}
            </a>
          </li>
        ))}
      </ul>
    </section>
  </div>
);

const CoursesTab = ({ resort }: { resort: SkiResortT }) => {
  const c = resort.courses;
  const [difficultyFilter, setDifficultyFilter] = useState("全て");
  const [sortConfig, setSortConfig] = useState<{
    key: "distance";
    direction: "asc" | "desc";
  } | null>(null);

  const difficultyOptions = useMemo(
    () => [
      "全て",
      ...Array.from(new Set(c.details?.map(d => d.difficulty) || [])),
    ],
    [c.details],
  );

  const processedCourses = useMemo(() => {
    let courses = c.details ? [...c.details] : [];
    if (difficultyFilter !== "全て") {
      courses = courses.filter(d => d.difficulty === difficultyFilter);
    }
    if (sortConfig !== null) {
      courses.sort((a, b) => {
        const aVal = a[sortConfig.key] || 0;
        const bVal = b[sortConfig.key] || 0;
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return courses;
  }, [c.details, difficultyFilter, sortConfig]);

  const handleSort = (key: "distance") => {
    setSortConfig(prev => ({
      key,
      direction: prev?.direction === "asc" ? "desc" : "asc",
    }));
  };

  return (
    <div className="space-y-8">
      <section>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard title="🗺️ コース数" value={`${c.numberOfCourses}本`} />
          <StatCard
            title="📏 最長滑走"
            value={`${c.longestCourse.toLocaleString()}m`}
          />
          <StatCard
            title="📐 最大斜度"
            value={`${c.steepestSlope || c.angle?.max || "--"}°`}
          />
          <StatCard title="🏔️ 標高差" value={`${c.vertical}m`} />
        </div>
      </section>
      <section>
        <h3 className="text-xl font-semibold">レベル割合</h3>
        <div className="mt-2 flex h-8 w-full overflow-hidden rounded-full bg-gray-200 text-xs font-bold text-white">
          <div
            style={{ width: `${Math.max(c.beginnersCoursesPercent, 15)}%` }}
            className="bg-green-500 flex items-center justify-center min-w-[60px]"
            title={`初級 ${c.beginnersCoursesPercent}%`}
          >
            初級 {c.beginnersCoursesPercent}%
          </div>
          <div
            style={{ width: `${Math.max(c.intermediateCoursesPercent, 15)}%` }}
            className="bg-sky-500 flex items-center justify-center min-w-[60px]"
            title={`中級 ${c.intermediateCoursesPercent}%`}
          >
            中級 {c.intermediateCoursesPercent}%
          </div>
          <div
            style={{ width: `${Math.max(c.advancedCoursesPercent, 15)}%` }}
            className="bg-red-500 flex items-center justify-center min-w-[60px]"
            title={`上級 ${c.advancedCoursesPercent}%`}
          >
            上級 {c.advancedCoursesPercent}%
          </div>
        </div>
      </section>
      <section>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h3 className="text-xl font-semibold">コース一覧</h3>
          <select
            value={difficultyFilter}
            onChange={e => setDifficultyFilter(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 md:w-auto text-sm"
          >
            {difficultyOptions.map(opt => (
              <option key={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div className="mt-4 w-full overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap">
                  コース名
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap">
                  レベル
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort("distance")}
                    className="flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    距離 (m){" "}
                    {sortConfig?.key === "distance" &&
                      (sortConfig.direction === "asc" ? "▲" : "▼")}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap">
                  スノボ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {processedCourses?.map(d => (
                <tr key={d.name}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {d.name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {d.difficulty}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {d.distance?.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {d.snowboard}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

const LiftsTab = ({ resort }: { resort: SkiResortT }) => {
  const l = resort.lifts;
  const [typeFilter, setTypeFilter] = useState("全て");
  const [sortConfig, setSortConfig] = useState<{
    key: "distance";
    direction: "asc" | "desc";
  } | null>(null);

  const typeOptions = useMemo(
    () => ["全て", ...Array.from(new Set(l.details?.map(d => d.type) || []))],
    [l.details],
  );

  const processedLifts = useMemo(() => {
    let lifts = l.details ? [...l.details] : [];
    if (typeFilter !== "全て") {
      lifts = lifts.filter(d => d.type === typeFilter);
    }
    if (sortConfig !== null) {
      lifts.sort((a, b) => {
        const aVal = a[sortConfig.key] || 0;
        const bVal = b[sortConfig.key] || 0;
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return lifts;
  }, [l.details, typeFilter, sortConfig]);

  const handleSort = (key: "distance") => {
    setSortConfig(prev => ({
      key,
      direction: prev?.direction === "asc" ? "desc" : "asc",
    }));
  };

  return (
    <div className="space-y-8">
      <section>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard title="🚡 総数" value={`${l.numberOfLifts}基`} />
          <StatCard title="🚠 ゴンドラ" value={`${l.gondolas}基`} />
          <StatCard title="4⃣ クアッドリフト" value={`${l.quadLifts}基`} />
          <StatCard title="2⃣ ペアリフト" value={`${l.pairLifts}基`} />
        </div>
      </section>
      <section>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h3 className="text-xl font-semibold">リフト一覧</h3>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 md:w-auto text-sm"
          >
            {typeOptions.map(opt => (
              <option key={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div className="mt-4 w-full overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap">
                  リフト名
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  種別
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort("distance")}
                    className="flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    距離 (m){" "}
                    {sortConfig?.key === "distance" &&
                      (sortConfig.direction === "asc" ? "▲" : "▼")}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap">
                  フード
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {processedLifts?.map(lift => (
                <tr key={lift.name}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {lift.name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {lift.type}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {lift.distance?.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {lift.hood}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

const TicketsTab = ({ resort }: { resort: SkiResortT }) => (
  <section>
    <h3 className="text-xl font-semibold mb-4">チケット料金</h3>
    <div className="w-full overflow-x-auto rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap">
              券種
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap">
              大人
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap">
              子供
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap">
              シニア
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {resort.tickets.map(t => (
            <tr key={t.name}>
              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                {t.name}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                {t.prices.adult?.toLocaleString() || "--"} 円
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                {t.prices.child?.toLocaleString() ||
                  t.prices.olderChild?.toLocaleString() ||
                  "--"}{" "}
                円
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                {t.prices.senior?.toLocaleString() || "--"} 円
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

const WeatherTab = ({
  weathers,
  forecasts,
  snowDepths,
}: {
  weathers?: WeathersT;
  forecasts?: ForecastsT;
  snowDepths?: SnowDepthsT;
}) => {
  return (
    <div className="space-y-8">
      {weathers && (
        <section>
          <h3 className="text-xl font-semibold">📈 直近の天気</h3>
          <ForecastTable weathers={weathers} />
        </section>
      )}
      {forecasts && (
        <section>
          <h3 className="text-xl font-semibold">
            📊 過去の気象データ（週単位）
          </h3>
          <WeeklyWeatherChart forecasts={forecasts} />
        </section>
      )}
      {snowDepths && (
        <section>
          <h3 className="text-xl font-semibold">❄️ 積雪の分布</h3>
          <SnowDepthLineChart snowDepths={snowDepths} />
        </section>
      )}
    </div>
  );
};

const StatCard = ({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) => (
  <div className="flex h-full flex-col items-center justify-center rounded-lg bg-gray-100 p-2 text-center md:p-3">
    <p className="text-xs text-gray-500 md:text-sm">{title}</p>
    <p className="mt-1 text-base font-bold text-gray-800 md:text-lg">{value}</p>
  </div>
);
