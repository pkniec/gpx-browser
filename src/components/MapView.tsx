import { useEffect, useRef } from "react";
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

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const srcId = (id: string) => `route-src-${id}`;
const lineId = (id: string) => `route-line-${id}`;

export default function MapView({ tracks, heatmapPoints }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const drawnIdsRef = useRef<string[]>([]);

  // Inicjalizacja mapy — jednorazowo.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [17.921, 50.675],
      zoom: 10,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      readyRef.current = true;
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // Warstwa heatmapy — pod liniami tras, niezależna od wyboru trasy/tras.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
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
    };

    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [heatmapPoints]);

  // Rysowanie tras (jedna lub wiele naraz) + znaczników.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
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
    else map.once("load", apply);
  }, [tracks]);

  return <div ref={containerRef} className="map-root" aria-label="Mapa tras" />;
}
