import { redirect } from "next/navigation";
import { correctionUrl } from "@/features/corrections/correctionEvents";

type Props = {
  params: Promise<{ resortId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 以前のリンクに入っていた対象（コース・リフト1本）を読み取る */
const targetFromContext = (value: string | string[] | undefined) => {
  if (typeof value !== "string") return undefined;
  try {
    const context = JSON.parse(value) as Record<string, unknown> | null;
    const id = context?.targetId;
    if (typeof id !== "string" || !id) return undefined;
    return context?.targetKind === "lift"
      ? { kind: "lift" as const, ids: [id] }
      : context?.targetKind === "slope"
        ? { kind: "slope" as const, ids: [id] }
        : undefined;
  } catch {
    return undefined;
  }
};

/**
 * 修正はスキー場詳細のパネルの中で行う。
 * 以前の専用ページのURLは、詳細を開いて修正パネルを出す形に引き継ぐ。
 */
export default async function CorrectionPage({ params, searchParams }: Props) {
  const [{ resortId }, query] = await Promise.all([params, searchParams]);
  redirect(
    correctionUrl({ resortId, target: targetFromContext(query.context) }),
  );
}
