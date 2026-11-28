"use client";
import { UserRound } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFavorites } from "./FavoritesProvider";
export function AccountButton({ compact = false }: { compact?: boolean }) {
  const favorites = useFavorites();
  if (!favorites) return null;
  return <ConnectedAccountButton favorites={favorites} compact={compact} />;
}
function ConnectedAccountButton({
  favorites,
  compact,
}: {
  favorites: NonNullable<ReturnType<typeof useFavorites>>;
  compact: boolean;
}) {
  const { data: session, status } = useSession();
  return (
    <Button
      type="button"
      variant={session?.user ? "ghost" : "default"}
      className={cn(
        "h-10 shrink-0 rounded-full text-xs font-semibold md:text-sm",
        session?.user
          ? "w-10 border-0 p-0 hover:bg-transparent"
          : "px-3 shadow-sm",
        compact && !session?.user && "max-[420px]:size-10 max-[420px]:p-0",
      )}
      disabled={status === "loading"}
      aria-label={session?.user ? "アカウント情報" : "ログイン"}
      onClick={() =>
        session?.user ? favorites.openAccount() : favorites?.login()
      }
    >
      {session?.user ? (
        session.user.image ? (
          // Google provides this image; fixed dimensions prevent header shifts.
          // biome-ignore lint/performance/noImgElement: authenticated external avatar
          <img
            src={session.user.image}
            alt="プロフィール"
            className="size-8 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <UserRound size={20} />
        )
      ) : (
        <>
          {compact && <UserRound className="size-5 min-[421px]:hidden" />}
          <span className={compact ? "max-[420px]:hidden" : undefined}>
            ログイン
          </span>
        </>
      )}
    </Button>
  );
}
