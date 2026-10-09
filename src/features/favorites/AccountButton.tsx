"use client";
import { UserRound } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFavorites } from "./FavoritesProvider";
export function AccountButton() {
  const favorites = useFavorites();
  if (!favorites) return null;
  return <ConnectedAccountButton favorites={favorites} />;
}
function ConnectedAccountButton({
  favorites,
}: {
  favorites: NonNullable<ReturnType<typeof useFavorites>>;
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
          : "bg-blue-600 px-3 text-white shadow-sm hover:bg-blue-700",
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
        "ログイン"
      )}
    </Button>
  );
}
