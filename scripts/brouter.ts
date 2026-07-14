import type { SurfaceSplit } from "../src/types";

/**
 * Publiczny serwer BRouter — bez SLA. W razie potrzeby podmień na własną instancję.
 * Ten sam serwer jest już używany w projekcie referencyjnym (project1/src/brouter.ts).
 */
export const BROUTER_URL = "https://brouter.de/brouter";

/**
 * Mapowanie surowych wartości OSM `surface=*` na nasze 3 kubełki.
 * Niekompletne z rozmysłem — nierozpoznane wartości trafiają do "unknown" w wywołującym kodzie.
 */
const SURFACE_MAP: Record<string, "paved" | "gravel" | "unpaved"> = {
  asphalt: "paved",
  paved: "paved",
  concrete: "paved",
  paving_stones: "paved",
  sett: "paved",
  cobblestone: "paved",
  gravel: "gravel",
  fine_gravel: "gravel",
  compacted: "gravel",
  dirt: "unpaved",
  ground: "unpaved",
  earth: "unpaved",
  grass: "unpaved",
  sand: "unpaved",
  mud: "unpaved",
  unpaved: "unpaved",
};

/** Ogranicza liczbę punktów przekazywanych do BRoutera (limit długości URL). */
function downsample(coords: [number, number][], maxPoints: number): [number, number][] {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(coords[Math.round(i * step)]);
  }
  return out;
}

type BRouterMessages = { header: string[]; rows: string[][] };

/**
 * Dopasowuje zarejestrowany ślad do sieci dróg BRoutera i wylicza rozkład nawierzchni
 * ważony długością odcinków. To NIE jest analiza dokładnego GPS-śladu — BRouter
 * przelicza trasę przez własny graf, więc wynik jest przybliżeniem (map-matching).
 *
 * Zweryfikowane na żywo na próbce tras (2026-07-14): kolumny `Distance` (długość
 * segmentu, nie kumulatywna) i `WayTags` odpowiadają temu, czego oczekuje ten kod.
 * Ok. 50-65% długości tras wokół Opola ląduje w `unknown` — brak tagu `surface=*`
 * w OSM dla tych odcinków, nie błąd dopasowania.
 */
export async function analyzeSurface(
  coords: [number, number][],
  profile = "trekking",
): Promise<SurfaceSplit | null> {
  if (coords.length < 2) return null;
  const points = downsample(coords, 60);
  const lonlats = points.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join("|");

  const url = new URL(BROUTER_URL);
  url.searchParams.set("lonlats", lonlats);
  url.searchParams.set("profile", profile);
  url.searchParams.set("alternativeidx", "0");
  url.searchParams.set("format", "geojson");

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    features?: { properties?: { messages?: string[][] } }[];
  };
  const messages = data.features?.[0]?.properties?.messages;
  if (!messages || messages.length < 2) return null;

  const table = parseMessages(messages);
  const distIdx = table.header.indexOf("Distance");
  const tagsIdx = table.header.indexOf("WayTags");
  if (distIdx === -1 || tagsIdx === -1) return null;

  let paved = 0;
  let gravel = 0;
  let unpaved = 0;
  let unknown = 0;

  for (const row of table.rows) {
    // Distance to już długość tego segmentu (nie dystans skumulowany).
    const segment = parseFloat(row[distIdx]);
    if (!Number.isFinite(segment) || segment <= 0) continue;

    const tags = row[tagsIdx] ?? "";
    const match = /surface=([a-z_]+)/.exec(tags);
    const bucket = match ? SURFACE_MAP[match[1]] : undefined;
    if (bucket === "paved") paved += segment;
    else if (bucket === "gravel") gravel += segment;
    else if (bucket === "unpaved") unpaved += segment;
    else unknown += segment;
  }

  const total = paved + gravel + unpaved + unknown;
  if (total === 0) return null;

  return {
    paved: round1((paved / total) * 100),
    gravel: round1((gravel / total) * 100),
    unpaved: round1((unpaved / total) * 100),
    unknown: round1((unknown / total) * 100),
  };
}

function parseMessages(messages: string[][]): BRouterMessages {
  const [header, ...rows] = messages;
  return { header, rows };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
