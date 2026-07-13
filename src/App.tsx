import { useCallback, useEffect, useState } from "react";
import MapView from "./components/MapView";
import CategoryBrowser from "./components/CategoryBrowser";
import RouteDetail from "./components/RouteDetail";
import { loadIndex, loadTrack } from "./data";
import type { DataIndex, RouteTrack } from "./types";
import "./App.css";

type LoadState = "loading" | "done" | "error";

export default function App() {
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [currentCategoryId, setCurrentCategoryId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [track, setTrack] = useState<RouteTrack | null>(null);

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

  const handleBack = useCallback(() => setSelectedRouteId(null), []);

  if (loadState === "loading") {
    return <div className="status-screen">Wczytywanie tras…</div>;
  }
  if (loadState === "error" || !index) {
    return <div className="status-screen">Nie udało się wczytać biblioteki tras.</div>;
  }

  const selectedRoute = selectedRouteId
    ? index.routes.find((r) => r.id === selectedRouteId) ?? null
    : null;

  return (
    <div className="app-shell">
      <MapView track={selectedRoute ? track : null} />
      <aside className="side-panel">
        <header className="app-header">
          <h1>Trasy GPX</h1>
        </header>
        {selectedRoute ? (
          <RouteDetail route={selectedRoute} onBack={handleBack} />
        ) : (
          <CategoryBrowser
            categories={index.categories}
            routes={index.routes}
            currentCategoryId={currentCategoryId}
            onSelectCategory={setCurrentCategoryId}
            onSelectRoute={setSelectedRouteId}
          />
        )}
      </aside>
    </div>
  );
}
