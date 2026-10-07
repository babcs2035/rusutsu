import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isPublicMapPathname } from "@/shared/utils/resortPath";

export default async function LoginError() {
  const jar = await cookies();
  try {
    const intent = JSON.parse(
      jar.get("rusutsu-favorite-intent")?.value ?? "null",
    );
    if (typeof intent?.returnTo === "string") {
      const url = new URL(intent.returnTo, "https://return.invalid");
      if (
        url.origin === "https://return.invalid" &&
        isPublicMapPathname(url.pathname) &&
        url.searchParams.get("favoriteLogin") === intent.nonce
      )
        // Next navigation adds the application's base path itself.
        redirect(`${url.pathname.slice(8) || "/"}${url.search}${url.hash}`);
    }
  } catch (error) {
    // Let Next's redirect control flow pass through.
    if (error instanceof Error && "digest" in error) throw error;
  }
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-lg font-semibold">ログインを完了できませんでした</h1>
      <p className="my-4 text-sm">
        お気に入りは追加されていません。必要なときに再度ログインできます。
      </p>
      <Link href="/">スキー場の検索へ戻る</Link>
    </main>
  );
}
