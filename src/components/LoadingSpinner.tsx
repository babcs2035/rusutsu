/**
 * 中央に表示されるアニメーション付きローディングスピナー
 */
export const LoadingSpinner = ({
  text = "読み込み中...",
}: {
  text?: string;
}) => {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-100"
      aria-live="polite"
      aria-busy="true"
    >
      {/* スピナー本体 */}
      <output className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-sky-500" />
      {/* ローディングテキスト */}
      <p className="text-lg font-semibold text-slate-600">{text}</p>
    </div>
  );
};
