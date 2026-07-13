const R = 6371; // promień Ziemi w km

const toRad = (d: number) => (d * Math.PI) / 180;

/** Odległość po wielkim kole w km między dwoma punktami [lng, lat]. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const [lngA, latA] = a;
  const [lngB, latB] = b;
  const φ1 = toRad(latA);
  const φ2 = toRad(latB);
  const Δφ = toRad(latB - latA);
  const Δλ = toRad(lngB - lngA);
  const h =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Ogranicza liczbę punktów trasy dodawanych do heatmapy (rozkład równomierny wzdłuż trasy). */
export function downsampleForHeatmap(
  coords: [number, number][],
  maxPoints = 150,
): [number, number][] {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < maxPoints; i++) out.push(coords[Math.round(i * step)]);
  return out;
}
