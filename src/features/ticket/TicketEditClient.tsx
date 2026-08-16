"use client";

// リフト券編集ワークスペースのクライアントラッパー。
// slope/lift と同じく dynamic 経由で読み込み，ローディング中は
// ヘッダー（h-16 = 4rem）を除く画面中央にスピナーを表示する。

import dynamic from "next/dynamic";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type {
  EnumLabelCatalog,
  TicketEditData,
  TicketFileOption,
  TicketSchemaSpec,
} from "./types";

// TicketEditWorkspace 内の ResortOption と同一の構造型
type ResortOption = { id: string; name: string };

const TicketEditWorkspace = dynamic(
  () =>
    import("./TicketEditWorkspace").then(module => module.TicketEditWorkspace),
  {
    ssr: false,
    loading: () => <LoadingSpinner className="h-[calc(100dvh-4rem)]" />,
  },
);

type TicketEditClientProps = {
  files: TicketFileOption[];
  resortOptions: ResortOption[];
  schemaSpec: TicketSchemaSpec;
  enumLabels: EnumLabelCatalog;
  initialData: TicketEditData | null;
};

export function TicketEditClient(props: TicketEditClientProps) {
  return <TicketEditWorkspace {...props} />;
}
