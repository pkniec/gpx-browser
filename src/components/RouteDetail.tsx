import type { RouteMeta } from "../types";
import { routeGpxUrl } from "../data";

type Props = {
  route: RouteMeta;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
};

const SURFACE_LABELS: Record<"paved" | "gravel" | "unpaved", string> = {
  paved: "Asfalt/beton",
  gravel: "Szuter/drogi leśne",
  unpaved: "Ziemna/nieutwardzona",
};

export default function RouteDetail({ route, onBack, onPrev, onNext, hasPrev, hasNext }: Props) {
  const surface = route.surface;

  return (
    <div className="detail-panel">
      <button className="back-link" onClick={onBack}>
        ← Wróć do listy
      </button>
      <h2>{route.title}</h2>
      {route.date && <p className="detail-date">{route.date}</p>}

      <dl className="stat-grid">
        <div>
          <dt>Dystans</dt>
          <dd>{route.distanceKm.toFixed(1)} km</dd>
        </div>
        <div>
          <dt>Przewyższenie</dt>
          <dd>+{route.ascentM} m / -{route.descentM} m</dd>
        </div>
        <div>
          <dt>Czas</dt>
          <dd>{route.durationMin != null ? formatDuration(route.durationMin) : "brak danych"}</dd>
        </div>
      </dl>

      <div className="surface-section">
        <h3>Nawierzchnia</h3>
        {surface ? (
          <>
            <div className="surface-bar">
              <span
                className="surface-seg surface-paved"
                style={{ width: `${surface.paved}%` }}
                title={`Asfalt/beton: ${surface.paved}%`}
              />
              <span
                className="surface-seg surface-gravel"
                style={{ width: `${surface.gravel}%` }}
                title={`Szuter: ${surface.gravel}%`}
              />
              <span
                className="surface-seg surface-unpaved"
                style={{ width: `${surface.unpaved}%` }}
                title={`Nieutwardzona: ${surface.unpaved}%`}
              />
              {surface.unknown > 0 && (
                <span
                  className="surface-seg surface-unknown"
                  style={{ width: `${surface.unknown}%` }}
                  title={`Nieznana: ${surface.unknown}%`}
                />
              )}
            </div>
            <ul className="surface-legend">
              {(Object.keys(SURFACE_LABELS) as (keyof typeof SURFACE_LABELS)[]).map((key) => (
                <li key={key}>
                  <span className={`legend-dot legend-${key}`} />
                  {SURFACE_LABELS[key]}: {surface[key]}%
                </li>
              ))}
              {surface.unknown > 0 && (
                <li>
                  <span className="legend-dot legend-unknown" />
                  Nieznana: {surface.unknown}%
                </li>
              )}
            </ul>
            <p className="surface-disclaimer">
              Szacunkowo, na podstawie dopasowania do danych OpenStreetMap.
            </p>
          </>
        ) : (
          <p className="empty-state">Brak danych o nawierzchni dla tej trasy.</p>
        )}
      </div>

      <a className="download-btn" href={routeGpxUrl(route)} download={route.gpxOriginalName}>
        ⬇ Pobierz GPX
      </a>

      <div className="route-nav">
        <button className="route-nav-btn" onClick={onPrev} disabled={!hasPrev}>
          ← Poprzednia
        </button>
        <button className="route-nav-btn" onClick={onNext} disabled={!hasNext}>
          Następna →
        </button>
      </div>
    </div>
  );
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} godz ${m} min` : `${m} min`;
}
