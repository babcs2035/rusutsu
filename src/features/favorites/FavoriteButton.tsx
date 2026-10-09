"use client";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFavorites } from "./FavoritesProvider";
export function FavoriteButton({
  resortId,
  name,
  className,
}: {
  resortId: string;
  name?: string;
  className?: string;
}) {
  const favorites = useFavorites();
  if (!favorites) return null;
  const selected = favorites.ids.includes(resortId);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "size-9 shrink-0 text-pink-500 hover:bg-pink-50 hover:text-pink-600",
        className,
      )}
      disabled={!favorites.ready}
      aria-pressed={selected}
      aria-label={`${name ?? "スキー場"}をお気に入り${selected ? "から解除" : "に追加"}`}
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation();
        favorites.toggle(resortId);
      }}
    >
      <Heart size={20} fill={selected ? "currentColor" : "none"} />
    </Button>
  );
}
