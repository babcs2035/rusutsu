"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminSkiResortRecord } from "@/server/ski-resorts/adminContract";

export function ResortReadingFields({
  resort,
  onRowsChanged,
}: {
  resort: AdminSkiResortRecord;
  onRowsChanged: () => void;
}) {
  const [ruby, setRuby] = useState(() =>
    resort.nameRuby.map((row, id) => ({ ...row, id: String(id) })),
  );
  const [former, setFormer] = useState(() =>
    resort.formerNames.map((row, id) => ({ ...row, id: String(id) })),
  );
  const rowOrder = JSON.stringify([
    ruby.map(row => row.id),
    former.map(row => row.id),
  ]);
  const previousRowOrder = useRef(rowOrder);
  useEffect(() => {
    if (previousRowOrder.current === rowOrder) return;
    previousRowOrder.current = rowOrder;
    // 行がDOMに反映された後で、親フォームの保存・離脱確認の状態を更新する。
    onRowsChanged();
  }, [rowOrder, onRowsChanged]);

  return (
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <h2 className="font-bold">ふりがな・旧称</h2>
      <p className="text-sm text-gray-600">
        名前を上から順に分けて登録します。「名前の部分」をつなげると、基本情報の「名称（日本語）」と一致するようにしてください。例：富良野
        → ふらの、スキー場 →
        すきーじょう。カタカナなど読みが不要な部分は、ふりがなを空欄にできます。
      </p>
      {ruby.length === 0 && (
        <p className="text-sm text-gray-500">
          ふりがなは未登録です。行を追加して入力してください。
        </p>
      )}
      {ruby.map((row, index) => (
        <div
          key={row.id}
          className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <label className="space-y-1 text-sm">
            <span>名前の部分</span>
            <Input
              name="rubyText"
              aria-label="名前の部分"
              defaultValue={row.text}
              required
              maxLength={300}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>ふりがな（任意）</span>
            <Input
              name="rubyReading"
              aria-label="ふりがな"
              defaultValue={row.ruby ?? ""}
              placeholder="ふりがな"
              maxLength={300}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            aria-label={`ふりがな ${index + 1} 行目を削除`}
            onClick={() =>
              setRuby(rows => rows.filter(item => item.id !== row.id))
            }
          >
            削除
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={ruby.length >= 100}
        onClick={() =>
          setRuby(rows => [
            ...rows,
            { id: crypto.randomUUID(), text: "", ruby: "" },
          ])
        }
      >
        ふりがなの行を追加
      </Button>
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
        以前の名前と、その読みを登録できます。検索にも使われます。
      </p>
      {former.length === 0 && (
        <p className="text-sm text-gray-500">
          旧称は未登録です。以前の名前がある場合に追加してください。
        </p>
      )}
      {former.map((row, index) => (
        <div
          key={row.id}
          className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <label className="space-y-1 text-sm">
            <span>旧称</span>
            <Input
              name="formerName"
              aria-label="旧称"
              defaultValue={row.name}
              required
              maxLength={300}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>旧称のふりがな（任意）</span>
            <Input
              name="formerReading"
              aria-label="旧称のふりがな"
              defaultValue={row.reading ?? ""}
              placeholder="ふりがな（任意）"
              maxLength={300}
            />
          </label>
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
            { id: crypto.randomUUID(), name: "", reading: "" },
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
