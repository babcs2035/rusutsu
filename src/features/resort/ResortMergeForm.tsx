"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminSkiResortRecord } from "@/server/ski-resorts/adminContract";
import {
  mergeResortSummary,
  type ResortMergeResult,
} from "@/server/ski-resorts/mergeContract";
import { mergeSkiResortsFromAdmin } from "./mergeActions";

export function ResortMergeForm({
  resorts,
  initialId,
  onBack,
  onDirtyChange,
  onPendingChange,
  onCreated,
}: {
  resorts: AdminSkiResortRecord[];
  initialId: string | null;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  onCreated: (
    result: Extract<ResortMergeResult, { status: "created" }>,
  ) => void;
}) {
  const eligible = resorts.filter(
    resort => !resort.mergedIntoId && !resort.sourceResortIds.length,
  );
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
        if (pending || !primary || selected.length < 2 || idExists) return;
        setError(null);
        onPendingChange(true);
        startTransition(async () => {
          try {
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
        <Button
          type="submit"
          disabled={pending || selected.length < 2 || !primary || idExists}
        >
          {pending ? "保存中…" : "結合して保存"}
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
          <section className="space-y-3 rounded-xl border bg-white p-4">
            <h3 className="font-bold">1. 結合するスキー場を選ぶ</h3>
            <p className="text-sm text-gray-600">
              2件以上を選択してください。元データは残り、公開一覧と地図には結合後の1件を表示します。
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
          <section
            className="space-y-4 rounded-xl border bg-white p-4"
            onChange={() => onDirtyChange(true)}
          >
            <h3 className="font-bold">2. 結合後の情報を設定する</h3>
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
        </div>
      </fieldset>
    </form>
  );
}
