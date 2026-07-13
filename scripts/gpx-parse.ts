import { XMLParser } from "fast-xml-parser";
import { haversineKm } from "../src/geo";

export type ParsedGpx = {
  name: string | null;
  coords: [number, number][]; // [lng, lat]
  elevations: (number | null)[];
  times: (string | null)[];
  waypoints: { lng: number; lat: number; name: string }[];
  distanceKm: number;
  ascentM: number;
  descentM: number;
  durationMin: number | null;
  bbox: [number, number, number, number];
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Parsuje surowy XML pliku GPX na geometrię i statystyki. Toleruje brak ele/time/wpt. */
export function parseGpx(xml: string): ParsedGpx {
  const doc = parser.parse(xml);
  const gpx = doc.gpx ?? {};
  const name: string | null = gpx.metadata?.name ?? gpx.trk?.name ?? null;

  const trkList = toArray(gpx.trk);
  const trkpts: Record<string, unknown>[] = [];
  for (const trk of trkList) {
    for (const seg of toArray(trk.trkseg)) {
      trkpts.push(...toArray(seg.trkpt));
    }
  }

  const coords: [number, number][] = [];
  const elevations: (number | null)[] = [];
  const times: (string | null)[] = [];
  for (const pt of trkpts) {
    const lat = parseFloat(String(pt["@_lat"]));
    const lon = parseFloat(String(pt["@_lon"]));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    coords.push([lon, lat]);
    const ele = pt.ele !== undefined ? parseFloat(String(pt.ele)) : null;
    elevations.push(Number.isFinite(ele) ? ele : null);
    times.push(typeof pt.time === "string" ? pt.time : null);
  }

  const waypoints = toArray(gpx.wpt)
    .map((w) => {
      const lat = parseFloat(String(w["@_lat"]));
      const lon = parseFloat(String(w["@_lon"]));
      const wname = typeof w.name === "string" ? w.name : "";
      return { lng: lon, lat, name: wname };
    })
    .filter((w) => Number.isFinite(w.lng) && Number.isFinite(w.lat));

  let distanceKm = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    distanceKm += haversineKm(coords[i], coords[i + 1]);
  }

  let ascentM = 0;
  let descentM = 0;
  for (let i = 0; i < elevations.length - 1; i++) {
    const a = elevations[i];
    const b = elevations[i + 1];
    if (a == null || b == null) continue;
    const delta = b - a;
    if (delta > 0) ascentM += delta;
    else descentM += -delta;
  }

  let durationMin: number | null = null;
  const firstTime = times.find((t) => t != null) ?? null;
  const lastTime = [...times].reverse().find((t) => t != null) ?? null;
  if (firstTime && lastTime) {
    const start = Date.parse(firstTime);
    const end = Date.parse(lastTime);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      durationMin = (end - start) / 60000;
    }
  }

  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const bbox: [number, number, number, number] =
    coords.length > 0
      ? [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
      : [0, 0, 0, 0];

  return {
    name,
    coords,
    elevations,
    times,
    waypoints,
    distanceKm: Math.round(distanceKm * 10) / 10,
    ascentM: Math.round(ascentM),
    descentM: Math.round(descentM),
    durationMin,
    bbox,
  };
}
