export const pointInPolygon = (point: [number, number], polygon: number[][]): boolean => {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
};

export const distanceBetween = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const radiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return radiusKm * c;
};

export const bearingBetween = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const toDegrees = (value: number) => (value * 180) / Math.PI;
  const startLat = toRadians(lat1);
  const endLat = toRadians(lat2);
  const dLon = toRadians(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLon);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
};

export const isHeadingToward = (
  vesselCog: number,
  bearingToTarget: number,
  tolerance = 45
): boolean => {
  const diff = Math.abs(((vesselCog - bearingToTarget + 540) % 360) - 180);
  return diff <= tolerance;
};

export const getPolygonCenter = (polygon: number[][]): [number, number] => {
  if (polygon.length === 0) return [0, 0];
  const [lngTotal, latTotal] = polygon.reduce(
    ([lngSum, latSum], [lng, lat]) => [lngSum + lng, latSum + lat],
    [0, 0]
  );

  return [lngTotal / polygon.length, latTotal / polygon.length];
};
