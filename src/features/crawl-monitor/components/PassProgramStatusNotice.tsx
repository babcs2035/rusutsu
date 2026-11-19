import type { PassProgramStatus } from "@/server/pass-programs/status";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  });

/**
 * シーズン券・キッズパス（NSDキッズ・マックアース・スノーバーズ）の対象スキー場一覧の変化。
 * 最近30日の追加・削除、名寄せできない名前、最後の取得の失敗があれば黄色で知らせる。
 */
export const PassProgramStatusNotice = ({
  status,
}: {
  status: PassProgramStatus;
}) => {
  const failed = status.lastRun !== null && status.lastRun.status !== "success";
  const attention =
    failed ||
    status.programs.some(
      program =>
        program.added.length > 0 ||
        program.removed.length > 0 ||
        program.unmatched.length > 0,
    );
  return (
    <section
      className={`mb-4 rounded-lg border p-3 text-sm ${
        attention
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-gray-200 bg-white text-gray-700"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-bold">シーズン券・キッズパスの対象一覧</h2>
        <span className="text-xs text-gray-600">
          {status.lastRun
            ? `最終取得 ${formatDate(status.lastRun.at)}${failed ? "（失敗）" : ""}`
            : "定期実行の記録なし"}
          ・毎日3:30に取り直し
        </span>
      </div>
      {failed && status.lastRun?.message && (
        <p className="mt-1 break-words text-xs">{status.lastRun.message}</p>
      )}
      <ul className="mt-1.5 flex flex-col gap-1">
        {status.programs.map(program => (
          <li key={program.programId} className="text-xs leading-relaxed">
            <ExternalLinkComponent
              href={program.listUrl}
              className="font-bold underline"
            >
              {program.label}
            </ExternalLinkComponent>{" "}
            {program.total}件
            {program.added.length > 0 &&
              ` ／ 追加: ${program.added
                .map(change => `${change.name}（${formatDate(change.at)}）`)
                .join("、")}`}
            {program.removed.length > 0 &&
              ` ／ 掲載終了: ${program.removed
                .map(change => `${change.name}（${formatDate(change.at)}）`)
                .join("、")}`}
            {program.unmatched.length > 0 &&
              ` ／ 名寄せできない（絞り込みに出ない）: ${program.unmatched.join("、")} → src/private/data/pass-programs/aliases.json に追加`}
          </li>
        ))}
      </ul>
    </section>
  );
};
