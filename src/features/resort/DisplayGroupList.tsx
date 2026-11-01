"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useEditingRole } from "@/app/admin/EditorAccess";
import { Button } from "@/components/ui/button";
import type { AdminSkiResortRecord } from "@/server/ski-resorts/adminContract";
import type { DisplayGroup } from "@/server/ski-resorts/displayGroupContract";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { deleteDisplayGroupFromAdmin } from "./displayGroupActions";
import {
  type DisplayGroupDraft,
  DisplayGroupEditor,
  memberLabelsOf,
} from "./ResortDisplayGroupPanel";

/** 関係一覧の「同時表示の組」。管理者はここから追加・編集・削除できる */
export function DisplayGroupList({
  initialGroups,
  resorts,
}: {
  initialGroups: DisplayGroup[];
  resorts: AdminSkiResortRecord[];
}) {
  const { isAdmin } = useEditingRole();
  const [groups, setGroups] = useState(initialGroups);
  const [draft, setDraft] = useState<DisplayGroupDraft | null>(null);
  const [deleting, setDeleting] = useState<DisplayGroup | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const resortOf = (id: string) => resorts.find(resort => resort.id === id);

  const remove = (group: DisplayGroup) =>
    startTransition(async () => {
      setError(null);
      const result = await deleteDisplayGroupFromAdmin({
        id: group.id,
        expectedUpdatedAt: group.updatedAt,
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setGroups(current => current.filter(item => item.id !== group.id));
      setMessage("同時表示の組を削除しました。");
    });

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="flex-1 text-lg font-bold text-gray-900 font-[var(--font-heading)]">
          同時表示の組
          <span className="ml-2 text-sm font-normal text-gray-500">
            {groups.length}件
          </span>
        </h2>
        {isAdmin && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setDraft({ label: "", ids: [] })}
          >
            組を追加
          </Button>
        )}
      </div>
      <p className="text-sm text-gray-600">
        詳細画面の「〇〇も同時に表示」で、地図・営業状況・SNS・料金・天気・投稿を一緒に見られる組です。
      </p>
      {message && (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {groups.length ? (
        <ul className="divide-y rounded-lg border bg-white">
          {groups.map(group => (
            <li
              key={group.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-bold">
                  {group.label ? `${group.label}で表示` : "表示名なし"}
                </p>
                <p className="flex flex-wrap gap-x-3 gap-y-1">
                  {group.members.map(member => {
                    const resort = resortOf(member.id);
                    return (
                      <Link
                        key={member.id}
                        href={`/admin/resort?id=${encodeURIComponent(member.id)}`}
                        className="underline decoration-gray-300 underline-offset-2 hover:decoration-current"
                      >
                        {resort?.nameJa ?? member.nameJa}
                        {resort && !resort.isActive && (
                          <span className="ml-1 text-xs text-gray-500">
                            （公開停止中）
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </p>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      setDraft({
                        id: group.id,
                        updatedAt: group.updatedAt,
                        label: group.label ?? "",
                        ids: group.members.map(member => member.id),
                        labels: memberLabelsOf(group),
                      })
                    }
                  >
                    編集
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => setDeleting(group)}
                  >
                    削除
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border bg-white p-4 text-sm text-gray-500">
          まだありません。
        </p>
      )}
      {draft && (
        <DisplayGroupEditor
          draft={draft}
          resorts={resorts}
          onClose={() => setDraft(null)}
          onSaved={group => {
            setGroups(current =>
              current.some(item => item.id === group.id)
                ? current.map(item => (item.id === group.id ? group : item))
                : [...current, group],
            );
            setDraft(null);
            setError(null);
            setMessage("同時表示の組を保存しました。");
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => {
          if (!open) setDeleting(null);
        }}
        title="同時表示の組を削除しますか？"
        description="組に入っているすべてのスキー場の詳細画面から、この「同時に表示」が消えます。スキー場のデータは変わりません。"
        confirmLabel="削除"
        cancelLabel="キャンセル"
        onConfirm={() => {
          if (deleting) remove(deleting);
          setDeleting(null);
        }}
      />
    </section>
  );
}
