"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getResortLabelName } from "@/lib/resortAliases";
import {
  type AdminSkiResortRecord,
  isMergedSource,
} from "@/server/ski-resorts/adminContract";
import type { DisplayGroup } from "@/server/ski-resorts/displayGroupContract";
import {
  mergeResortSummary,
  type ResortMergeResult,
} from "@/server/ski-resorts/mergeContract";
import {
  listDisplayGroupsFromAdmin,
  saveDisplayGroupFromAdmin,
} from "./displayGroupActions";
import { mergeSkiResortsFromAdmin } from "./mergeActions";
import { filledLabels, MemberLabelFields } from "./ResortDisplayGroupPanel";

type RelationKind = "MERGED" | "DISPLAY";

const RELATION_KINDS: Array<{
  kind: RelationKind;
  label: string;
  description: string;
}> = [
  {
    kind: "MERGED",
    label: "完全統合",
    description:
      "1つのスキー場にまとめます。公開一覧と地図には結合後の1件だけを表示します。",
  },
  {
    kind: "DISPLAY",
    label: "同時表示",
    description:
      "別々のスキー場のまま、詳細画面の「〇〇も同時に表示」で地図・営業状況・SNS・料金・天気・投稿を一緒に見られるようにします。",
  },
];

export function ResortMergeForm({
  resorts,
  initialId,
  onBack,
  onDirtyChange,
  onPendingChange,
  onCreated,
  onDisplayGrouped,
}: {
  resorts: AdminSkiResortRecord[];
  initialId: string | null;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  onCreated: (
    result: Extract<ResortMergeResult, { status: "created" }>,
  ) => void;
  onDisplayGrouped: (group: DisplayGroup) => void;
}) {
  const [kind, setKind] = useState<RelationKind>("MERGED");
  const isDisplay = kind === "DISPLAY";
  // 完全統合は統合していないスキー場どうし、同時表示は公開中の単位どうしを結ぶ
  const eligible = resorts.filter(resort =>
    isDisplay
      ? resort.isActive && !isMergedSource(resort)
      : !resort.mergedIntoId && !resort.sourceResortIds.length,
  );
  const [label, setLabel] = useState("");
  const [memberLabels, setMemberLabels] = useState<Record<string, string>>({});
  const [displayGroups, setDisplayGroups] = useState<DisplayGroup[] | null>(
    null,
  );
  useEffect(() => {
    if (!isDisplay || displayGroups) return;
    void listDisplayGroupsFromAdmin().then(result => {
      if (result.status === "ok") setDisplayGroups(result.groups);
    });
  }, [displayGroups, isDisplay]);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialId && eligible.some(resort => resort.id === initialId)
      ? [initialId]
      : [],
  );
  const [query, setQuery] = useState("");
  const [primaryId, setPrimaryId] = useState(selectedIds[0] ?? "");
  const [id, setId] = useState("");
  const [nameJa, setNameJa] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = selectedIds.flatMap(id =>
    eligible.filter(resort => resort.id === id),
  );
  const primary = selected.find(resort => resort.id === primaryId);
  const summary = primary ? mergeResortSummary(primary, selected) : null;
  const idExists = resorts.some(resort => resort.id === id);
  const filtered = eligible.filter(resort =>
    `${resort.nameJa} ${resort.nameEn} ${resort.id} ${resort.prefecture}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const changeKind = (next: RelationKind) => {
    setKind(next);
    setError(null);
    onDirtyChange(true);
  };
  // 同じ顔ぶれの組がすでにあれば作らない
  const sameGroup = isDisplay
    ? displayGroups?.find(
        group =>
          group.members.length === selected.length &&
          selected.every(resort =>
            group.members.some(member => member.id === resort.id),
          ),
      )
    : undefined;
  const canSubmit =
    !pending &&
    selected.length >= 2 &&
    (isDisplay ? !sameGroup : Boolean(primary) && !idExists);
  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter(value => value !== id)
      : [...selectedIds, id];
    setSelectedIds(next);
    if (!next.includes(primaryId)) setPrimaryId(next[0] ?? "");
    onDirtyChange(true);
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={event => {
        event.preventDefault();
        if (!canSubmit) return;
        setError(null);
        onPendingChange(true);
        startTransition(async () => {
          try {
            if (isDisplay) {
              const result = await saveDisplayGroupFromAdmin({
                label: label.trim() || null,
                memberLabels: filledLabels(selectedIds, memberLabels),
                resortIds: selected.map(resort => resort.id),
              });
              if (result.status === "error") setError(result.message);
              else onDisplayGrouped(result.group);
              return;
            }
            const result = await mergeSkiResortsFromAdmin({
              id,
              nameJa,
              nameEn,
              primaryId,
              sources: selected.map(resort => ({
                id: resort.id,
                expectedUpdatedAt: resort.updatedAt,
              })),
            });
            if (result.status === "error") setError(result.message);
            else onCreated(result);
          } catch {
            setError(
              "通信に失敗しました。入力内容を確認して、もう一度保存してください。",
            );
          } finally {
            onPendingChange(false);
          }
        });
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-white px-4 py-3">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onBack}
        >
          一覧に戻る
        </Button>
        <h2 className="flex-1 font-bold">複数のスキー場を結合</h2>
        <Button type="submit" disabled={!canSubmit}>
          {pending
            ? "保存中…"
            : isDisplay
              ? "同時表示の組を保存"
              : "結合して保存"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="shrink-0 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}
      <fieldset
        disabled={pending}
        className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-4 md:p-6"
      >
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
          <section
            className="space-y-3 rounded-xl border bg-white p-4 lg:col-span-2"
            aria-labelledby="relation-kind-heading"
          >
            <h3 id="relation-kind-heading" className="font-bold">
              1. 関係の種類を選ぶ
            </h3>
            <div className="grid gap-2 md:grid-cols-2">
              {RELATION_KINDS.map(option => (
                <label
                  key={option.kind}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                    kind === option.kind
                      ? "border-blue-600 bg-blue-50"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="relation-kind"
                    value={option.kind}
                    checked={kind === option.kind}
                    onChange={() => changeKind(option.kind)}
                    className="mt-1 size-4"
                  />
                  <span>
                    <span className="block text-sm font-bold">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-gray-600">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>
          <section className="space-y-3 rounded-xl border bg-white p-4">
            <h3 className="font-bold">2. 対象のスキー場を選ぶ</h3>
            <p className="text-sm text-gray-600">
              2件以上を選択してください。元データは残ります。
            </p>
            <Input
              type="search"
              aria-label="結合対象を検索"
              placeholder="スキー場名・都道府県・IDで検索"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
            <p className="text-sm" role="status">
              {selected.length}件を選択中
            </p>
            <div className="flex flex-wrap gap-2">
              {selected.map(resort => (
                <Button
                  key={resort.id}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => toggle(resort.id)}
                  aria-label={`${resort.nameJa}を結合対象から外す`}
                >
                  {resort.nameJa} ×
                </Button>
              ))}
            </div>
            <div className="max-h-[45dvh] overflow-y-auto rounded-md border">
              {filtered.map(resort => (
                <label
                  key={resort.id}
                  className="flex cursor-pointer items-center gap-3 border-b p-3 hover:bg-blue-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(resort.id)}
                    onChange={() => toggle(resort.id)}
                    className="size-4"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {resort.nameJa}
                      {!resort.isActive && "（公開停止中）"}
                    </span>
                    <span className="block break-all text-xs text-gray-500">
                      {resort.prefecture} / {resort.id}
                    </span>
                  </span>
                </label>
              ))}
              {!filtered.length && (
                <p className="p-4 text-sm text-gray-500">
                  結合できるスキー場が見つかりません。
                </p>
              )}
            </div>
          </section>
          {isDisplay ? (
            <section
              className="space-y-3 rounded-xl border bg-white p-4"
              onChange={() => onDirtyChange(true)}
            >
              <h3 className="font-bold">3. 表示名を決める</h3>
              <div className="space-y-1.5">
                <Label htmlFor="display-group-label">
                  表示名
                  <span className="ml-1 font-normal text-gray-600 text-xs">
                    （空欄なら相手の名前で「〇〇・△△も同時に表示」）
                  </span>
                </Label>
                <Input
                  id="display-group-label"
                  maxLength={100}
                  placeholder="例: ニセコ全山"
                  value={label}
                  onChange={event => setLabel(event.target.value)}
                />
              </div>
              {selected.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">
                    スキー場ごとの表示名
                    <span className="ml-1 font-normal text-gray-600 text-xs">
                      空欄なら短縮名。志賀高原どうしなど、短縮名で区別できないときに付けます
                    </span>
                  </p>
                  <MemberLabelFields
                    resorts={selected}
                    labels={memberLabels}
                    onLabelChange={(id, value) => {
                      setMemberLabels(current => ({ ...current, [id]: value }));
                      onDirtyChange(true);
                    }}
                    onRemove={toggle}
                  />
                </div>
              )}
              {selected.length >= 2 && (
                <p className="rounded-lg bg-blue-50 p-3 text-sm">
                  詳細画面では
                  {label.trim()
                    ? `「${label.trim()}で表示」`
                    : "相手の名前で「〇〇も同時に表示」"}
                  と出します：
                  {selected
                    .map(
                      resort =>
                        memberLabels[resort.id]?.trim() ||
                        getResortLabelName(
                          resort.id,
                          resort.nameJa,
                          resort.shortName,
                        ),
                    )
                    .join("・")}
                </p>
              )}
              {sameGroup && (
                <p role="alert" className="text-sm text-red-700">
                  同じスキー場の組がすでにあります
                  {sameGroup.label ? `（${sameGroup.label}）` : ""}
                  。表示名を変えるときは、スキー場の関係一覧から編集してください。
                </p>
              )}
            </section>
          ) : (
            <section
              className="space-y-4 rounded-xl border bg-white p-4"
              onChange={() => onDirtyChange(true)}
            >
              <h3 className="font-bold">3. 結合後の情報を設定する</h3>
              <div className="space-y-1.5">
                <Label htmlFor="merge-id">新しいスキー場ID</Label>
                <Input
                  id="merge-id"
                  required
                  maxLength={200}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder="example-snow-resort"
                  value={id}
                  onChange={event => setId(event.target.value)}
                  aria-invalid={idExists}
                />
                <p className="text-xs text-gray-500">
                  半角英小文字・数字・ハイフン。既存のIDは使用できません。
                </p>
                {idExists && (
                  <p role="alert" className="text-sm text-red-700">
                    このIDはすでに使われています。
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="merge-name-ja">結合後の名称（日本語）</Label>
                <Input
                  id="merge-name-ja"
                  required
                  maxLength={300}
                  value={nameJa}
                  onChange={event => setNameJa(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="merge-name-en">結合後の名称（英語）</Label>
                <Input
                  id="merge-name-en"
                  required
                  maxLength={300}
                  value={nameEn}
                  onChange={event => setNameEn(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="merge-primary">基本情報の引き継ぎ元</Label>
                <select
                  id="merge-primary"
                  required
                  value={primaryId}
                  onChange={event => setPrimaryId(event.target.value)}
                  className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option value="" disabled>
                    結合対象から選択
                  </option>
                  {selected.map(resort => (
                    <option key={resort.id} value={resort.id}>
                      {resort.nameJa}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-gray-500">
                  所在地・地図の位置・営業時間・コースの割合などを引き継ぎます。コース数・リフト数は合算します。結合後の専用データがない場合、料金・レビューは引き継ぎ元の情報を表示します。
                </p>
              </div>
              {summary && (
                <div className="space-y-2 rounded-lg bg-blue-50 p-4 text-sm">
                  <h4 className="font-bold">保存後の表示</h4>
                  <p>
                    {nameJa || "名称未入力"} / {id || "ID未入力"}
                  </p>
                  <p>
                    コース {summary.numberOfCourses}本・リフト{" "}
                    {summary.numberOfLifts}基
                  </p>
                  <p>
                    標高 {summary.baseElevation}〜{summary.topElevation}m
                  </p>
                  <p>位置・基本情報：{primary?.nameJa}</p>
                  <p className="text-xs text-gray-600">
                    結合後は公開状態で作成し、詳細設定を開きます。内容を続けて編集できます。
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      </fieldset>
    </form>
  );
}
