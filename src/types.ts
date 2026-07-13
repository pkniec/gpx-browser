/** Kategoria = folder na Dysku Google (może mieć podkategorie). */
export type Category = {
  id: string;
  name: string;
  parentId: string | null;
};

/** Udział nawierzchni w %, suma = 100. `unknown` rośnie, gdy dopasowanie do OSM się nie powiedzie. */
export type SurfaceSplit = {
  paved: number;
  gravel: number;
  unpaved: number;
  unknown: number;
};

/** Metadane pojedynczej trasy (plik GPX). */
export type RouteMeta = {
  id: string;
  categoryId: string;
  title: string;
  date: string | null; // "YYYY-MM-DD" jeśli rozpoznane z nazwy pliku, inaczej null
  distanceKm: number;
  ascentM: number;
  descentM: number;
  durationMin: number | null; // null, gdy GPX nie ma znaczników czasu
  start: [number, number]; // [lng, lat]
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  surface: SurfaceSplit | null; // null, dopóki sync-drive nie policzy nawierzchni
  gpxFile: string; // nazwa pliku w public/data/gpx/
  gpxOriginalName: string; // oryginalna nazwa pliku z Dysku (do pobrania)
};

/** Geometria + punkty POI trasy, ładowane leniwie osobno od metadanych. */
export type RouteTrack = {
  id: string;
  coords: [number, number][]; // [lng, lat]
  waypoints: { lng: number; lat: number; name: string }[];
};

/** Zawartość public/data/index.json generowana przez scripts/sync-drive.ts. */
export type DataIndex = {
  generatedAt: string;
  categories: Category[];
  routes: RouteMeta[];
};

/** Punkty do warstwy heatmapy — próbka tras wybranego folderu (patrz `loadCategoryHeatmap`). */
export type HeatmapPoint = [number, number]; // [lng, lat]
