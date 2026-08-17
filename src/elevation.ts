import { haversineKm } from "./geo";
import type { RouteMeta } from "./types";
import { routeGpxUrl } from "./data";

export type ElevationPoint = { distanceKm: number; elevationM: number; lng: number; lat: number };

const cache = new Map<string, ElevationPoint[] | null>();

// Ogranicza liczbę punktów w wykresie — GPX bywa gęsty (tysiące trkpt), a do samej
// sylwetki profilu wystarczy dużo mniej próbek.
const MAX_POINTS = 300;

function downsample(points: ElevationPoint[], maxPoints: number): ElevationPoint[] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const out: ElevationPoint[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(points[Math.round(i * step)]);
  return out;
}

/**
 * Wczytuje surowy plik GPX trasy i wyciąga profil wysokości (dystans skumulowany + elevacja).
 * Parsowane po stronie klienta natywnym DOMParser (bez dociągania parsera XML do bundla) —
 * dane GPX i tak trzeba pobrać do przycisku "Pobierz GPX", tu tylko odczytujemy `<ele>`.
 * Zwraca `null`, gdy plik nie ma danych wysokościowych (część starszych tras klubu ich nie ma).
 */
export async function loadElevationProfile(route: RouteMeta): Promise<ElevationPoint[] | null> {
  const cached = cache.get(route.id);
  if (cached !== undefined) return cached;

  const res = await fetch(routeGpxUrl(route));
  if (!res.ok) throw new Error(`Nie udało się wczytać GPX (${res.status})`);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const trkpts = Array.from(doc.getElementsByTagName("trkpt"));

  let cumulativeKm = 0;
  let prevCoord: [number, number] | null = null;
  const raw: ElevationPoint[] = [];
  for (const pt of trkpts) {
    const lat = parseFloat(pt.getAttribute("lat") ?? "");
    const lon = parseFloat(pt.getAttribute("lon") ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleText = pt.getElementsByTagName("ele")[0]?.textContent;
    const ele = eleText != null ? parseFloat(eleText) : NaN;
    const coord: [number, number] = [lon, lat];
    if (prevCoord) cumulativeKm += haversineKm(prevCoord, coord);
    prevCoord = coord;
    if (Number.isFinite(ele)) raw.push({ distanceKm: cumulativeKm, elevationM: ele, lng: lon, lat });
  }

  const result = raw.length >= 2 ? downsample(raw, MAX_POINTS) : null;
  cache.set(route.id, result);
  return result;
}
