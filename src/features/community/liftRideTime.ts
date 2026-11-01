export function getLiftDistance(
  distance: number | null | undefined,
  slopeDistance: number | null | undefined,
) {
  if (distance != null && Number.isFinite(distance) && distance > 0)
    return distance;
  if (
    slopeDistance != null &&
    Number.isFinite(slopeDistance) &&
    slopeDistance > 0
  )
    return slopeDistance;
  return null;
}

export function rideTimeParts(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0)
    return ["", ""] as const;
  const rounded = Math.max(1, Math.round(seconds));
  return [String(Math.floor(rounded / 60)), String(rounded % 60)] as const;
}

export function speedFromRideTime(
  distance: number | null,
  seconds: number | null,
) {
  return distance != null && seconds != null && seconds > 0
    ? distance / seconds
    : null;
}

export function rideTimeFromSpeed(
  distance: number | null,
  speed: number | null,
) {
  return distance != null && speed != null && speed > 0
    ? rideTimeParts(distance / speed)
    : (["", ""] as const);
}
