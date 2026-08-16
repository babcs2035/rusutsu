// shadcn/ui AlertDialog をラップした確認ダイアログコンポーネント
// window.confirm() の代替として使用

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmDialogProps = {
  /** ダイアログの開閉状態を制御 */
  open: boolean;
  /** ダイアログを開閉するコールバック */
  onOpenChange: (open: boolean) => void;
  /** ダイアログのタイトル */
  title: string;
  /** ダイアログの説明文 */
  description: string;
  /** 確認ボタンクリック時の処理 */
  onConfirm: () => void;
  /** 確認ボタンのラベル（デフォルト: "確認"） */
  confirmLabel?: string;
  /** キャンセルボタンのラベル（デフォルト: "キャンセル"） */
  cancelLabel?: string;
};

/**
 * AlertDialog を使った確認ダイアログ
 *
 * @example
 * const [open, setOpen] = useState(false);
 * <ConfirmDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="削除"
 *   description="このユーザーを削除しますか？"
 *   onConfirm={() => deleteUser(id)}
 * />
 * <Button onClick={() => setOpen(true)}>削除</Button>
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "確認",
  cancelLabel = "キャンセル",
}: ConfirmDialogProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = () => {
    if (isConfirming) return;
    setIsConfirming(true);
    onConfirm();
    // 処理完了後にダイアログを閉じる
    setTimeout(() => {
      setIsConfirming(false);
      onOpenChange(false);
    }, 100);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              setIsConfirming(false);
              onOpenChange(false);
            }}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isConfirming}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
