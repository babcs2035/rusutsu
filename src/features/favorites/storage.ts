import { z } from "zod";

export const FAVORITES_KEY = "rusutsu:favorites:v1";
export const favoriteIdsSchema = z.array(z.string().min(1).max(200)).max(2000);
export const localFavoritesSchema = z.object({
  version: z.literal(1),
  method: z.literal("browser").nullable(),
  ids: favoriteIdsSchema,
});
export type LocalFavorites = z.infer<typeof localFavoritesSchema>;
export const emptyFavorites: LocalFavorites = {
  version: 1,
  method: null,
  ids: [],
};
export function parseLocalFavorites(raw: string | null): LocalFavorites {
  try {
    const parsed = localFavoritesSchema.safeParse(JSON.parse(raw ?? "null"));
    return parsed.success
      ? { ...parsed.data, ids: [...new Set(parsed.data.ids)] }
      : { ...emptyFavorites };
  } catch {
    return { ...emptyFavorites };
  }
}
export function setFavorite(
  ids: readonly string[],
  id: string,
  added: boolean,
) {
  return [...new Set(added ? [...ids, id] : ids.filter(value => value !== id))];
}
