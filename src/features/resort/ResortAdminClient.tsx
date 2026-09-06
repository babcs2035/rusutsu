"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { adminToaster } from "@/app/admin/AdminToaster";
import type { AdminSkiResortRecord } from "@/server/ski-resorts/adminContract";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { StepIndicator } from "@/shared/components/StepIndicator";
import { ResortEditForm } from "./ResortEditForm";
import { ResortSelectStep } from "./ResortSelectStep";

const STEPS = [
  { id: "select", label: "スキー場選択" },
  { id: "detail", label: "詳細設定" },
];

type LeaveDestination = "select" | "admin";

export function ResortAdminClient({
  initialResorts,
}: {
  initialResorts: AdminSkiResortRecord[];
}) {
  const router = useRouter();
  const [resorts, setResorts] = useState(initialResorts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedResortId, setSavedResortId] = useState<string | null>(null);
  const [leaveDestination, setLeaveDestination] =
    useState<LeaveDestination | null>(null);
  const selectedResort = resorts.find(resort => resort.id === selectedId);

  useEffect(() => {
    if (!hasChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  const leaveEditor = (destination: LeaveDestination) => {
    setHasChanges(false);
    setLeaveDestination(null);
    if (destination === "admin") router.push("/admin");
    else setIsEditing(false);
  };

  const requestLeave = (destination: LeaveDestination) => {
    if (isSaving) return;
    if (hasChanges) setLeaveDestination(destination);
    else leaveEditor(destination);
  };

  const handleSaved = useCallback((saved: AdminSkiResortRecord) => {
    setResorts(current =>
      current.map(resort => (resort.id === saved.id ? saved : resort)),
    );
    setHasChanges(false);
    setIsSaving(false);
    setSavedResortId(saved.id);
    adminToaster.create({
      title: "スキー場情報を保存しました。",
      type: "success",
    });
  }, []);

  return (
    <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      <header className="flex min-w-0 shrink-0 flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-3 py-1.5">
        <h1 className="shrink-0 font-bold font-[var(--font-heading)] text-sm">
          スキー場マスター編集
        </h1>
        <div className="min-w-0 flex-1">
          <StepIndicator
            steps={STEPS}
            currentStepId={isEditing ? "detail" : "select"}
            onSelectStep={() => requestLeave("select")}
            canSelectStep={step => step === "select" && !isSaving}
          />
        </div>
        {isEditing && selectedResort && (
          <span className="hidden max-w-[240px] truncate text-sm text-gray-700 md:block">
            {selectedResort.nameJa}
          </span>
        )}
        <Link
          href="/admin"
          className="shrink-0 rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          aria-disabled={isSaving}
          onNavigate={event => {
            if (isSaving || hasChanges) {
              event.preventDefault();
              requestLeave("admin");
            }
          }}
        >
          管理画面
        </Link>
      </header>
      {isEditing && selectedResort ? (
        <ResortEditForm
          key={`${selectedResort.id}:${selectedResort.updatedAt}`}
          resort={selectedResort}
          hasChanges={hasChanges}
          wasSaved={savedResortId === selectedResort.id}
          onSaved={handleSaved}
          onDirtyChange={setHasChanges}
          onPendingChange={setIsSaving}
          onBack={() => requestLeave("select")}
        />
      ) : (
        <div className="min-h-0 flex-1">
          <ResortSelectStep
            resorts={resorts}
            selectedResortId={selectedId}
            onSelectResort={setSelectedId}
            query={query}
            onQueryChange={setQuery}
            onStart={() => setIsEditing(true)}
          />
        </div>
      )}
      <ConfirmDialog
        open={leaveDestination !== null}
        onOpenChange={open => {
          if (!open) setLeaveDestination(null);
        }}
        title="未保存の変更があります"
        description="変更を保存せずに移動すると、入力内容は失われます。保存する場合は編集に戻って「変更を保存」を押してください。"
        confirmLabel="変更を破棄して移動"
        cancelLabel="編集に戻る"
        onConfirm={() => {
          if (leaveDestination) leaveEditor(leaveDestination);
        }}
      />
    </main>
  );
}
