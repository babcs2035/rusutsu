"use client";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFavorites } from "./FavoritesProvider";
export function FavoriteButton({
  resortId,
  name,
}: {
  resortId: string;
  name?: string;
}) {
  const favorites = useFavorites();
  if (!favorites) return null;
  const selected = favorites.ids.includes(resortId);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9 shrink-0 text-amber-600"
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
      <Star size={20} fill={selected ? "currentColor" : "none"} />
    </Button>
  );
}
