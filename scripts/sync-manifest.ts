import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Śledzi, co już pobraliśmy z Dysku Google, żeby kolejne synchronizacje
 * pobierały treść (`files.get`) tylko dla plików nowych/zmienionych.
 * Same listingi folderów (`files.list`) są tanie i robimy je zawsze od nowa —
 * limit zapytań Drive API (bez OAuth) dotyczy w praktyce pobierania treści.
 */
export type SyncManifest = Record<string, { modifiedTime: string; routeId: string }>;

export function loadManifest(filePath: string): SyncManifest {
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as SyncManifest;
  } catch {
    return {};
  }
}

export function saveManifest(filePath: string, manifest: SyncManifest): void {
  writeFileSync(filePath, JSON.stringify(manifest, null, 2));
}
