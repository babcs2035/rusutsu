/**
 * 地図の上に重ねる「地図 / ゲレンデマップ」切り替え。
 * 見出し用の下線タブ（UnderlineTabs）とは役割が違う（地図の表示形式の切り替え）ので、
 * 縦に高さを取らない丸ピルのセグメントコントロールにしている。
 */
export function MapAreaTabs<TTab extends string>({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: readonly TTab[];
  activeTab: TTab;
  onTabChange: (tab: TTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="地図の表示切り替え"
      className="inline-flex gap-0.5 rounded-full border border-slate-200 bg-white/90 p-0.5 shadow-sm backdrop-blur-sm"
    >
      {tabs.map(tab => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab)}
            className={`min-h-7 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors ${
              isActive
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
