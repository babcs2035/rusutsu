"use client";

import { Flag } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { reportCommunityContent } from "@/features/community/actions";
import { withAnonymousCheck } from "@/features/corrections/anonymousCheck";
import { cn } from "@/lib/utils";

const REASONS = ["不適切な内容", "迷惑行為", "個人情報", "その他"] as const;

/** 投稿の通報。ログイン不要で、理由と任意の詳細を送る。 */
export function PostReportButton({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);

  const submit = async () => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setError("");
    try {
      const result = await withAnonymousCheck(proof =>
        reportCommunityContent(postId, reason, body, proof),
      );
      if (result.ok) setDone(true);
      else setError(result.error);
    } catch {
      setError("通報を送信できませんでした。");
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-7 gap-1 px-2 text-xs whitespace-nowrap text-gray-500"
        onClick={() => {
          setDone(false);
          setError("");
          setOpen(true);
        }}
      >
        <Flag className="size-3.5" />
        通報
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="z-[1000] gap-3" overlayClassName="z-[999]">
          <DialogTitle>この投稿を通報</DialogTitle>
          {done ? (
            <>
              <DialogDescription>通報を受け付けました。</DialogDescription>
              <Button type="button" onClick={() => setOpen(false)}>
                閉じる
              </Button>
            </>
          ) : (
            <>
              <DialogDescription className="sr-only">
                通報の理由を選んでください。
              </DialogDescription>
              <div className="grid grid-cols-2 gap-2">
                {REASONS.map(item => (
                  <Button
                    key={item}
                    type="button"
                    variant="outline"
                    aria-pressed={reason === item}
                    className={cn(
                      "h-8 text-xs whitespace-nowrap",
                      reason === item &&
                        "border-sky-600 bg-sky-50 text-sky-800 hover:bg-sky-100",
                    )}
                    onClick={() => setReason(item)}
                  >
                    {item}
                  </Button>
                ))}
              </div>
              <Textarea
                aria-label="詳しい内容"
                placeholder="詳しい内容（任意）"
                maxLength={2000}
                value={body}
                onChange={event => setBody(event.target.value)}
              />
              {error && (
                <p role="alert" className="text-xs text-red-700">
                  {error}
                </p>
              )}
              <Button
                type="button"
                disabled={sending}
                onClick={() => void submit()}
              >
                送信
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
