const FOLDER_MIME = "application/vnd.google-apps.folder";
const API_BASE = "https://www.googleapis.com/drive/v3/files";

export type DriveFolder = { id: string; name: string; parentId: string | null };
export type DriveGpxFile = { id: string; name: string; parentId: string; size: number };

type DriveApiFile = { id: string; name: string; mimeType: string; size?: string };

/**
 * Klient Dysku Google oparty o zwykły klucz API (bez OAuth/service accounta).
 * Działa wyłącznie dla plików/folderów udostępnionych publicznie ("Każdy z linkiem")
 * — dokładnie ten przypadek, w którym nasz folder już się znajduje.
 */
export function createDriveClient(apiKey: string) {
  return { apiKey };
}

async function listChildren(
  client: { apiKey: string },
  folderId: string,
): Promise<DriveApiFile[]> {
  const files: DriveApiFile[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(API_BASE);
    url.searchParams.set("q", `'${folderId}' in parents and trashed = false`);
    url.searchParams.set("fields", "nextPageToken, files(id, name, mimeType, size)");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("key", client.apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Drive API files.list ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { files?: DriveApiFile[]; nextPageToken?: string };
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

/**
 * Rekurencyjnie przechodzi drzewo folderów pod `rootFolderId`.
 * Bezpośrednie podfoldery roota stają się kategoriami najwyższego poziomu
 * (`parentId: null`); każdy kolejny poziom zagnieżdżenia to podkategoria.
 * Pliki .gpx są przypisywane do najbliższego zawierającego je folderu (kategorii).
 * Pliki .gpx leżące bezpośrednio w roocie (bez kategorii) są pomijane.
 */
export async function walkDriveTree(
  client: { apiKey: string },
  rootFolderId: string,
): Promise<{ folders: DriveFolder[]; gpxFiles: DriveGpxFile[] }> {
  const folders: DriveFolder[] = [];
  const gpxFiles: DriveGpxFile[] = [];

  async function walk(folderId: string, isRootLevel: boolean): Promise<void> {
    const children = await listChildren(client, folderId);
    for (const child of children) {
      if (!child.id || !child.name) continue;
      if (child.mimeType === FOLDER_MIME) {
        const parentId = isRootLevel ? null : folderId;
        folders.push({ id: child.id, name: child.name.trim(), parentId });
        await walk(child.id, false);
      } else if (child.name.toLowerCase().endsWith(".gpx")) {
        if (isRootLevel) continue;
        gpxFiles.push({
          id: child.id,
          name: child.name,
          parentId: folderId,
          size: Number(child.size ?? 0),
        });
      }
    }
  }

  await walk(rootFolderId, true);
  return { folders, gpxFiles };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Nieuwierzytelniony dostęp przez klucz API (bez OAuth) ma dużo niższy limit zapytań
 * niż OAuth/service account. Uwaga: obserwowana w praktyce blokada 403 ("Sorry...",
 * strona anty-spamowa Google) bywa DŁUGOTRWAŁA (nie mija w sekundy/minuty) — dlatego
 * ponawiamy tylko 2 razy z krótkim opóźnieniem (szybka porażka), zamiast długo próbować
 * bez sensu. Jeśli to się powtarza, poczekaj dłużej przed kolejnym uruchomieniem `sync`.
 */
async function downloadRaw(client: { apiKey: string }, fileId: string): Promise<ArrayBuffer> {
  const url = new URL(`${API_BASE}/${fileId}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("key", client.apiKey);

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url.toString());
    if (res.ok) return res.arrayBuffer();

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      const body = await res.text().catch(() => "");
      throw new Error(`Drive API files.get ${res.status}: ${body.slice(0, 300)}`);
    }
    await sleep(1000 * 2 ** (attempt - 1));
  }
  throw new Error("unreachable");
}

/** Pobiera plik raz jako bufor — wywołujący może z niego wyprowadzić i tekst, i surowe bajty. */
export async function downloadFileBuffer(client: { apiKey: string }, fileId: string): Promise<Buffer> {
  const buf = await downloadRaw(client, fileId);
  return Buffer.from(buf);
}
