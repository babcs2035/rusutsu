"use client";
import { UserRound } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
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
      variant="outline"
      className="h-10 w-14 shrink-0 rounded-full p-0 text-xs"
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
