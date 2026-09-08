"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminSkiResortRecord } from "@/server/ski-resorts/adminContract";
import { RubyText } from "@/shared/components/RubyText";
import type { ResortRubySegment } from "@/shared/types/resortReading";

export function ResortReadingFields({
  resort,
  onRowsChanged,
}: {
  resort: AdminSkiResortRecord;
  onRowsChanged: () => void;
}) {
  const [ruby, setRuby] = useState<RubyRow[]>(() =>
    resort.nameRuby.map((row, id) => ({ ...row, id: String(id) })),
  );
  const [former, setFormer] = useState<
    { id: string; name: string; nameRuby: RubyRow[] }[]
  >(() =>
    resort.formerNames.map((row, id) => ({
      ...row,
      id: String(id),
      nameRuby: (
        row.nameRuby ??
        (row.reading ? [{ text: row.name, ruby: row.reading }] : [])
      ).map((segment, segmentId) => ({ ...segment, id: String(segmentId) })),
    })),
  );
  const rowOrder = JSON.stringify([
    ruby.map(row => row.id),
    former.map(row => [row.id, row.nameRuby.map(segment => segment.id)]),
  ]);
  const previousRowOrder = useRef(rowOrder);
  useEffect(() => {
    if (previousRowOrder.current === rowOrder) return;
    previousRowOrder.current = rowOrder;
    // 行がDOMに反映された後で、親フォームの保存・離脱確認の状態を更新する。
    onRowsChanged();
  }, [rowOrder, onRowsChanged]);

  return (
    <section className="space-y-4 rounded-xl border bg-white p-3 md:p-5">
      <h2 className="font-bold">ふりがな・旧称</h2>
      <p className="text-sm text-gray-600">
        名前を上から順に分けて登録します。「名前の部分」をつなげると、基本情報の「名称（日本語）」と一致するようにしてください。例：富良野
        → ふらの、スキー場 →
        すきーじょう。カタカナなど読みが不要な部分は、ふりがなを空欄にできます。
      </p>
      <RubyFields
        rows={ruby}
        onChange={setRuby}
        textName="rubyText"
        readingName="rubyReading"
        label="ふりがな"
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="readingNeedsReview"
          defaultChecked={resort.readingNeedsReview}
        />
        読み方を確認中
      </label>
      <h3 className="font-semibold">旧称</h3>
      <p className="text-sm text-gray-600">
        旧称ごとに、通常の名称と同じように部分ごとのふりがなを追加できます。「名前の部分」をつなげると旧称と一致するようにしてください。検索にも使われます。
      </p>
      {former.length === 0 && (
        <p className="text-sm text-gray-500">
          旧称は未登録です。以前の名前がある場合に追加してください。
        </p>
      )}
      {former.map((row, index) => (
        <div key={row.id} className="space-y-3 rounded-lg border p-3">
          <label className="block space-y-1 text-sm">
            <span>旧称</span>
            <Input
              name="formerName"
              aria-label="旧称"
              defaultValue={row.name}
              required
              maxLength={300}
            />
          </label>
          <RubyFields
            rows={row.nameRuby}
            onChange={segments =>
              setFormer(rows =>
                rows.map(item =>
                  item.id === row.id ? { ...item, nameRuby: segments } : item,
                ),
              )
            }
            textName={`formerRubyText:${index}`}
            readingName={`formerRubyReading:${index}`}
            label={`旧称 ${index + 1} のふりがな`}
          />
          <Button
            type="button"
            variant="outline"
            aria-label={`旧称 ${index + 1} 行目を削除`}
            onClick={() =>
              setFormer(rows => rows.filter(item => item.id !== row.id))
            }
          >
            削除
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={former.length >= 100}
        onClick={() =>
          setFormer(rows => [
            ...rows,
            { id: crypto.randomUUID(), name: "", nameRuby: [] },
          ])
        }
      >
        旧称を追加
      </Button>
      <p className="text-xs text-gray-500">
        編集後は、この画面の保存ボタンで他のスキー場情報と一緒に保存します。
      </p>
    </section>
  );
}

type RubyRow = ResortRubySegment & { id: string };

function RubyFields({
  rows,
  onChange,
  textName,
  readingName,
  label,
}: {
  rows: RubyRow[];
  onChange: (rows: RubyRow[]) => void;
  textName: string;
  readingName: string;
  label: string;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div
          key={row.id}
          className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <label className="min-w-0 space-y-1 text-sm">
            <span>名前の部分</span>
            <Input
              name={textName}
              aria-label={`${label} ${index + 1} 行目の名前の部分`}
              value={row.text}
              required
              maxLength={300}
              onChange={event =>
                onChange(
                  rows.map(item =>
                    item.id === row.id
                      ? { ...item, text: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </label>
          <label className="min-w-0 space-y-1 text-sm">
            <span>ふりがな（任意）</span>
            <Input
              name={readingName}
              aria-label={`${label} ${index + 1} 行目の読み`}
              value={row.ruby ?? ""}
              placeholder="ふりがな"
              maxLength={300}
              onChange={event =>
                onChange(
                  rows.map(item =>
                    item.id === row.id
                      ? { ...item, ruby: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </label>
          <Button
            type="button"
            variant="outline"
            aria-label={`${label} ${index + 1} 行目を削除`}
            onClick={() => onChange(rows.filter(item => item.id !== row.id))}
          >
            削除
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={rows.length >= 100}
        onClick={() =>
          onChange([...rows, { id: crypto.randomUUID(), text: "", ruby: "" }])
        }
      >
        {label}の行を追加
      </Button>
      {rows.length > 0 && (
        <div className="rounded-lg bg-gray-50 p-3 text-sm">
          <p className="mb-2 text-xs text-gray-500">表示プレビュー</p>
          <p className="break-words leading-loose">
            <RubyText segments={rows} fallback="" />
          </p>
        </div>
      )}
    </div>
  );
}
