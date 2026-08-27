/** 外部地図アプリへのリンク。緯度経度をそのまま渡して位置を開く */

type Coordinate = {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
};

const hasCoordinate = (
  coordinate: Coordinate,
): coordinate is { latitude: number; longitude: number } =>
  typeof coordinate.latitude === "number" &&
  typeof coordinate.longitude === "number";

const toLatLng = (coordinate: { latitude: number; longitude: number }) =>
  `${coordinate.latitude},${coordinate.longitude}`;

export const getGoogleMapsUrl = (coordinate: Coordinate): string | null =>
  hasCoordinate(coordinate)
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(toLatLng(coordinate))}`
    : null;

export const getGoogleMapsDirectionsUrl = (
  coordinate: Coordinate,
): string | null =>
  hasCoordinate(coordinate)
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(toLatLng(coordinate))}`
    : null;

export const getAppleMapsUrl = (
  coordinate: Coordinate,
  name?: string,
): string | null => {
  if (!hasCoordinate(coordinate)) return null;

  const label = name ? `&q=${encodeURIComponent(name)}` : "";
  return `https://maps.apple.com/?ll=${toLatLng(coordinate)}${label}`;
};
