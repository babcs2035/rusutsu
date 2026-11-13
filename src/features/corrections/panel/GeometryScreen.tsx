"use client";

import { PenLine, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  type CorrectionFeature,
  type CorrectionKind,
  type CorrectionLine,
  lineChange,
} from "../model";
import type { GeometryEditor } from "./useGeometryEditor";

const KIND_LABEL = { slope: "コース", lift: "リフト" } as const;
const CHANGE_LABEL = {
  add: "新規",
  change: "位置を変更",
  delete: "削除を提案",
} as const;
const ICON_BUTTON_CLASS = "size-8 shrink-0 p-0 text-gray-700";
const ACTION_CLASS = "h-8 px-2 text-xs font-semibold whitespace-nowrap";

const lineName = (line: CorrectionLine) =>
  line.name || (line.isNew ? `新しい${KIND_LABEL[line.kind]}` : "名称未設定");

/**
 * 位置の修正。線は地図か一覧で選ぶ。追加のボタンと「元に戻す」は
 * 一覧をスクロールしても上に残す。
 */
export function GeometryScreen({
  kind,
  editor,
  features,
  scopeIds,
  compact,
  onSelectFromList,
}: {
  kind: CorrectionKind;
  editor: GeometryEditor;
  features: CorrectionFeature[];
  /** この線だけを直す（コース・リフトの詳細から開いたとき）。追加は出さない */
  scopeIds?: string[];
  /** スマホ。線を選んでいる間は一覧を畳み、地図を広く使う */
  compact: boolean;
  onSelectFromList: (id: string) => void;
}) {
  const { active, mode } = editor;
  const label = KIND_LABEL[kind];
  const originals = new Map(features.map(feature => [feature.id, feature]));
  const restricted = Boolean(scopeIds);
  // 対象が1本だけなら一覧は要らない。その線を選んだままにする
  const lockedId = scopeIds?.length === 1 ? scopeIds[0] : undefined;
  const visible = editor.lines.filter(
    line =>
      line.kind === kind &&
      (!scopeIds || scopeIds.includes(line.id)) &&
      // 描きかけ（2点未満）の線は、描いている間だけ一覧に出す
      (!line.isNew || line.coordinates.length >= 2 || line.id === active?.id),
  );
  // 追加した線は一覧の先頭に出し、追加できたことがすぐ分かるようにする
  const rows = [
    ...visible.filter(line => line.isNew),
    ...visible.filter(line => !line.isNew),
  ];
  const toolsOnly = compact && Boolean(active);
  const activeRow = useRef<HTMLLIElement | null>(null);
  const activeId = active?.id;
  // 地図で選んだ線の行を、一覧の見える位置に出す
  // biome-ignore lint/correctness/useExhaustiveDependencies: 選択が変わったときだけ動かす
  useEffect(() => {
    activeRow.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  const history = (
    <>
      <Button
        type="button"
        variant="outline"
        aria-label="元に戻す"
        title="元に戻す"
        className={ICON_BUTTON_CLASS}
        disabled={!editor.canUndo}
        onClick={editor.undo}
      >
        <Undo2 aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        aria-label="やり直す"
        title="やり直す"
        className={ICON_BUTTON_CLASS}
        disabled={!editor.canRedo}
        onClick={editor.redo}
      >
        <Redo2 aria-hidden="true" />
      </Button>
    </>
  );

  const tools = active && (
    <div className="space-y-1.5">
      {active.isNew ? (
        <Input
          aria-label={`${label}名`}
          className="h-8"
          placeholder={`${label}名（分かる場合）`}
          maxLength={300}
          value={active.name}
          onChange={event => editor.rename(active.id, event.target.value)}
        />
      ) : (
        // 上の帯に名前が出ている画面（スマホ・対象を絞った修正）では繰り返さない
        !toolsOnly &&
        !restricted && (
          <p className="text-sm font-bold break-words text-gray-900">
            {lineName(active)}
          </p>
        )
      )}
      <p className="text-xs leading-snug text-gray-600">
        {mode === "draw"
          ? `地図を押して、${kind === "slope" ? "滑り出しからゴール" : "乗り場から降り場"}へ順に点を置きます。`
          : "点は押したまま動かせます。線を押すと点が増え、点を押すと削除を選べます。"}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {mode === "edit" && (
          <Button
            type="button"
            variant="outline"
            className={ACTION_CLASS}
            onClick={editor.continueDraw}
          >
            <PenLine aria-hidden="true" />
            続きを描く
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className={cn(
            ACTION_CLASS,
            "border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800",
          )}
          onClick={() => editor.remove(active.id)}
        >
          <Trash2 aria-hidden="true" />
          {active.isNew ? "この線を消す" : `この${label}の削除を提案`}
        </Button>
        {!lockedId && !compact && (
          <Button
            type="button"
            variant="outline"
            className={ACTION_CLASS}
            onClick={() => editor.select(null)}
          >
            選択を解除
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-gray-200 px-3 py-1.5 md:px-4">
        {toolsOnly || restricted ? (
          <>
            <p className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">
              {active
                ? active.isNew
                  ? `新しい${label}`
                  : lineName(active)
                : lockedId
                  ? `${label}の削除を提案中`
                  : "直す線を選んでください"}
            </p>
            {toolsOnly && !lockedId && (
              <Button
                type="button"
                variant="outline"
                className={ACTION_CLASS}
                onClick={() => editor.select(null)}
              >
                一覧へ
              </Button>
            )}
          </>
        ) : (
          <Button
            type="button"
            className="h-8 min-w-0 flex-1 gap-1 text-sm font-semibold"
            onClick={() => editor.startNew(kind)}
          >
            <Plus aria-hidden="true" strokeWidth={3} />
            {label}を追加
          </Button>
        )}
        {history}
      </div>
      {/* 操作は一覧の外に置き、一覧をスクロールしても選んだ線の操作が隠れないようにする */}
      {tools && (
        <div
          className={cn(
            "shrink-0 px-3 py-2 md:px-4",
            !toolsOnly && !lockedId && "border-b border-blue-100 bg-blue-50",
          )}
        >
          {tools}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {lockedId && !active && (
          <div className="space-y-2 px-3 py-2 md:px-4">
            <p className="text-sm text-gray-600">
              この{label}の削除を提案しています。
            </p>
            <Button
              type="button"
              variant="outline"
              className={ACTION_CLASS}
              onClick={() => {
                editor.restore(lockedId);
                editor.select(lockedId);
              }}
            >
              削除の提案を取り消す
            </Button>
          </div>
        )}
        {!toolsOnly &&
          !lockedId &&
          (rows.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-600 md:px-4">
              {label}がまだ登録されていません。「{label}
              を追加」を押して、地図に線を描いてください。
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.map(line => {
                const change = lineChange(line, originals.get(line.id));
                const selected = line.id === active?.id;
                return (
                  <li
                    key={line.id}
                    ref={selected ? activeRow : undefined}
                    className={cn(
                      "flex min-h-10 items-center gap-2 px-3 md:px-4",
                      selected && "bg-blue-50",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={selected}
                      disabled={line.deleted}
                      className={cn(
                        "min-w-0 flex-1 py-2 text-left text-sm font-semibold break-words",
                        line.deleted
                          ? "text-gray-400 line-through"
                          : "text-gray-900",
                      )}
                      onClick={() => onSelectFromList(line.id)}
                    >
                      {lineName(line)}
                    </button>
                    {change && (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                          change === "delete"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800",
                        )}
                      >
                        {CHANGE_LABEL[change]}
                      </span>
                    )}
                    {line.deleted && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 px-2 text-xs font-semibold whitespace-nowrap"
                        onClick={() => editor.restore(line.id)}
                      >
                        取り消す
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}
      </div>
    </div>
  );
}
