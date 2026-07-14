import type { CSSProperties } from "react";
import { ArrowRight, Folder } from "lucide-react";
import type { Category, RouteMeta } from "../types";
import { categoryPath, childCategories, routesInCategory } from "../data";

const enterDelay = (i: number): CSSProperties =>
  ({ "--enter-delay": `${Math.min(i, 8) * 35}ms` }) as CSSProperties;

/** Ten folder ma się zawsze pokazywać jako pierwszy na liście (cotygodniowa jazda). */
const PINNED_CATEGORY = "GraveLove Środy";

type Props = {
  categories: Category[];
  routes: RouteMeta[];
  currentCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  onSelectRoute: (id: string) => void;
  checkedRouteIds: Set<string>;
  onToggleRoute: (id: string) => void;
  onSelectAllInCategory: (ids: string[]) => void;
  onClearSelection: () => void;
  routeColor: (id: string) => string | null;
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
};

export default function CategoryBrowser({
  categories,
  routes,
  currentCategoryId,
  onSelectCategory,
  onSelectRoute,
  checkedRouteIds,
  onToggleRoute,
  onSelectAllInCategory,
  onClearSelection,
  routeColor,
  showHeatmap,
  onToggleHeatmap,
}: Props) {
  const subcategories = childCategories(categories, currentCategoryId)
    .slice()
    .sort((a, b) => Number(b.name.trim() === PINNED_CATEGORY) - Number(a.name.trim() === PINNED_CATEGORY));
  const directRoutes = currentCategoryId ? routesInCategory(routes, currentCategoryId) : [];
  const breadcrumb = currentCategoryId ? categoryPath(categories, currentCategoryId) : [];
  const checkedCount = directRoutes.filter((r) => checkedRouteIds.has(r.id)).length;

  return (
    <div className="browser">
      <nav className="breadcrumb" aria-label="Ścieżka kategorii">
        <button className="crumb" onClick={() => onSelectCategory(null)}>
          Wszystkie kategorie
        </button>
        {breadcrumb.map((c) => (
          <span key={c.id}>
            <span className="crumb-sep">/</span>
            <button className="crumb" onClick={() => onSelectCategory(c.id)}>
              {c.name}
            </button>
          </span>
        ))}
      </nav>

      {subcategories.length > 0 && (
        <div className="folder-list">
          {subcategories.map((c, i) => {
            const count = routesInCategory(routes, c.id).length;
            const subcategoryCount = childCategories(categories, c.id).length;
            const badgeCount = count > 0 ? count : subcategoryCount;
            return (
              <button
                key={c.id}
                className="folder-row"
                style={enterDelay(i)}
                onClick={() => onSelectCategory(c.id)}
              >
                <span className="folder-avatar">
                  <Folder size={18} strokeWidth={2} />
                </span>
                <span className="folder-text">
                  <span className="folder-name">{c.name.trim()}</span>
                  <span className="folder-count">
                    {count > 0 ? `${count} tras` : subcategoryCount > 0 ? `${subcategoryCount} podkategorie` : "brak tras"}
                  </span>
                </span>
                <span className="folder-side">
                  <span className="folder-count-pill">{badgeCount}</span>
                  <ArrowRight className="folder-arrow" size={16} strokeWidth={2} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {currentCategoryId && directRoutes.length > 0 && (
        <label className="heatmap-toggle">
          <input type="checkbox" checked={showHeatmap} onChange={onToggleHeatmap} />
          Heatmapa tras w tym folderze
        </label>
      )}

      {currentCategoryId && directRoutes.length > 1 && (
        <div className="selection-bar">
          <span className="selection-count">
            {checkedCount > 0 ? `Zaznaczono: ${checkedCount}` : "Zaznacz kilka, by porównać na mapie"}
          </span>
          <div className="selection-actions">
            <button className="selection-link" onClick={() => onSelectAllInCategory(directRoutes.map((r) => r.id))}>
              Zaznacz wszystkie
            </button>
            <button className="selection-link" onClick={onClearSelection} disabled={checkedCount === 0}>
              Wyczyść
            </button>
          </div>
        </div>
      )}

      {currentCategoryId && directRoutes.length > 0 && (
        <ul className="route-list">
          {directRoutes.map((r, i) => {
            const color = routeColor(r.id);
            const checked = checkedRouteIds.has(r.id);
            return (
              <li key={r.id} style={enterDelay(i)}>
                <div className={`route-row${checked ? " route-row-checked" : ""}`}>
                  <label
                    className="route-checkbox"
                    style={checked && color ? { borderColor: color } : undefined}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleRoute(r.id)}
                      aria-label={`Zaznacz trasę ${r.title} do porównania na mapie`}
                    />
                    {checked && color && (
                      <span className="route-color-dot" style={{ background: color }} />
                    )}
                  </label>
                  <button className="route-row-main" onClick={() => onSelectRoute(r.id)}>
                    <span className="route-title">{r.title}</span>
                    <span className="route-meta">
                      {r.date ? `${r.date} · ` : ""}
                      {r.distanceKm.toFixed(1)} km · {r.ascentM} m w górę
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {currentCategoryId && subcategories.length === 0 && directRoutes.length === 0 && (
        <p className="empty-state">Brak tras w tej kategorii.</p>
      )}
    </div>
  );
}
