import type { CrawlMonitorMappingGap } from "@/server/crawl-latest/adminContract";
import { CATEGORY_LABELS, formatJst } from "../utils/labels";
import { StatusPill } from "./StatusPill";

const NameList = ({
  label,
  names,
}: {
  label: string;
  names: readonly string[];
}) =>
  names.length === 0 ? null : (
    <p className="text-xs text-gray-700">
      <span className="text-gray-500">{label}: </span>
      {names.join("、")}
    </p>
  );

/**
 * 対応表（コース・リフトの名寄せ表）と、直近の取得結果の突き合わせ。
 *
 * 対応表にある名前が取れていなければ、拾い漏らしか公式の表記変更の可能性が高い。
 * 逆に対応表に無い名前が出ていれば、対応表の更新が必要。
 */
export function MappingCoverage({
  gaps,
  observedAt,
  legacyApi,
}: {
  gaps: readonly CrawlMonitorMappingGap[];
  observedAt: string | null;
  legacyApi: boolean;
}) {
  if (legacyApi) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        接続先のサーバーがこの画面より古いため、対応表との照合ができません。
      </p>
    );
  }
  if (gaps.length === 0) {
    return (
      <p className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-600">
        このスキー場には対応表がありません（または照合できる実行記録がありません）。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {gaps.map(gap => {
        const hasGap = gap.missing.length > 0;
        return (
          <section
            key={gap.kind}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium text-gray-900">
                {CATEGORY_LABELS[gap.kind]}の対応表
              </h3>
              <StatusPill tone={hasGap ? "warn" : "ok"}>
                {hasGap
                  ? `${gap.missing.length}件が取れていません`
                  : "対応表の名前はすべて取れています"}
              </StatusPill>
            </header>
            <p className="mb-1 text-xs text-gray-500">
              対応表 {gap.expected}件 / 取得 {gap.crawled}件
              {observedAt ? ` / 取得時刻 ${formatJst(observedAt)}` : ""}
            </p>
            <NameList label="取れていない名前" names={gap.missing} />
            <NameList label="対応表に無い名前" names={gap.unexpected} />
          </section>
        );
      })}
    </div>
  );
}
