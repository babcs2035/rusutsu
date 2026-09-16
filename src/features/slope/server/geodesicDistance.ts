/** WGS84楕円体上の距離（Vincenty逆解）。GeoJSONの経度・緯度順で受け取る。 */
export function geodesicDistance(
  a: readonly number[],
  b: readonly number[],
): number {
  const rad = Math.PI / 180;
  const major = 6378137;
  const flattening = 1 / 298.257223563;
  const minor = (1 - flattening) * major;
  const u1 = Math.atan((1 - flattening) * Math.tan(a[1] * rad));
  const u2 = Math.atan((1 - flattening) * Math.tan(b[1] * rad));
  const sinU1 = Math.sin(u1);
  const cosU1 = Math.cos(u1);
  const sinU2 = Math.sin(u2);
  const cosU2 = Math.cos(u2);
  const longitude = (b[0] - a[0]) * rad;
  let lambda = longitude;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    const sinSigma = Math.hypot(
      cosU2 * sinLambda,
      cosU1 * sinU2 - sinU1 * cosU2 * cosLambda,
    );
    if (sinSigma === 0) return 0;
    const cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    const sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    const cosSqAlpha = 1 - sinAlpha ** 2;
    const cos2SigmaM =
      cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;
    const c =
      (flattening / 16) * cosSqAlpha * (4 + flattening * (4 - 3 * cosSqAlpha));
    const next =
      longitude +
      (1 - c) *
        flattening *
        sinAlpha *
        (sigma +
          c *
            sinSigma *
            (cos2SigmaM + c * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
    if (Math.abs(next - lambda) < 1e-12) {
      const uSq = (cosSqAlpha * (major ** 2 - minor ** 2)) / minor ** 2;
      const coefficientA =
        1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
      const coefficientB =
        (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
      const deltaSigma =
        coefficientB *
        sinSigma *
        (cos2SigmaM +
          (coefficientB / 4) *
            (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
              (coefficientB / 6) *
                cos2SigmaM *
                (-3 + 4 * sinSigma ** 2) *
                (-3 + 4 * cos2SigmaM ** 2)));
      return minor * coefficientA * (sigma - deltaSigma);
    }
    lambda = next;
  }
  throw new Error("コースの測地距離を計算できませんでした");
}
