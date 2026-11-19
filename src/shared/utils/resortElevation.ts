export type MapElevation = { top: number; base: number };

type ElevationFields = {
  topElevation: number;
  baseElevation: number;
  verticalDrop: number;
};

/**
 * 地図のコースから出した山頂・山麓があれば、掲載元（SnowJapan）の標高と置き換える。
 * 標高差は地図の山頂−山麓。地図に標高が無ければ掲載元の値のまま返す。
 */
export const withMapElevation = <T extends ElevationFields>(
  resort: T,
  elevation: MapElevation | null | undefined,
): T =>
  elevation && elevation.top > elevation.base
    ? {
        ...resort,
        topElevation: elevation.top,
        baseElevation: elevation.base,
        verticalDrop: elevation.top - elevation.base,
      }
    : resort;
