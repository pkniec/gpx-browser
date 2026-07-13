import type { Category, DataIndex, RouteMeta, RouteTrack } from "./types";

const INDEX_URL = "/data/index.json";
const TRACK_URL = (id: string) => `/data/tracks/${id}.json`;

let indexCache: DataIndex | null = null;
let indexInflight: Promise<DataIndex> | null = null;
const trackCache = new Map<string, RouteTrack>();

/** Wczytuje (raz) pełny indeks: kategorie + metadane wszystkich tras. */
export async function loadIndex(): Promise<DataIndex> {
  if (indexCache) return indexCache;
  if (indexInflight) return indexInflight;
  indexInflight = (async () => {
    const res = await fetch(INDEX_URL);
    if (!res.ok) throw new Error(`Nie udało się wczytać indeksu tras (${res.status})`);
    const data = (await res.json()) as DataIndex;
    indexCache = data;
    return data;
  })();
  return indexInflight;
}

/** Wczytuje geometrię pojedynczej trasy na żądanie (z cache). */
export async function loadTrack(id: string): Promise<RouteTrack> {
  const cached = trackCache.get(id);
  if (cached) return cached;
  const res = await fetch(TRACK_URL(id));
  if (!res.ok) throw new Error(`Nie udało się wczytać trasy ${id} (${res.status})`);
  const data = (await res.json()) as RouteTrack;
  trackCache.set(id, data);
  return data;
}

/** Bezpośrednie podkategorie danej kategorii (lub kategorie najwyższego poziomu, gdy `parentId` = null). */
export function childCategories(categories: Category[], parentId: string | null): Category[] {
  return categories.filter((c) => c.parentId === parentId);
}

/** Trasy należące bezpośrednio do danej kategorii (bez rekurencji do podkategorii). */
export function routesInCategory(routes: RouteMeta[], categoryId: string): RouteMeta[] {
  return routes
    .filter((r) => r.categoryId === categoryId)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

/** Ścieżka okruszków (breadcrumb) od korzenia do danej kategorii. */
export function categoryPath(categories: Category[], categoryId: string): Category[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path: Category[] = [];
  let current = byId.get(categoryId) ?? null;
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) ?? null : null;
  }
  return path;
}

/** Publiczny URL oryginalnego pliku GPX trasy, do eksportu/pobrania. */
export function routeGpxUrl(route: RouteMeta): string {
  return `/data/gpx/${route.gpxFile}`;
}
