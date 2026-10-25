"use client";
import type { ReactNode } from "react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { withAnonymousCheck } from "./anonymousCheck";

/** Calculation inputs belong in POST bodies, never URLs or access logs. */
export function ReportErrorButton({
  resortId,
  kind,
  context,
  returnTo,
  label = "間違いを報告",
  children,
}: {
  resortId: string;
  kind: "ticket" | "source" | "other";
  context?: unknown;
  returnTo?: string;
  label?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<"edit" | "review" | "done">("edit");
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const operationKey = useRef(crypto.randomUUID());
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        className="whitespace-nowrap text-xs text-blue-700 underline decoration-dotted underline-offset-2"
        onClick={() => {
          if (step === "done") {
            setStep("edit");
            setComment("");
            setFiles([]);
            operationKey.current = crypto.randomUUID();
          }
          setOpen(true);
          setError("");
        }}
      >
        {children ?? label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="z-[1100] max-h-[85dvh] overflow-y-auto"
          overlayClassName="z-[1099]"
        >
          <DialogTitle>
            {kind === "ticket"
              ? "料金の誤りを報告"
              : kind === "source"
                ? "出典表記の誤りを報告"
                : "その他の修正"}
          </DialogTitle>
          <DialogDescription>
            匿名で送信できます。内容と写真は管理者だけが確認します。
          </DialogDescription>
          {step === "done" ? (
            <>
              <p className="text-sm">
                報告を受け付けました。管理者が確認します。
              </p>
              <Button onClick={() => setOpen(false)}>元の画面に戻る</Button>
            </>
          ) : (
            <>
              {kind !== "other" && (
                <p className="rounded bg-slate-50 p-2 text-sm">
                  {kind === "ticket"
                    ? "対象の料金と計算条件を自動添付します。正しい金額の入力は不要です。"
                    : "対象のコース・リフト、出典表記とURLを自動添付します。"}
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              {step === "edit" ? (
                <>
                  <label className="text-sm">
                    {kind === "other" ? "修正内容" : "補足（任意）"}
                    <textarea
                      value={comment}
                      onChange={event => setComment(event.target.value)}
                      maxLength={2000}
                      rows={3}
                      className="mt-1 w-full rounded border p-2"
                    />
                  </label>
                  <label className="text-sm">
                    写真（任意・最大3枚）
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif"
                      multiple
                      onChange={event => {
                        const selected = Array.from(event.target.files ?? []);
                        if (selected.length > 3) {
                          setFiles([]);
                          setError("写真は3枚までです。");
                          event.target.value = "";
                          return;
                        }
                        setFiles(selected);
                        setError("");
                      }}
                      className="mt-1 block w-full"
                    />
                  </label>
                  <p className="text-xs text-slate-500">
                    写真は当サイト内だけで利用し、サイト外で二次利用しません。
                  </p>
                  <Button
                    disabled={busy || (kind === "other" && !comment.trim())}
                    onClick={() => setStep("review")}
                  >
                    内容を確認
                  </Button>
                </>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm">{comment}</p>
                  {files.length > 0 && (
                    <p className="text-sm">
                      写真 {files.length}枚（管理者のみ閲覧）
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setStep("edit")}
                    >
                      入力に戻る
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            const attached =
                              context &&
                              typeof context === "object" &&
                              !Array.isArray(context)
                                ? (context as Record<string, unknown>)
                                : { target: context ?? null };
                            const photos = new FormData();
                            for (const file of files)
                              photos.append("photos", file);
                            const { submitCorrection } = await import(
                              "./actions"
                            );
                            const answer = await withAnonymousCheck(proof =>
                              submitCorrection(
                                {
                                  operationKey: operationKey.current,
                                  proof,
                                  resortId,
                                  context: attached,
                                  returnTo:
                                    returnTo ??
                                    `${location.pathname}${location.search}`,
                                  items: [
                                    {
                                      targetKind: kind,
                                      field: "description",
                                      proposed:
                                        kind === "other" ? comment : attached,
                                      action: "change",
                                    },
                                  ],
                                  comment,
                                },
                                photos,
                              ),
                            );
                            if (answer.ok) {
                              setStep("done");
                              setFiles([]);
                            } else setError(answer.error);
                          } catch {
                            setError(
                              "送信できませんでした。少し待ってからお試しください。",
                            );
                          }
                        })
                      }
                    >
                      {busy ? "送信中…" : "送信する"}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
