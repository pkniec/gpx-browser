import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ElevationPoint } from "../elevation";

type Props = {
  points: ElevationPoint[];
  onSelect?: (point: ElevationPoint | null) => void;
};

const VIEW_W = 300;
const VIEW_H = 100;
const PAD_Y = 8;

/** Znajduje punkt najbliższy danemu dystansowi (przeszukanie liniowe — max. 300 punktów). */
function nearestByDistance(points: ElevationPoint[], km: number): ElevationPoint {
  let best = points[0];
  let bestDiff = Math.abs(best.distanceKm - km);
  for (const p of points) {
    const diff = Math.abs(p.distanceKm - km);
    if (diff < bestDiff) {
      best = p;
      bestDiff = diff;
    }
  }
  return best;
}

export default function ElevationChart({ points, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selected, setSelected] = useState<ElevationPoint | null>(null);
  const draggingRef = useRef(false);

  const totalKm = points[points.length - 1].distanceKm || 1;
  const elevations = points.map((p) => p.elevationM);
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);
  const midEle = (minEle + maxEle) / 2;
  const span = maxEle - minEle || 1;

  const x = (km: number) => (km / totalKm) * VIEW_W;
  const y = (ele: number) => VIEW_H - PAD_Y - ((ele - minEle) / span) * (VIEW_H - PAD_Y * 2);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.distanceKm).toFixed(1)},${y(p.elevationM).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${VIEW_W},${VIEW_H} L0,${VIEW_H} Z`;

  const xTicks = [0, totalKm / 2, totalKm];
  const yTicks = [minEle, midEle, maxEle];

  const pickFromClientX = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const point = nearestByDistance(points, fraction * totalKm);
    setSelected(point);
    onSelect?.(point);
  };

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    pickFromClientX(e.clientX);
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    pickFromClientX(e.clientX);
  };

  const handlePointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="elevation-chart">
      <div className="elevation-plot">
        <div className="elevation-y-labels">
          {yTicks
            .slice()
            .reverse()
            .map((v, i) => (
              <span key={i}>{Math.round(v)} m</span>
            ))}
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="elevation-svg"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <defs>
            <linearGradient id="elevation-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ade80" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
            </linearGradient>
          </defs>
          {yTicks.map((v, i) => (
            <line
              key={`y${i}`}
              x1="0"
              x2={VIEW_W}
              y1={y(v)}
              y2={y(v)}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {xTicks.map((v, i) => (
            <line
              key={`x${i}`}
              x1={x(v)}
              x2={x(v)}
              y1="0"
              y2={VIEW_H}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={areaPath} fill="url(#elevation-fill)" stroke="none" />
          <path d={linePath} fill="none" stroke="#4ade80" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {selected && (
            <>
              <line
                x1={x(selected.distanceKm)}
                x2={x(selected.distanceKm)}
                y1="0"
                y2={VIEW_H}
                stroke="#e8e8ea"
                strokeWidth="1"
                strokeDasharray="3,3"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={x(selected.distanceKm)} cy={y(selected.elevationM)} r="3.5" fill="#e8e8ea" stroke="#4ade80" strokeWidth="1.5" />
            </>
          )}
        </svg>
      </div>
      <div className="elevation-x-labels">
        {xTicks.map((v, i) => (
          <span key={i}>{v.toFixed(1)} km</span>
        ))}
      </div>
      <p className="elevation-hint">
        {selected
          ? `${selected.distanceKm.toFixed(1)} km · ${Math.round(selected.elevationM)} m n.p.m.`
          : "Dotknij lub przeciągnij po wykresie, aby zobaczyć wysokość w danym miejscu trasy."}
      </p>
    </div>
  );
}
