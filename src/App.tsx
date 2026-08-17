import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import MapView, { type DisplayTrack } from "./components/MapView";
import CategoryBrowser from "./components/CategoryBrowser";
import RouteDetail from "./components/RouteDetail";
import { loadCategoryHeatmap, loadIndex, loadTrack, routeGpxUrl, routesInCategory } from "./data";
import type { DataIndex, HeatmapPoint, RouteMeta, RouteTrack } from "./types";
import "./App.css";

type LoadState = "loading" | "done" | "error";

const MULTI_COLORS = [
  "#c25fd0",
  "#3ba3e0",
  "#e0a63b",
  "#3be0a0",
  "#e05f5f",
  "#8f6fe0",
  "#e0c23b",
  "#5fe0d0",
];

function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-credit">
        crafted by{" "}
        <a href="https://kniec.pl" target="_blank" rel="noopener noreferrer">
          kniec.pl
        </a>
      </div>
    </footer>
  );
}

function GpxDownloadLink({ route }: { route: RouteMeta }) {
  return (
    <a
      className="icon-btn"
      href={routeGpxUrl(route)}
      download={route.gpxOriginalName}
      title="Pobierz GPX"
      aria-label="Pobierz plik GPX tej trasy"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 3a1 1 0 0 1 1 1v9.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42l2.3 2.3V4a1 1 0 0 1 1-1Zm-7 15a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1a1 1 0 0 1 1-1Z"
        />
      </svg>
      GPX
    </a>
  );
}

export default function App() {
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [currentCategoryId, setCurrentCategoryId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [track, setTrack] = useState<RouteTrack | null>(null);
  const [checkedRouteIds, setCheckedRouteIds] = useState<Set<string>>(new Set());
  const [multiTracks, setMultiTracks] = useState<Map<string, RouteTrack>>(new Map());
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[] | null>(null);
  const [routePanelCollapsed, setRoutePanelCollapsed] = useState(false);

  useEffect(() => {
    loadIndex()
      .then((data) => {
        setIndex(data);
        setLoadState("done");
      })
      .catch(() => setLoadState("error"));
  }, []);

  useEffect(() => {
    if (!selectedRouteId) {
      setTrack(null);
      return;
    }
    let cancelled = false;
    loadTrack(selectedRouteId)
      .then((t) => {
        if (!cancelled) setTrack(t);
      })
      .catch(() => {
        if (!cancelled) setTrack(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRouteId]);

  // Wczytuje geometrię dla wszystkich zaznaczonych (checkbox) tras naraz.
  useEffect(() => {
    let cancelled = false;
    const ids = [...checkedRouteIds];
    if (ids.length === 0) {
      setMultiTracks(new Map());
      return;
    }
    Promise.all(
      ids.map((id) =>
        loadTrack(id)
          .then((t) => [id, t] as const)
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      const next = new Map<string, RouteTrack>();
      for (const r of results) if (r) next.set(r[0], r[1]);
      setMultiTracks(next);
    });
    return () => {
      cancelled = true;
    };
  }, [checkedRouteIds]);

  const handleBack = useCallback(() => {
    setSelectedRouteId(null);
    setRoutePanelCollapsed(false);
  }, []);

  const handleToggleRoutePanel = useCallback(() => setRoutePanelCollapsed((prev) => !prev), []);

  const handlePrev = useCallback(() => {
    setSelectedRouteId((current) => {
      if (!index || !current) return current;
      const route = index.routes.find((r) => r.id === current);
      if (!route) return current;
      const siblings = routesInCategory(index.routes, route.categoryId);
      const idx = siblings.findIndex((r) => r.id === current);
      return idx > 0 ? siblings[idx - 1].id : current;
    });
  }, [index]);

  const handleNext = useCallback(() => {
    setSelectedRouteId((current) => {
      if (!index || !current) return current;
      const route = index.routes.find((r) => r.id === current);
      if (!route) return current;
      const siblings = routesInCategory(index.routes, route.categoryId);
      const idx = siblings.findIndex((r) => r.id === current);
      return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : current;
    });
  }, [index]);

  const handleSelectCategory = useCallback((id: string | null) => {
    setCurrentCategoryId(id);
    setCheckedRouteIds(new Set());
    setShowHeatmap(false);
    setHeatmapData(null);
  }, []);

  const handleToggleRoute = useCallback((id: string) => {
    setCheckedRouteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAllInCategory = useCallback((ids: string[]) => {
    setCheckedRouteIds(new Set(ids));
  }, []);

  const handleClearSelection = useCallback(() => setCheckedRouteIds(new Set()), []);

  const handleToggleHeatmap = useCallback(() => {
    setShowHeatmap((prev) => {
      const next = !prev;
      if (next && !heatmapData && index && currentCategoryId) {
        const ids = routesInCategory(index.routes, currentCategoryId).map((r) => r.id);
        loadCategoryHeatmap(ids)
          .then(setHeatmapData)
          .catch(() => setHeatmapData([]));
      }
      return next;
    });
  }, [heatmapData, index, currentCategoryId]);

  if (loadState === "loading") {
    return (
      <div className="app-root">
        <div className="status-screen">Wczytywanie tras…</div>
        <Footer />
      </div>
    );
  }
  if (loadState === "error" || !index) {
    return (
      <div className="app-root">
        <div className="status-screen">Nie udało się wczytać biblioteki tras.</div>
        <Footer />
      </div>
    );
  }

  const selectedRoute = selectedRouteId
    ? index.routes.find((r) => r.id === selectedRouteId) ?? null
    : null;

  const siblingRoutes = selectedRoute ? routesInCategory(index.routes, selectedRoute.categoryId) : [];
  const siblingIndex = selectedRoute ? siblingRoutes.findIndex((r) => r.id === selectedRoute.id) : -1;
  const hasPrev = siblingIndex > 0;
  const hasNext = siblingIndex >= 0 && siblingIndex < siblingRoutes.length - 1;

  const orderedChecked = currentCategoryId
    ? routesInCategory(index.routes, currentCategoryId).filter((r) => checkedRouteIds.has(r.id))
    : [];
  const colorById = new Map(orderedChecked.map((r, i) => [r.id, MULTI_COLORS[i % MULTI_COLORS.length]]));
  const routeColor = (id: string): string | null => colorById.get(id) ?? null;

  let displayTracks: DisplayTrack[] = [];
  if (selectedRoute && track) {
    displayTracks = [{ id: selectedRoute.id, color: "#c25fd0", track, showMarkers: true }];
  } else if (orderedChecked.length > 0) {
    displayTracks = orderedChecked.flatMap((r) => {
      const t = multiTracks.get(r.id);
      const color = colorById.get(r.id);
      return t && color ? [{ id: r.id, color, track: t, showMarkers: false }] : [];
    });
  }

  const effectiveHeatmap = selectedRoute ? null : showHeatmap ? heatmapData : null;

  return (
    <div className="app-root">
      <div className="app-shell">
        <MapView tracks={displayTracks} heatmapPoints={effectiveHeatmap} />
        {selectedRoute && (
          <div className="route-float-header">
            <button className="back-link back-link-floating" onClick={handleBack}>
              ← Wróć do listy
            </button>
            <GpxDownloadLink route={selectedRoute} />
          </div>
        )}
        {selectedRoute && (
          <div className={`route-float-nav${routePanelCollapsed ? " route-float-nav-visible" : ""}`}>
            <button
              className="route-float-btn"
              onClick={handlePrev}
              disabled={!hasPrev}
              aria-label="Poprzednia trasa"
            >
              <ArrowLeft size={18} strokeWidth={2} />
            </button>
            <button
              className="route-float-btn"
              onClick={handleNext}
              disabled={!hasNext}
              aria-label="Następna trasa"
            >
              <ArrowRight size={18} strokeWidth={2} />
            </button>
          </div>
        )}
        <aside className={`side-panel${routePanelCollapsed && selectedRoute ? " side-panel-collapsed" : ""}`}>
          <header className={`app-header${selectedRoute ? " app-header-route" : ""}`}>
            {selectedRoute ? (
              <>
                <button className="back-link" onClick={handleBack}>
                  ← Wróć do listy
                </button>
                <GpxDownloadLink route={selectedRoute} />
              </>
            ) : (
              <div className="app-title-block">
                <p className="app-caption">Gravelove Opole</p>
                <h1>Trasy GPX</h1>
              </div>
            )}
          </header>
          {selectedRoute ? (
            <RouteDetail
              key={selectedRoute.id}
              route={selectedRoute}
              onPrev={handlePrev}
              onNext={handleNext}
              hasPrev={hasPrev}
              hasNext={hasNext}
              collapsed={routePanelCollapsed}
              onToggleCollapsed={handleToggleRoutePanel}
            />
          ) : (
            <CategoryBrowser
              categories={index.categories}
              routes={index.routes}
              currentCategoryId={currentCategoryId}
              onSelectCategory={handleSelectCategory}
              onSelectRoute={setSelectedRouteId}
              checkedRouteIds={checkedRouteIds}
              onToggleRoute={handleToggleRoute}
              onSelectAllInCategory={handleSelectAllInCategory}
              onClearSelection={handleClearSelection}
              routeColor={routeColor}
              showHeatmap={showHeatmap}
              onToggleHeatmap={handleToggleHeatmap}
            />
          )}
        </aside>
      </div>
      <Footer />
    </div>
  );
}
