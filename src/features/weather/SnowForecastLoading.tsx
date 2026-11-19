import { Spinner } from "@/components/ui/spinner";

/** Snow Forecast の埋め込みを読み込んでいる間、枠の上に重ねる表示（詳細・比較で共通） */
export const SnowForecastLoading = () => (
  <div
    className="absolute inset-0 z-10 flex items-center justify-center gap-8 bg-white text-xs font-medium text-gray-600"
    aria-live="polite"
    aria-busy="true"
  >
    <Spinner className="h-4 w-4 text-blue-600" />
    <p>予報を読み込み中...</p>
  </div>
);
