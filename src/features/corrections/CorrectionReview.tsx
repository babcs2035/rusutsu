"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { adjustCorrectionItem, decideCorrectionItem } from "./actions";

const labels: Record<string, string> = {
  name: "名称",
  nameJa: "スキー場名",
  nameEn: "英語名",
  shortName: "略称",
  level: "難易度",
  distance: "距離",
  avg: "平均斜度",
  max: "最大斜度",
  piste: "圧雪",
  morning: "早朝営業",
  night: "ナイター営業",
  type: "リフトの種類",
  speed: "速度",
  capacity: "定員",
  hood: "屋根",
  footrest: "フットレスト",
  oilShield: "オイルシールド",
  towers: "支柱数",
  vertical: "標高差",
  top: "山頂駅の標高",
  bottom: "山麓駅の標高",
  maker: "メーカー",
  year: "設置年",
  note: "補足説明",
  link: "関連リンク",
  image: "画像URL",
  youtubeUrl: "YouTube URL",
  searchWord: "検索用キーワード",
  maxWidth: "最大幅",
  minWidth: "最小幅",
  coordinates: "位置",
  pisteSegments: "圧雪区間",
  morningSegments: "早朝営業区間",
  nightSegments: "ナイター営業区間",
  website: "公式サイトURL",
  descriptionShort: "紹介文",
  descriptionLong: "詳細説明",
  courseImages: "コース画像",
  outlineImages: "施設画像",
  "ticket-report": "リフト券情報",
  "source-report": "出典情報",
  "other-report": "その他",
};
const show = (value: unknown) =>
  value === undefined || value === null || value === ""
    ? "未登録"
    : typeof value === "string"
      ? value
      : JSON.stringify(value);

export function CorrectionReview({
  requestId,
  version,
  status,
  items,
}: {
  requestId: string;
  version: number;
  status: string;
  items: Array<Record<string, unknown>>;
}) {
  const [currentVersion, setCurrentVersion] = useState(version);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [currentItems, setCurrentItems] = useState(items);
  const [adjustments, setAdjustments] = useState<Record<number, string>>(
    Object.fromEntries(
      items.map((item, index) => [
        index,
        JSON.stringify(item.proposed ?? null),
      ]),
    ),
  );
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [busy, startTransition] = useTransition();
  const outcomes = currentItems.map(item => item.decision).filter(Boolean);
  const mixed = new Set(outcomes).size > 1;
  const decide = (index: number, kind: "approve" | "reject" | "manual") =>
    startTransition(async () => {
      const result = await decideCorrectionItem(
        requestId,
        currentVersion,
        index,
        kind,
        comment,
      );
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setCurrentVersion(result.version);
      const item = currentItems[index];
      const decision =
        result.decision ||
        (kind === "reject"
          ? "REJECTED"
          : kind === "manual" ||
              ["ticket-report", "source-report", "other-report"].includes(
                String(item?.field),
              )
            ? "MANUALLY_RESOLVED"
            : "APPROVED");
      setCurrentItems(values =>
        values.map((value, valueIndex) =>
          valueIndex === index ? { ...value, decision } : value,
        ),
      );
      const nextOutcomes = currentItems.map((value, valueIndex) =>
        valueIndex === index ? decision : value.decision,
      );
      if (nextOutcomes.every(Boolean)) setCurrentStatus("RESOLVED");
      setMessage(
        kind === "approve"
          ? "承認しました。"
          : kind === "reject"
            ? "却下しました。"
            : "手動で確認済みにしました。",
      );
    });

  return (
    <section className="mt-4 space-y-3">
      {mixed && (
        <p className="rounded bg-amber-50 p-3 text-sm">
          この申請には異なる審査結果が含まれます。
        </p>
      )}
      {currentItems.map((item, index) => (
        <article
          key={`${item.targetKind}:${item.targetId ?? "resort"}:${item.field}:${item.action ?? "change"}:${String(item.targetName ?? "")}`}
          className="rounded border p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">
                {item.targetKind === "slope"
                  ? "コース"
                  : item.targetKind === "lift"
                    ? "リフト"
                    : item.targetKind === "resort"
                      ? "基本情報・関連リンク"
                      : item.targetKind === "ticket"
                        ? "リフト券"
                        : item.targetKind === "source"
                          ? "出典"
                          : "その他"}{" "}
                · {labels[String(item.field)] ?? String(item.field)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                対象: {String(item.targetId ?? "スキー場")}
              </p>
              <p className="mt-2 text-sm">投稿時の値: {show(item.before)}</p>
              <p className="text-sm">
                投稿された提案:{" "}
                {show(
                  Object.hasOwn(item, "submittedProposed")
                    ? item.submittedProposed
                    : item.proposed,
                )}
              </p>
              {JSON.stringify(item.proposed) !==
                JSON.stringify(item.submittedProposed) && (
                <p className="text-sm">管理者の修正案: {show(item.proposed)}</p>
              )}
              <p className="text-sm">現在の登録値: {show(item.current)}</p>
              {Number(item.competingCount) > 0 && (
                <p className="mt-1 text-xs text-amber-800">
                  同じ項目を含む審査待ち申請: {String(item.competingCount)}件
                </p>
              )}
            </div>
            <span className="shrink-0 text-xs">
              {item.decision === "APPROVED_NOOP"
                ? "承認（変更なし）"
                : item.decision === "APPROVED"
                  ? "承認・反映済み"
                  : item.decision === "REJECTED"
                    ? "却下"
                    : item.decision === "MANUALLY_RESOLVED"
                      ? "手動確認済み"
                      : "審査待ち"}
            </span>
          </div>
          {currentStatus === "PENDING" && !item.decision && (
            <div className="mt-3 space-y-2 border-t pt-2">
              <label className="block text-xs font-medium">
                管理者の修正案
                <textarea
                  value={adjustments[index] ?? ""}
                  onChange={event =>
                    setAdjustments(current => ({
                      ...current,
                      [index]: event.target.value,
                    }))
                  }
                  rows={2}
                  className="mt-1 w-full rounded border p-2 font-mono"
                />
              </label>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  startTransition(async () => {
                    let proposed: unknown;
                    try {
                      proposed = JSON.parse(adjustments[index] ?? "");
                    } catch {
                      proposed = adjustments[index] ?? "";
                    }
                    const result = await adjustCorrectionItem(
                      requestId,
                      currentVersion,
                      index,
                      proposed,
                    );
                    if (result.ok) {
                      setCurrentVersion(result.version);
                      setCurrentItems(values =>
                        values.map((value, valueIndex) =>
                          valueIndex === index ? { ...value, proposed } : value,
                        ),
                      );
                      setMessage("修正案を更新しました。");
                    } else setMessage(result.error);
                  })
                }
              >
                修正案を保存
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => decide(index, "approve")}
                >
                  承認して反映
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => decide(index, "reject")}
                >
                  却下
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => decide(index, "manual")}
                >
                  手動で確認済み
                </Button>
              </div>
            </div>
          )}
        </article>
      ))}
      {currentStatus === "PENDING" && (
        <label className="block text-sm">
          審査コメント（任意）
          <textarea
            value={comment}
            onChange={event => setComment(event.target.value)}
            className="mt-1 w-full rounded border p-2"
            maxLength={2000}
          />
        </label>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
