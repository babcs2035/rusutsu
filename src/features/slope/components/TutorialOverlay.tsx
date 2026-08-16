"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const TUTORIAL_STEPS = [
  "スキー場を検索するか、地図上のマーカーをクリックして選びます。",
  "既存データ・下書きがある場合は「編集」を、なければ「新規作成」を選びます。",
  "「コースを追加」を押し、地図上でコースの始点から終点へ順にクリックして点を打ちます。オレンジの終点をクリック（または Esc）で描画を終えます。",
  "コース名を入力します。名前が分からない場合は「名前なし」ボタンを選びます（エクスポート時に「無名_1」のような名前が付きます）。",
  "必要なら次の画面でコースを上部・中部・下部などに分割します（圧雪やナイターの条件が途中で変わるコースにおすすめ）。",
  "難易度・滑走距離・斜度・圧雪・早朝営業・ナイター営業・画像URL・検索ワードを入力します。",
  "最後に確認画面で内容を確認し、slope_before へ保存します。必要なら各形式をファイルとしてダウンロードすることもできます。",
];

type TutorialOverlayProps = {
  open: boolean;
  onClose: () => void;
};

export function TutorialOverlay({ open, onClose }: TutorialOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-[640px] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle>コース入力の使い方</DialogTitle>
          <DialogDescription>
            以下の手順でコースを編集できます。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {TUTORIAL_STEPS.map((step, index) => (
            <div key={step} className="flex items-start gap-3">
              <div className="flex h-6 w-6 min-w-[24px] items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                {index + 1}
              </div>
              <p className="text-sm">{step}</p>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>はじめる</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
