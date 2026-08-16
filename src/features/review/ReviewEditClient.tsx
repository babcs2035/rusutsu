"use client";

// レビュー編集ワークスペースのクライアントラッパー。
// slope/lift と同じく dynamic 経由で読み込み，ローディング中は
// ヘッダー（h-16 = 4rem）を除く画面中央にスピナーを表示する。

import dynamic from "next/dynamic";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type { ReviewEditData, ReviewResortOption } from "./types";

const ReviewEditWorkspace = dynamic(
  () =>
    import("./ReviewEditWorkspace").then(module => module.ReviewEditWorkspace),
  {
    ssr: false,
    loading: () => <LoadingSpinner className="h-[calc(100dvh-4rem)]" />,
  },
);

type ReviewEditClientProps = {
  resorts: ReviewResortOption[];
  initialResortId: string | null;
  initialData: ReviewEditData | null;
};

export function ReviewEditClient(props: ReviewEditClientProps) {
  return <ReviewEditWorkspace {...props} />;
}
