import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUp } from "lucide-react";
import type { RouteMeta } from "../types";

type Props = {
  route: RouteMeta;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

const SURFACE_LABELS: Record<"paved" | "gravel" | "unpaved", string> = {
  paved: "Asfalt/beton",
  gravel: "Szuter/drogi leśne",
  unpaved: "Ziemna/nieutwardzona",
};

const MARQUEE_PX_PER_SECOND = 45;

// Próg, od którego pionowy ruch palca liczy się jako przeciąganie (a nie zwykłe tapnięcie).
const SWIPE_INTENT_PX = 6;
// Minimalny dystans przeciągnięcia, żeby swipe faktycznie zwinął/rozwinął panel.
const SWIPE_TOGGLE_PX = 32;

/** Swipe-down zwija panel, swipe-up rozwija go — jak natywny bottom sheet na iOS.
 * Nasłuchujemy natywnie (nie przez props onTouch* z Reacta), żeby móc wywołać
 * preventDefault na touchmove — inaczej przeglądarka od razu przechwytuje pionowy
 * gest jako pull-to-refresh, zanim zdążymy rozpoznać, że to przeciąganie panelu. */
function useSwipeToggle(collapsed: boolean, onToggleCollapsed: () => void) {
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startY = 0;
    let dragging = false;

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      dragging = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      const deltaY = e.touches[0].clientY - startY;
      if (!dragging && Math.abs(deltaY) > SWIPE_INTENT_PX) dragging = true;
      if (dragging) e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!dragging) return;
      dragging = false;
      const deltaY = e.changedTouches[0].clientY - startY;
      if (!collapsed && deltaY > SWIPE_TOGGLE_PX) onToggleCollapsed();
      else if (collapsed && deltaY < -SWIPE_TOGGLE_PX) onToggleCollapsed();
    };

    const onTouchCancel = () => {
      dragging = false;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchCancel);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [collapsed, onToggleCollapsed]);

  return ref;
}

/** Nazwa trasy w skompaktowanym pasku — gdy nie mieści się w dostępnej szerokości,
 * zamiast obcinać wielokropkiem przewija się w pętli, jak tytuł utworu w Spotify. */
function MarqueeText({ text }: { text: string }) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const itemRef = useRef<HTMLSpanElement | null>(null);
  const [overflow, setOverflow] = useState<{ scrolling: boolean; durationS: number }>({
    scrolling: false,
    durationS: 8,
  });

  useEffect(() => {
    const container = containerRef.current;
    const item = itemRef.current;
    if (!container || !item) return;
    const scrolling = item.scrollWidth > container.clientWidth;
    setOverflow({
      scrolling,
      durationS: Math.max(4, item.scrollWidth / MARQUEE_PX_PER_SECOND),
    });
  }, [text]);

  return (
    <span className="detail-peek-name" ref={containerRef}>
      <span
        className={`marquee-track${overflow.scrolling ? " marquee-scrolling" : ""}`}
        style={overflow.scrolling ? ({ "--marquee-duration": `${overflow.durationS}s` } as CSSProperties) : undefined}
      >
        <span className="marquee-item" ref={itemRef}>
          {text}
        </span>
        {overflow.scrolling && (
          <span className="marquee-item" aria-hidden="true">
            {text}
          </span>
        )}
      </span>
    </span>
  );
}

export default function RouteDetail({
  route,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  collapsed,
  onToggleCollapsed,
}: Props) {
  const surface = route.surface;
  const handleRef = useSwipeToggle(collapsed, onToggleCollapsed);

  return (
    <div className="detail-panel">
      {/* Widoczne tylko na mobile (patrz media query) — tap albo swipe (góra/dół) zwija/rozwija
          panel, żeby odsłonić mapę. Nazwa/statystyki pokazują się tylko po zwinięciu — inaczej
          dublowałyby tytuł poniżej. */}
      <button className="detail-handle" onClick={onToggleCollapsed} ref={handleRef}>
        <span className="detail-grabber" />
        {collapsed && (
          <span className="detail-peek">
            <MarqueeText text={route.title} />
            <span className="detail-peek-stats">
              {route.distanceKm.toFixed(1)} km
              <span className="detail-peek-sep">·</span>
              <ArrowUp className="detail-peek-ascent-icon" size={12} strokeWidth={2.5} />
              {route.ascentM} m
            </span>
          </span>
        )}
      </button>

      <div className={`detail-body${collapsed ? " detail-body-collapsed" : ""}`}>
        <div className="detail-scroll">
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
        </div>

        <div className="route-nav">
          <button className="route-nav-btn" onClick={onPrev} disabled={!hasPrev}>
            ← Poprzednia
          </button>
          <button className="route-nav-btn" onClick={onNext} disabled={!hasNext}>
            Następna →
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} godz ${m} min` : `${m} min`;
}
