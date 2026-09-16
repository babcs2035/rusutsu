import { CableCar, CircleHelp } from "lucide-react";

/** 吊り下げられた座席／小型キャビン／大型キャビンを描き分ける。名称も隣に併記する。 */
export function LiftTypeIcon({ type }: { type: string | null }) {
  if (!type)
    return <CircleHelp aria-hidden="true" className="size-5 text-slate-500" />;
  if (/ゴンドラ/u.test(type))
    return <CableCar aria-hidden="true" className="size-5 text-slate-600" />;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0 text-slate-600"
    >
      <path d="M2 4h20M10 4v5" />
      {/ロープウェイ|ロープウェー/u.test(type) ? (
        <>
          <rect x="3" y="9" width="18" height="11" rx="2" />
          <path d="M4 15h16M9 10v5M15 10v5" />
        </>
      ) : /Tバー|ロープトウ|ロープリフト/u.test(type) ? (
        <path d="M10 9v9M5 18h10" />
      ) : (
        <>
          <path d="M10 9h5v9H5v-6M5 15h10M7 18v3M13 18v3" />
          <path d="M15 12h3v6h-3" />
        </>
      )}
    </svg>
  );
}
