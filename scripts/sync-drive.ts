import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "./env";
import { createDriveClient, downloadFileBuffer, downloadFileText, walkDriveTree } from "./drive-client";
import { parseGpx } from "./gpx-parse";
import { analyzeSurface } from "./brouter";
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

async function main() {
  console.log(`Łączenie z Dyskiem Google (folder ${ROOT_FOLDER_ID})…`);
  const drive = createDriveClient(API_KEY!);
  const { folders, gpxFiles } = await walkDriveTree(drive, ROOT_FOLDER_ID!);
  console.log(`Znaleziono ${folders.length} kategorii i ${gpxFiles.length} plików GPX.`);

  mkdirSync(TRACKS_DIR, { recursive: true });
  mkdirSync(GPX_DIR, { recursive: true });

  const categories: Category[] = folders.map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
  }));

  const routes: RouteMeta[] = [];
  const usedIds = new Set<string>();

  for (const [i, file] of gpxFiles.entries()) {
    process.stdout.write(`[${i + 1}/${gpxFiles.length}] ${file.name} … `);
    try {
      const xml = await downloadFileText(drive, file.id);
      const parsed = parseGpx(xml);
      if (parsed.coords.length < 2) {
        console.log("pominięto (brak punktów trasy)");
        continue;
      }

      let id = slugify(file.name);
      if (usedIds.has(id)) id = `${id}-${file.id.slice(0, 6).toLowerCase()}`;
      usedIds.add(id);

      let surface = null;
      if (ENABLE_SURFACE) {
        surface = await analyzeSurface(parsed.coords).catch(() => null);
      }

      const track: RouteTrack = { id, coords: parsed.coords, waypoints: parsed.waypoints };
      writeFileSync(path.join(TRACKS_DIR, `${id}.json`), JSON.stringify(track));

      const gpxBuffer = await downloadFileBuffer(drive, file.id);
      writeFileSync(path.join(GPX_DIR, `${id}.gpx`), gpxBuffer);

      routes.push({
        id,
        categoryId: file.parentId,
        title: (parsed.name ?? file.name.replace(/\.gpx$/i, "")).trim(),
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

      console.log(`ok (${parsed.distanceKm} km)`);
    } catch (err) {
      console.log(`BŁĄD: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const index: DataIndex = {
    generatedAt: new Date().toISOString(),
    categories,
    routes,
  };
  writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(index, null, 2));

  console.log(`\nGotowe: ${routes.length} tras zapisanych do ${OUT_DIR}.`);
  if (!ENABLE_SURFACE) {
    console.log(
      "Analiza nawierzchni była wyłączona (ENABLE_SURFACE_ANALYSIS=0) — pole `surface` jest puste dla wszystkich tras.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
