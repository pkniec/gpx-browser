# GPX Browser

Przeglądarka tras GPX klubu, wczytywanych z folderu na Dysku Google. Kategorie = foldery,
trasy = pliki `.gpx`. Mapa OpenStreetMap (MapLibre GL), statystyki trasy, eksport GPX.

Aplikacja jest **statyczna** — dane z Dysku Google są synchronizowane do plików w
`public/data/` przez skrypt `scripts/sync-drive.ts`, nie pobierane na żywo w przeglądarce.

## Uruchomienie (podgląd z danymi demo)

```bash
npm install
npm run dev
```

W repo znajdują się już 2 przykładowe trasy w `public/data/` (prawdziwe dane pobrane
z Dysku), żeby można było zobaczyć działającą aplikację bez konfigurowania Google API.

## Synchronizacja z prawdziwym Dyskiem Google

Folder źródłowy jest udostępniony publicznie ("Każdy z linkiem"), więc wystarczy zwykły
**klucz API** — bez service accounta, bez OAuth (klucze service accountów bywają
zablokowane przez politykę organizacji `iam.disableServiceAccountKeyCreation`; klucz API
nie podlega tej blokadzie).

1. Utwórz projekt w Google Cloud Console, włącz **Google Drive API**.
2. **Credentials → Create Credentials → API key.** Dla bezpieczeństwa ogranicz klucz
   (Restrict key) do API "Google Drive API" — klucz i tak daje tylko odczyt publicznych
   zasobów, nic więcej.
3. Skopiuj `.env.example` do `.env` i uzupełnij `GOOGLE_API_KEY` oraz `DRIVE_ROOT_FOLDER_ID`.
4. Uruchom:

```bash
npm run sync
```

Skrypt nadpisze `public/data/index.json`, `public/data/tracks/*.json` i `public/data/gpx/*.gpx`
zawartością z Dysku. Możesz go też uruchomić ręcznie, gdy chcesz odświeżyć dane od razu.

### Automatyczny sync (GitHub Actions)

Workflow `.github/workflows/gpx-sync.yml` uruchamia `npm run sync` dwa razy dziennie
(10:00 i 20:00 czasu polskiego, z uwzględnieniem zmiany czasu — sam siebie sprawdza co
godzinę i wykonuje właściwą pracę tylko o tych dwóch porach). Jeśli sync wykryje nowe lub
zmienione trasy, workflow commituje zmiany w `public/data/` i `scripts/sync-manifest.json`
i pushuje je do `main`. Jeśli Vercel jest podłączony do repo przez integrację Git, taki push
sam uruchamia nowy deploy produkcyjny — nie trzeba nic więcej robić.

Żeby to działało, w ustawieniach repo (**Settings → Secrets and variables → Actions →
New repository secret**) trzeba dodać sekret `GOOGLE_API_KEY` z tą samą wartością, która
jest w lokalnym `.env`. `DRIVE_ROOT_FOLDER_ID` jest wpisany wprost w workflow (folder jest
publiczny, więc to nie jest sekret).

Powiadomienie e-mail o nowych trasach nie jest jeszcze skonfigurowane — dodamy je później.

### Analiza nawierzchni (opcjonalna, wymaga weryfikacji)

Ustaw `ENABLE_SURFACE_ANALYSIS=1` w `.env`, żeby skrypt dopasowywał każdą trasę do sieci
dróg BRoutera (`https://brouter.de/brouter`, publiczny serwer bez SLA) i wyliczał procentowy
udział nawierzchni z tagów OSM (`scripts/brouter.ts`).

**To jest najbardziej niepewny element całego projektu:**
- BRouter przelicza trasę przez własny graf drogowy — to map-matching, nie odczyt
  dokładnego śladu GPS, więc wynik jest przybliżeniem.
- Dokładny układ kolumn w odpowiedzi `messages` (w tym nazwa kolumny dystansu
  kumulatywnego) był sprawdzony tylko na podstawie dokumentacji BRoutera, **nie na żywym
  ruchu** — przed zaufaniem liczbom sprawdź wynik na kilku trasach z wiadomym przebiegiem.
- Bez włączonej flagi pole `surface` w `index.json` zostaje `null`, a UI pokazuje
  "Brak danych o nawierzchni" zamiast zgadywać.

## Struktura

```
scripts/
  env.ts          — minimalny loader .env
  drive-client.ts — autoryzacja + rekurencyjne przejście drzewa folderów Dysku
  gpx-parse.ts    — parsowanie GPX (dystans, przewyższenie, czas, bbox, POI)
  brouter.ts      — opcjonalna analiza nawierzchni przez BRouter
  sync-drive.ts   — orkiestracja: Drive → public/data/*.json + *.gpx

src/
  types.ts               — Category, RouteMeta, RouteTrack, SurfaceSplit
  data.ts                 — ładowanie index.json/tracks na froncie (fetch + cache)
  components/MapView.tsx  — mapa MapLibre + kafle OpenStreetMap
  components/CategoryBrowser.tsx — drzewo kategorii + lista tras
  components/RouteDetail.tsx     — statystyki, nawierzchnia, eksport GPX
```
