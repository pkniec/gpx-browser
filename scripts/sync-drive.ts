import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "./env";
import { createDriveClient, downloadFileBuffer, walkDriveTree } from "./drive-client";
import { parseGpx } from "./gpx-parse";
import { analyzeSurface } from "./brouter";
import { loadManifest, saveManifest, type SyncManifest } from "./sync-manifest";
import type { Category, DataIndex, RouteMeta, RouteTrack } from "../src/types";

loadEnvFile();

const API_KEY = process.env.GOOGLE_API_KEY;
const ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID;
const ENABLE_SURFACE = process.env.ENABLE_SURFACE_ANALYSIS === "1";

if (!API_KEY || !ROOT_FOLDER_ID) {
  console.error(
    "Brak konfiguracji. Ustaw GOOGLE_API_KEY i DRIVE_ROOT_FOLDER_ID w .env (patrz .env.example).",
  );
  process.exit(1);
}

const OUT_DIR = path.resolve(process.cwd(), "public/data");
const TRACKS_DIR = path.join(OUT_DIR, "tracks");
const GPX_DIR = path.join(OUT_DIR, "gpx");
const INDEX_PATH = path.join(OUT_DIR, "index.json");
const MANIFEST_PATH = path.resolve(process.cwd(), "scripts/sync-manifest.json");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.gpx$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "trasa";
}

/** Wyciąga datę z nazwy pliku, jeśli zaczyna się od "YYYY/MM/DD" lub "YYYY_MM_DD". */
function extractDate(name: string): string | null {
  const m = /^(\d{4})[/_-](\d{2})[/_-](\d{2})/.exec(name);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Tytuł z nazwy pliku (obcina prefiks daty i rozszerzenie) — wg obserwacji na realnych
 * danych klubu jest wiarygodniejszy niż wewnętrzne metadane GPX (`<name>`), które bywają
 * wewnętrznymi roboczymi nazwami z aplikacji routingowej (np. "biestrzynnik_glo fin04").
 */
function titleFromFilename(name: string): string {
  return name
    .replace(/\.gpx$/i, "")
    .replace(/^\d{4}[/_-]\d{2}[/_-]\d{2}\s*-\s*/, "")
    .replace(/^\d{4}\s*-\s*/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadOldIndex(): DataIndex | null {
  if (!existsSync(INDEX_PATH)) return null;
  try {
    return JSON.parse(readFileSync(INDEX_PATH, "utf-8")) as DataIndex;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Łączenie z Dyskiem Google (folder ${ROOT_FOLDER_ID})…`);
  const drive = createDriveClient(API_KEY!);
  const { folders, gpxFiles } = await walkDriveTree(drive, ROOT_FOLDER_ID!);
  console.log(`Znaleziono ${folders.length} kategorii i ${gpxFiles.length} plików GPX na Dysku.`);

  mkdirSync(TRACKS_DIR, { recursive: true });
  mkdirSync(GPX_DIR, { recursive: true });

  const categories: Category[] = folders.map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
  }));

  const oldIndex = loadOldIndex();
  const oldRoutesById = new Map((oldIndex?.routes ?? []).map((r) => [r.id, r]));
  // Dopasowanie po (folder, oryginalna nazwa pliku) — używane tylko jako fallback, gdy manifest
  // nie zna jeszcze danego pliku (pierwsze uruchomienie tej wersji skryptu albo zgubiony manifest).
  // Pozwala rozpoznać trasy, które już mamy pobrane na dysku, bez ponownego sięgania do Dysku.
  const oldRoutesByLocation = new Map(
    (oldIndex?.routes ?? []).map((r) => [`${r.categoryId}::${r.gpxOriginalName}`, r]),
  );
  const manifest = loadManifest(MANIFEST_PATH);
  const newManifest: SyncManifest = {};

  const routes: RouteMeta[] = [];
  const usedIds = new Set<string>();
  const stats = { new: 0, changed: 0, unchanged: 0, failed: 0, removed: 0, bootstrapped: 0 };

  for (const [i, file] of gpxFiles.entries()) {
    let known = manifest[file.id];
    const prefix = `[${i + 1}/${gpxFiles.length}] ${file.name}`;

    if (!known) {
      const bootstrap = oldRoutesByLocation.get(`${file.parentId}::${file.name}`);
      if (bootstrap && existsSync(path.join(TRACKS_DIR, `${bootstrap.id}.json`))) {
        // Bez manifestu nie znamy prawdziwego poprzedniego modifiedTime — przyjmujemy bieżący
        // jako punkt odniesienia; kolejny sync poprawnie wykryje ewentualną zmianę od teraz.
        known = { modifiedTime: file.modifiedTime, routeId: bootstrap.id };
        stats.bootstrapped++;
      }
    }

    if (known && known.modifiedTime === file.modifiedTime) {
      const old = oldRoutesById.get(known.routeId);
      if (old) {
        routes.push({ ...old, categoryId: file.parentId });
        newManifest[file.id] = known;
        usedIds.add(old.id);
        stats.unchanged++;
        console.log(`${prefix} … bez zmian`);
        continue;
      }
      // manifest wskazuje na trasę, której nie ma już w index.json — pobierz od nowa
    }

    const isChange = Boolean(known);
    process.stdout.write(`${prefix} … `);
    try {
      const gpxBuffer = await downloadFileBuffer(drive, file.id);
      const parsed = parseGpx(gpxBuffer.toString("utf-8"));
      if (parsed.coords.length < 2) {
        console.log("pominięto (brak punktów trasy)");
        await sleep(250);
        continue;
      }

      // Przy edycji pliku zachowaj dotychczasowe id trasy (stabilny URL/klucz),
      // dla nowych plików wygeneruj świeże.
      let id = known?.routeId ?? slugify(file.name);
      if (!known && usedIds.has(id)) id = `${id}-${file.id.slice(0, 6).toLowerCase()}`;
      usedIds.add(id);

      let surface = null;
      if (ENABLE_SURFACE) {
        surface = await analyzeSurface(parsed.coords).catch(() => null);
      }

      const track: RouteTrack = { id, coords: parsed.coords, waypoints: parsed.waypoints };
      writeFileSync(path.join(TRACKS_DIR, `${id}.json`), JSON.stringify(track));
      writeFileSync(path.join(GPX_DIR, `${id}.gpx`), gpxBuffer);

      routes.push({
        id,
        categoryId: file.parentId,
        title: titleFromFilename(file.name) || (parsed.name ?? file.name).trim(),
        date: extractDate(file.name),
        distanceKm: parsed.distanceKm,
        ascentM: parsed.ascentM,
        descentM: parsed.descentM,
        durationMin: parsed.durationMin,
        start: parsed.coords[0],
        bbox: parsed.bbox,
        surface,
        gpxFile: `${id}.gpx`,
        gpxOriginalName: file.name,
      });
      newManifest[file.id] = { modifiedTime: file.modifiedTime, routeId: id };
      if (isChange) stats.changed++;
      else stats.new++;
      console.log(`ok (${parsed.distanceKm} km)${isChange ? " [zaktualizowano]" : " [nowa]"}`);
    } catch (err) {
      stats.failed++;
      const old = known && oldRoutesById.get(known.routeId);
      if (old) {
        // Pobranie się nie udało (np. limit Drive API) — zostaw poprzednią, znaną dobrą wersję
        // zamiast gubić trasę z indeksu.
        routes.push({ ...old, categoryId: file.parentId });
        newManifest[file.id] = known!;
        usedIds.add(old.id);
        console.log(`BŁĄD: ${err instanceof Error ? err.message : String(err)} — zachowano poprzednią wersję`);
      } else {
        console.log(`BŁĄD: ${err instanceof Error ? err.message : String(err)} — pominięto`);
      }
    }
    await sleep(250); // odstęp między plikami — klucz API (bez OAuth) ma niski limit zapytań
  }

  // Trasy usunięte/przeniesione poza folder na Dysku: sprzątamy ich pliki na dysku lokalnym.
  const currentFileIds = new Set(gpxFiles.map((f) => f.id));
  for (const [fileId, entry] of Object.entries(manifest)) {
    if (currentFileIds.has(fileId)) continue;
    stats.removed++;
    console.log(`Usunięto z Dysku: ${entry.routeId} — sprzątanie lokalnych plików`);
    rmSync(path.join(TRACKS_DIR, `${entry.routeId}.json`), { force: true });
    rmSync(path.join(GPX_DIR, `${entry.routeId}.gpx`), { force: true });
  }

  // Kolejność z Drive API nie jest gwarantowana ani istotna dla UI (front sortuje po dacie) —
  // stabilna kolejność po `id` trzyma diffy w git czytelnymi między kolejnymi synchronizacjami.
  routes.sort((a, b) => a.id.localeCompare(b.id));

  const index: DataIndex = {
    generatedAt: new Date().toISOString(),
    categories,
    routes,
  };
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  saveManifest(MANIFEST_PATH, newManifest);

  console.log(
    `\nGotowe: ${routes.length} tras w indeksie ` +
      `(nowe: ${stats.new}, zaktualizowane: ${stats.changed}, bez zmian: ${stats.unchanged}` +
      `${stats.bootstrapped ? ` [w tym ${stats.bootstrapped} rozpoznanych bez manifestu]` : ""}, ` +
      `usunięte z Dysku: ${stats.removed}, błędy pobierania: ${stats.failed}).`,
  );
  if (!ENABLE_SURFACE) {
    console.log(
      "Analiza nawierzchni była wyłączona (ENABLE_SURFACE_ANALYSIS=0) — pole `surface` jest puste dla nowych/zmienionych tras.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
