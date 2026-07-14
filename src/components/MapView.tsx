import { useEffect, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { HeatmapPoint, RouteTrack } from "../types";

/** Jedna trasa do narysowania na mapie, z własnym kolorem i tym, czy pokazywać znaczniki. */
export type DisplayTrack = {
  id: string;
  color: string;
  track: RouteTrack;
  showMarkers: boolean;
};

type Props = {
  tracks: DisplayTrack[];
  heatmapPoints: HeatmapPoint[] | null;
};

type MapStyleKey = "basic" | "cyclosm" | "cycling";

const DEFAULT_STYLE_KEY: MapStyleKey = "cycling";

const OSM_SOURCE = {
  type: "raster",
  tiles: [
    "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
    "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
    "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
  ],
  tileSize: 256,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
} as const;

const BASIC_STYLE: StyleSpecification = {
  version: 8,
  sources: { osm: OSM_SOURCE },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const CYCLOSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    cyclosm: {
      type: "raster",
      tiles: [
        "https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
        "https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
        "https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.cyclosm.org">CyclOSM</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "cyclosm", type: "raster", source: "cyclosm" }],
};

// Bazowe kafelki OSM + nakładka oznakowanych szlaków rowerowych z Waymarked Trails.
const CYCLING_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: OSM_SOURCE,
    "waymarked-cycling": {
      type: "raster",
      tiles: ["https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: '&copy; <a href="https://waymarkedtrails.org">Waymarked Trails</a>',
    },
  },
  layers: [
    { id: "osm", type: "raster", source: "osm" },
    { id: "waymarked-cycling", type: "raster", source: "waymarked-cycling" },
  ],
};

const STYLE_BY_KEY: Record<MapStyleKey, StyleSpecification> = {
  basic: BASIC_STYLE,
  cyclosm: CYCLOSM_STYLE,
  cycling: CYCLING_STYLE,
};

const STYLE_LABELS: Record<MapStyleKey, string> = {
  basic: "Podstawowa",
  cyclosm: "CyclOSM",
  cycling: "Rowerowa",
};

const STYLE_ORDER: MapStyleKey[] = ["basic", "cyclosm", "cycling"];

const LAYERS_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2 1 8l11 6 11-6-11-6Zm0 8.5L3.5 8 12 3.5 20.5 8 12 10.5ZM1 12l11 6 11-6-2-1.09L12 16.5 3 10.91 1 12Zm0 4 11 6 11-6-2-1.09L12 20.5 3 14.91 1 16Z"/></svg>';

/** Prosta kontrolka MapLibre: przycisk z ikoną warstw + rozwijane menu wyboru stylu mapy. */
class LayersControl implements maplibregl.IControl {
  private container: HTMLDivElement;
  private menu: HTMLDivElement;
  private buttons = new Map<MapStyleKey, HTMLButtonElement>();
  private onOutsideClick = (e: MouseEvent) => {
    if (!this.container.contains(e.target as Node)) this.closeMenu();
  };

  constructor(
    private current: MapStyleKey,
    private onSelect: (key: MapStyleKey) => void,
  ) {
    this.container = document.createElement("div");
    this.container.className = "maplibregl-ctrl maplibregl-ctrl-group layers-ctrl";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "layers-ctrl-btn";
    button.title = "Warstwy";
    button.setAttribute("aria-label", "Wybierz warstwę mapy");
    button.innerHTML = LAYERS_ICON_SVG;
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });
    this.container.appendChild(button);

    this.menu = document.createElement("div");
    this.menu.className = "layers-ctrl-menu";
    for (const key of STYLE_ORDER) {
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = STYLE_LABELS[key];
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeMenu();
        this.setActive(key);
        this.onSelect(key);
      });
      this.buttons.set(key, item);
      this.menu.appendChild(item);
    }
    this.container.appendChild(this.menu);
    this.setActive(current);
  }

  private toggleMenu() {
    this.menu.classList.toggle("open");
  }

  private closeMenu() {
    this.menu.classList.remove("open");
  }

  setActive(key: MapStyleKey) {
    this.current = key;
    for (const [k, el] of this.buttons) el.classList.toggle("active", k === key);
  }

  onAdd(): HTMLElement {
    document.addEventListener("click", this.onOutsideClick);
    return this.container;
  }

  onRemove() {
    document.removeEventListener("click", this.onOutsideClick);
    this.container.parentNode?.removeChild(this.container);
  }
}

const srcId = (id: string) => `route-src-${id}`;
const lineId = (id: string) => `route-line-${id}`;

export default function MapView({ tracks, heatmapPoints }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const drawnIdsRef = useRef<string[]>([]);
  const tracksRef = useRef<DisplayTrack[]>(tracks);
  const heatmapRef = useRef<HeatmapPoint[] | null>(heatmapPoints);
  const [mapStyleKey, setMapStyleKey] = useState<MapStyleKey>(DEFAULT_STYLE_KEY);

  tracksRef.current = tracks;
  heatmapRef.current = heatmapPoints;

  // Inicjalizacja mapy — jednorazowo.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_BY_KEY[DEFAULT_STYLE_KEY],
      center: [17.921, 50.675],
      zoom: 10,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new LayersControl(DEFAULT_STYLE_KEY, setMapStyleKey), "top-right");

    map.on("load", () => {
      readyRef.current = true;
      drawHeatmap(map, heatmapRef.current, drawnIdsRef);
      drawTracks(map, tracksRef.current, drawnIdsRef, markersRef);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // Zmiana stylu mapy (przełącznik warstw) — po przeładowaniu stylu trzeba
  // odtworzyć własne źródła/warstwy (trasy, heatmapa), bo setStyle je czyści.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    map.setStyle(STYLE_BY_KEY[mapStyleKey], { diff: false });
    drawnIdsRef.current = [];
    map.once("style.load", () => {
      drawHeatmap(map, heatmapRef.current, drawnIdsRef);
      drawTracks(map, tracksRef.current, drawnIdsRef, markersRef);
    });
  }, [mapStyleKey]);

  // Warstwa heatmapy — pod liniami tras, niezależna od wyboru trasy/tras.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (readyRef.current) drawHeatmap(map, heatmapPoints, drawnIdsRef);
  }, [heatmapPoints]);

  // Rysowanie tras (jedna lub wiele naraz) + znaczników.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      drawTracks(map, tracks, drawnIdsRef, markersRef);

      if (tracks.length === 0) return;

      const bounds = new maplibregl.LngLatBounds();
      for (const dt of tracks) for (const c of dt.track.coords) bounds.extend(c);
      // Panel boczny zasłania lewą (desktop) lub dolną (mobile, bottom sheet) część mapy —
      // trzeba to uwzględnić w paddingu, inaczej fitBounds "chowa" kawałek trasy pod panelem.
      const isMobile = window.innerWidth <= 640;
      map.fitBounds(bounds, {
        padding: isMobile
          ? { top: 40, bottom: window.innerHeight * 0.55 + 20, left: 24, right: 24 }
          : { top: 60, bottom: 60, left: 420, right: 60 },
        duration: 500,
      });
    };

    if (readyRef.current) apply();
  }, [tracks]);

  return <div ref={containerRef} className="map-root" aria-label="Mapa tras" />;
}

function drawHeatmap(
  map: maplibregl.Map,
  heatmapPoints: HeatmapPoint[] | null,
  drawnIdsRef: { current: string[] },
) {
  if (map.getLayer("heatmap-layer")) map.removeLayer("heatmap-layer");
  if (map.getSource("heatmap-src")) map.removeSource("heatmap-src");
  if (!heatmapPoints || heatmapPoints.length === 0) return;

  map.addSource("heatmap-src", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: heatmapPoints.map((p) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: p },
      })),
    },
  });
  map.addLayer(
    {
      id: "heatmap-layer",
      type: "heatmap",
      source: "heatmap-src",
      paint: {
        "heatmap-weight": 0.6,
        "heatmap-intensity": 1,
        "heatmap-radius": 10,
        "heatmap-opacity": 0.75,
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(0,0,0,0)",
          0.2,
          "rgba(79,158,117,0.55)",
          0.5,
          "rgba(224,177,63,0.7)",
          0.8,
          "rgba(224,110,63,0.85)",
          1,
          "rgba(224,63,63,0.95)",
        ],
      },
    },
    // pod pierwszą linią trasy, jeśli już jakaś istnieje
    drawnIdsRef.current.length ? lineId(drawnIdsRef.current[0]) : undefined,
  );
}

function drawTracks(
  map: maplibregl.Map,
  tracks: DisplayTrack[],
  drawnIdsRef: { current: string[] },
  markersRef: { current: maplibregl.Marker[] },
) {
  for (const id of drawnIdsRef.current) {
    if (map.getLayer(lineId(id))) map.removeLayer(lineId(id));
    if (map.getSource(srcId(id))) map.removeSource(srcId(id));
  }
  drawnIdsRef.current = [];
  for (const m of markersRef.current) m.remove();
  markersRef.current = [];

  for (const dt of tracks) {
    if (dt.track.coords.length < 2) continue;
    map.addSource(srcId(dt.id), {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: dt.track.coords },
      },
    });
    map.addLayer({
      id: lineId(dt.id),
      type: "line",
      source: srcId(dt.id),
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": dt.color, "line-width": 5, "line-opacity": 0.9 },
    });
    drawnIdsRef.current.push(dt.id);

    if (dt.showMarkers) {
      const start = dt.track.coords[0];
      const end = dt.track.coords[dt.track.coords.length - 1];
      markersRef.current.push(
        new maplibregl.Marker({ color: "#2f9e5b" }).setLngLat(start).addTo(map),
      );
      markersRef.current.push(
        new maplibregl.Marker({ color: "#c0392b" }).setLngLat(end).addTo(map),
      );
      for (const wpt of dt.track.waypoints) {
        const marker = new maplibregl.Marker({ color: "#3388cc" })
          .setLngLat([wpt.lng, wpt.lat])
          .setPopup(new maplibregl.Popup({ offset: 16 }).setText(wpt.name))
          .addTo(map);
        markersRef.current.push(marker);
      }
    }
  }
}
