"use client";

import {
  AlertTriangle,
  Check,
  FileJson,
  Save,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { loadTicketForEdit, saveTicketFile, validateTicket } from "./actions";
import { CollectionSection } from "./components/CollectionSection";
import { EditorProvider, ObjectFields } from "./components/FieldRenderer";
import { ValidationPanel } from "./components/ValidationPanel";
import { loadDraft, useDraftStorage } from "./hooks/useDraftStorage";
import { labelOf, TICKET_SECTIONS } from "./presentation";
import type {
  EnumLabelCatalog,
  FieldSpec,
  TicketDocument,
  TicketEditData,
  TicketFileOption,
  TicketSchemaSpec,
  ValidationReport,
} from "./types";
import { type NodePath, type NodeUpdate, setAtPath } from "./utils/nodeOps";
import {
  buildIdIndex,
  findDanglingReferences,
  findDuplicateIds,
} from "./utils/references";

type ResortOption = { id: string; name: string };

const STATUS_LABELS: Record<string, string> = {
  complete: "確定",
  needs_review: "要確認",
  failed: "取得失敗",
};

const fileKeyOf = (resortId: string, fileName: string) =>
  `${resortId}/${fileName}`;

export function TicketEditWorkspace({
  files,
  resortOptions,
  schemaSpec,
  enumLabels,
  initialData,
}: {
  files: TicketFileOption[];
  resortOptions: ResortOption[];
  schemaSpec: TicketSchemaSpec;
  enumLabels: EnumLabelCatalog;
  initialData: TicketEditData | null;
}) {
  const [selected, setSelected] = useState<{
    resortId: string;
    fileName: string;
  } | null>(
    initialData
      ? { resortId: initialData.resortId, fileName: initialData.fileName }
      : null,
  );
  const [data, setData] = useState<TicketDocument | null>(
    initialData?.data ?? null,
  );
  const [fileHash, setFileHash] = useState<string | null>(
    initialData?.fileHash ?? null,
  );
  const [savedSnapshot, setSavedSnapshot] = useState(
    initialData ? JSON.stringify(initialData.data) : "",
  );
  const [sectionId, setSectionId] = useState("overview");
  const [filter, setFilter] = useState("");
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [openFileDialogOpen, setOpenFileDialogOpen] = useState(false);
  const [openFileDraftDialogOpen, setOpenFileDraftDialogOpen] = useState(false);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [pendingOpenFile, setPendingOpenFile] = useState<{
    resortId: string;
    fileName: string;
  } | null>(null);
  const [pendingDraft, setPendingDraft] = useState<{
    data: unknown;
    fileHash: string;
    updatedAt: string;
  } | null>(null);

  const dirty = data !== null && JSON.stringify(data) !== savedSnapshot;
  const draft = useDraftStorage(
    selected?.resortId ?? null,
    selected?.fileName ?? null,
    fileHash,
    data,
    dirty,
  );

  const filteredFiles = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase("ja");
    if (query === "") return files;
    return files.filter(file =>
      [file.resortName, file.resortId, file.fileName, file.seasonLabelJa ?? ""]
        .join(" ")
        .toLocaleLowerCase("ja")
        .includes(query),
    );
  }, [files, filter]);

  const selectedFile = files.find(
    file =>
      selected !== null &&
      file.resortId === selected.resortId &&
      file.fileName === selected.fileName,
  );

  const idIndex = useMemo(() => buildIdIndex(data ?? {}), [data]);
  const localIssues = useMemo(
    () =>
      data === null
        ? []
        : [...findDuplicateIds(data), ...findDanglingReferences(data)],
    [data],
  );

  const update = useCallback((path: NodePath, value: NodeUpdate) => {
    setData(current =>
      current === null ? current : setAtPath(current, path, value),
    );
    setMessage(null);
    setReport(null);
  }, []);

  const editorValue = useMemo(
    () => ({ idIndex, enumLabels, resortOptions, update }),
    [idIndex, enumLabels, resortOptions, update],
  );

  const openFile = (resortId: string, fileName: string) => {
    if (selected?.resortId === resortId && selected?.fileName === fileName) {
      return;
    }
    if (dirty) {
      setPendingOpenFile({ resortId, fileName });
      setOpenFileDialogOpen(true);
      return;
    }
    doOpenFile(resortId, fileName);
  };

  const handleOpenFileConfirm = () => {
    const file = pendingOpenFile;
    if (!file) {
      setOpenFileDialogOpen(false);
      return;
    }
    doOpenFile(file.resortId, file.fileName);
    setOpenFileDialogOpen(false);
    setPendingOpenFile(null);
  };

  const handleOpenFileDraftConfirm = () => {
    const draft = pendingDraft;
    if (!draft || !pendingOpenFile) {
      setOpenFileDraftDialogOpen(false);
      setPendingDraft(null);
      setPendingOpenFile(null);
      return;
    }
    setMessage(null);
    setReport(null);
    startTransition(async () => {
      try {
        const next = await loadTicketForEdit(
          pendingOpenFile.resortId,
          pendingOpenFile.fileName,
        );
        setSelected(pendingOpenFile);
        setData(draft.data as TicketDocument);
        setFileHash(next.fileHash);
        setSavedSnapshot(JSON.stringify(next.data));
        setSectionId("overview");
      } catch {
        setMessage({
          tone: "error",
          text: "リフト券JSONを読み込めませんでした。",
        });
      }
    });
    setOpenFileDraftDialogOpen(false);
    setPendingDraft(null);
    setPendingOpenFile(null);
  };

  const doOpenFile = (resortId: string, fileName: string) => {
    setMessage(null);
    setReport(null);
    startTransition(async () => {
      try {
        const next = await loadTicketForEdit(resortId, fileName);
        const stored = loadDraft(resortId, fileName);
        if (
          stored !== null &&
          stored.fileHash === next.fileHash &&
          JSON.stringify(stored.data) !== JSON.stringify(next.data)
        ) {
          setPendingOpenFile({ resortId, fileName });
          setPendingDraft(stored);
          setOpenFileDraftDialogOpen(true);
          return;
        }
        setSelected({ resortId, fileName });
        setData(next.data);
        setFileHash(next.fileHash);
        setSavedSnapshot(JSON.stringify(next.data));
        setSectionId("overview");
      } catch {
        setMessage({
          tone: "error",
          text: "リフト券JSONを読み込めませんでした。",
        });
      }
    });
  };

  const runValidation = () => {
    if (data === null) return;
    setMessage(null);
    startTransition(async () => {
      setReport(await validateTicket(data));
    });
  };

  const save = () => {
    if (data === null || selected === null || fileHash === null) return;
    setMessage(null);
    startTransition(async () => {
      const result = await saveTicketFile({
        resortId: selected.resortId,
        fileName: selected.fileName,
        data,
        fileHash,
      });
      setReport(result.ok ? result.report : (result.report ?? null));
      if (result.ok) {
        setData(result.data.data);
        setFileHash(result.data.fileHash);
        setSavedSnapshot(JSON.stringify(result.data.data));
        draft.markSavedToServer();
        const warnings = result.report.issues.filter(
          issue => issue.level === "warning",
        ).length;
        setMessage({
          tone: "success",
          text:
            warnings === 0
              ? "検証を通過し、保存しました。"
              : `検証を通過し、保存しました。警告が${warnings}件あります（「検証」タブで確認できます）。`,
        });
      } else {
        setMessage({ tone: "error", text: result.errors.join("\n") });
        // 何を直せばよいかは検証結果にしか書かれていないので、そこへ移す
        if (result.report !== null) setSectionId("validation");
      }
    });
  };

  const revert = () => {
    if (savedSnapshot === "" || !dirty) return;
    setRevertDialogOpen(true);
  };

  const handleRevertConfirm = () => {
    if (savedSnapshot === "" || !dirty) return;
    setData(JSON.parse(savedSnapshot) as TicketDocument);
    draft.discard();
    setMessage(null);
    setReport(null);
    setRevertDialogOpen(false);
  };

  const section = TICKET_SECTIONS.find(item => item.id === sectionId);
  const fieldSpecOf = (key: string): FieldSpec | null =>
    schemaSpec.fields.find(field => field.key === key)?.spec ?? null;

  const countOf = (key: string): number | null => {
    const value = data?.[key];
    return Array.isArray(value) ? value.length : null;
  };

  return (
    <div className="flex h-[100dvh] bg-gray-100 text-gray-900 overflow-hidden">
      <div
        // §15: lg 未満では 40vw 上限でサイドバーを縮小し，メイン（エディタ）に幅を回す
        className="w-[min(250px,40vw)] lg:w-[300px] flex-shrink-0 bg-[var(--sidebar-dark)] text-white overflow-y-auto border-r border-white/20"
        role="complementary"
      >
        <div className="p-5 sticky top-0 z-10 bg-[var(--sidebar-dark)]">
          <p className="text-blue-200 text-xs font-bold">RUSUTSU DATA TOOLS</p>
          <h2 className="mt-4 text-2xl font-bold font-[var(--font-heading)]">
            リフト券編集
          </h2>
          <Input
            className="mt-4 h-9 w-full rounded-md border border-transparent bg-white px-3 text-sm text-gray-900 shadow-sm"
            size={30}
            value={filter}
            placeholder="スキー場・シーズンを検索"
            onChange={event => setFilter(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-8 px-3 pb-24">
          {filteredFiles.length === 0 ? (
            <p className="px-4 text-gray-400 text-xs">
              編集できるリフト券JSONがありません。
            </p>
          ) : (
            filteredFiles.map(file => {
              const isSelected =
                selected?.resortId === file.resortId &&
                selected?.fileName === file.fileName;
              return (
                <Button
                  key={fileKeyOf(file.resortId, file.fileName)}
                  type="button"
                  variant={isSelected ? "default" : "ghost"}
                  className={`h-auto min-h-[64px] px-3 py-2.5 justify-start text-left whitespace-normal ${
                    isSelected
                      ? "bg-blue-500 hover:!bg-blue-500"
                      : "bg-transparent hover:bg-white/20"
                  }`}
                  disabled={isPending}
                  onClick={() => openFile(file.resortId, file.fileName)}
                >
                  <div className="w-full">
                    <div className="flex items-center justify-between gap-8">
                      <p className="text-sm font-bold font-[var(--font-heading)]">
                        {file.resortName}
                      </p>
                      {file.status !== null && (
                        <span
                          className={cn(
                            "px-1.5 rounded-full bg-white/20 text-white font-bold text-[0.6875rem]",
                          )}
                        >
                          {STATUS_LABELS[file.status] ?? file.status}
                        </span>
                      )}
                    </div>
                    <div className="mt-4 gap-6 flex items-center flex-wrap">
                      <span
                        className={cn(
                          isSelected ? "text-blue-100" : "text-gray-400",
                          "text-[0.6875rem]",
                        )}
                      >
                        {file.seasonId}
                      </span>
                      {file.isDraft && (
                        <span
                          className={cn(
                            "px-1.5 rounded-full bg-white/30 text-white font-bold text-[0.6875rem]",
                          )}
                        >
                          草案
                        </span>
                      )}
                      <span
                        className={cn(
                          isSelected ? "text-blue-100" : "text-gray-500",
                          "text-[0.6875rem]",
                        )}
                      >
                        料金{file.offerCount}件
                      </span>
                      {file.humanReviewCount > 0 && (
                        <div
                          className={cn(
                            "flex items-center gap-2 text-orange-200",
                            "text-[0.6875rem]",
                          )}
                        >
                          <AlertTriangle size={11} />
                          {file.humanReviewCount}
                        </div>
                      )}
                    </div>
                  </div>
                </Button>
              );
            })
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 flex flex-col">
        {/* §18 共通: 狭い幅で折り返す（gap-y を抑制して折り返し時の縦間隔を縮小） */}
        <div className="flex flex-wrap items-center justify-between gap-x-12 gap-y-2 px-4 lg:px-7 py-3 bg-white border-b border-gray-200">
          <div className="min-w-0">
            <p className="text-gray-500 text-xs font-bold">
              {selected === null
                ? "ファイル未選択"
                : `${selected.resortId} / tickets/${selected.fileName}`}
            </p>
            <h3 className="text-lg font-semibold line-clamp-1 font-[var(--font-heading)]">
              {selectedFile
                ? `${selectedFile.resortName} ${selectedFile.seasonLabelJa ?? selectedFile.seasonId}`
                : "リフト券JSONを選択してください"}
            </h3>
          </div>
          {/* 幅不足時はボタンを折り返す（320px では 1 行に収まらない） */}
          <div className="flex flex-wrap items-center gap-3 lg:gap-12">
            {draft.savedAt !== null && (
              <p className="text-gray-500 text-[0.6875rem]">下書き保存済み</p>
            )}
            {dirty && (
              <p className="text-orange-900 text-xs font-bold">未保存</p>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!dirty || isPending}
              onClick={revert}
            >
              <Undo2 size={16} />
              元に戻す
            </Button>
            <Button
              type="button"
              size="sm"
              variant="default"
              disabled={data === null || !dirty || isPending}
              onClick={save}
            >
              <Save size={17} />
              検証して保存
            </Button>
          </div>
        </div>

        <div className="px-4 lg:px-7 pt-12 bg-white">
          {message && (
            <div
              className={cn(
                "mb-8 flex items-center gap-8",
                message.tone === "success" ? "text-green-900" : "text-red-700",
              )}
            >
              {message.tone === "success" && <Check size={16} />}
              <p className="whitespace-pre-wrap text-xs font-bold">
                {message.text}
              </p>
            </div>
          )}
          <div className="flex gap-4 overflow-x-auto border-b border-gray-200">
            {TICKET_SECTIONS.map(item => {
              const count =
                item.kind === "array" ? countOf(item.keys[0]) : null;
              return (
                <Button
                  key={item.id}
                  type="button"
                  size="sm"
                  variant={sectionId === item.id ? "default" : "ghost"}
                  className="shrink-0 rounded-t-lg"
                  onClick={() => setSectionId(item.id)}
                >
                  {item.title}
                  {count !== null && (
                    <span className="ml-4 text-[0.6875rem] opacity-80">
                      {count}
                    </span>
                  )}
                </Button>
              );
            })}
            <Button
              type="button"
              size="sm"
              variant={sectionId === "validation" ? "default" : "ghost"}
              className="shrink-0 rounded-t-lg"
              onClick={() => setSectionId("validation")}
            >
              <ShieldCheck size={15} />
              検証
              {localIssues.length > 0 && (
                <Badge
                  variant="destructive"
                  className="px-1.5 text-[0.6875rem]"
                >
                  {localIssues.length}
                </Badge>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={sectionId === "json" ? "default" : "ghost"}
              className="shrink-0 rounded-t-lg"
              onClick={() => setSectionId("json")}
            >
              <FileJson size={15} />
              JSON
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 lg:px-7 py-4 lg:p-7">
          {data === null ? (
            <p className="text-gray-500">
              左の一覧から編集するリフト券JSONを選択してください。
            </p>
          ) : (
            <EditorProvider value={editorValue}>
              {sectionId === "validation" ? (
                <ValidationPanel
                  report={report}
                  localIssues={localIssues}
                  isPending={isPending}
                  onRun={runValidation}
                />
              ) : sectionId === "json" ? (
                <div className="max-w-[1000px] mx-auto">
                  <p className="mb-8 text-gray-600 text-xs">
                    保存時に書き出される内容です（読み取り専用）。キー順序は元ファイルのまま保たれます。
                  </p>
                  <pre className="p-4 rounded-xl bg-slate-900 text-gray-100 text-[0.6875rem] leading-relaxed overflow-x-auto">
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </div>
              ) : section === undefined ? null : section.kind === "array" ? (
                (() => {
                  const key = section.keys[0];
                  const spec = fieldSpecOf(key);
                  if (spec === null || spec.kind !== "array") {
                    return (
                      <p className="text-red-700">
                        {labelOf(key)} の定義をschemaから読み取れませんでした。
                      </p>
                    );
                  }
                  const items = Array.isArray(data[key])
                    ? (data[key] as unknown[])
                    : [];
                  return (
                    <CollectionSection
                      collectionKey={key}
                      title={section.title}
                      description={section.description}
                      spec={spec}
                      items={items}
                      data={data}
                      idIndex={idIndex}
                      update={update}
                    />
                  );
                })()
              ) : (
                <div className="flex flex-col gap-20 max-w-[1100px] mx-auto">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold">
                        {section.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="mt-8 text-gray-600 text-xs leading-relaxed">
                        {section.description}
                      </p>
                    </CardContent>
                  </Card>
                  {section.id === "overview" ? (
                    <Card>
                      <CardContent className="p-4 md:p-5">
                        <ObjectFields
                          path={[]}
                          spec={{
                            ...schemaSpec,
                            fields: schemaSpec.fields.filter(field =>
                              section.keys.includes(field.key),
                            ),
                          }}
                          value={data}
                          depth={0}
                        />
                      </CardContent>
                    </Card>
                  ) : (
                    (() => {
                      const key = section.keys[0];
                      const spec = fieldSpecOf(key);
                      if (spec === null || spec.kind !== "object") {
                        return (
                          <p className="text-red-700">
                            {labelOf(key)}{" "}
                            の定義をschemaから読み取れませんでした。
                          </p>
                        );
                      }
                      return (
                        <Card>
                          <CardContent className="p-4 md:p-5">
                            <ObjectFields
                              path={[key]}
                              spec={spec}
                              value={data[key]}
                              depth={0}
                            />
                          </CardContent>
                        </Card>
                      );
                    })()
                  )}
                </div>
              )}
            </EditorProvider>
          )}
        </div>
        <ConfirmDialog
          open={openFileDialogOpen}
          onOpenChange={open => {
            if (!open) {
              setOpenFileDialogOpen(false);
              setPendingOpenFile(null);
            }
          }}
          title="移動確認"
          description="保存していない変更があります。破棄して移動しますか？"
          onConfirm={handleOpenFileConfirm}
          confirmLabel="移動する"
        />
        <ConfirmDialog
          open={openFileDraftDialogOpen}
          onOpenChange={open => {
            if (!open) {
              setOpenFileDraftDialogOpen(false);
              setPendingDraft(null);
              setPendingOpenFile(null);
            }
          }}
          title="下書きからの再開"
          description={`このファイルには未保存の下書き（${pendingDraft?.updatedAt ?? ""}）があります。下書きから再開しますか？\nいいえを選ぶとファイルの内容を読み込みます。`}
          onConfirm={handleOpenFileDraftConfirm}
          confirmLabel="再開する"
        />
        <ConfirmDialog
          open={revertDialogOpen}
          onOpenChange={setRevertDialogOpen}
          title="内容の破棄"
          description="編集内容を破棄してファイルの内容に戻しますか？"
          onConfirm={handleRevertConfirm}
          confirmLabel="破棄する"
        />
      </div>
    </div>
  );
}
