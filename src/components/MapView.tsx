import { useEffect, useRef } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RouteTrack } from "../types";

type Props = {
  track: RouteTrack | null;
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

export default function MapView({ track }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);

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

  // Rysowanie trasy + punktów POI.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (map.getLayer("route-line")) map.removeLayer("route-line");
      if (map.getSource("route-src")) map.removeSource("route-src");
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];

      if (!track || track.coords.length < 2) return;

      map.addSource("route-src", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: track.coords },
        },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route-src",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#c25fd0", "line-width": 5, "line-opacity": 0.95 },
      });

      const start = track.coords[0];
      const end = track.coords[track.coords.length - 1];
      markersRef.current.push(
        new maplibregl.Marker({ color: "#2f9e5b" }).setLngLat(start).addTo(map),
      );
      markersRef.current.push(
        new maplibregl.Marker({ color: "#c0392b" }).setLngLat(end).addTo(map),
      );
      for (const wpt of track.waypoints) {
        const marker = new maplibregl.Marker({ color: "#3388cc" })
          .setLngLat([wpt.lng, wpt.lat])
          .setPopup(new maplibregl.Popup({ offset: 16 }).setText(wpt.name))
          .addTo(map);
        markersRef.current.push(marker);
      }

      const bounds = new maplibregl.LngLatBounds();
      for (const c of track.coords) bounds.extend(c);
      map.fitBounds(bounds, { padding: 60, duration: 500 });
    };

    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [track]);

  return <div ref={containerRef} className="map-root" aria-label="Mapa trasy" />;
}
