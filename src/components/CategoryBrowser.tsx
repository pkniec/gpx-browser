import type { Category, RouteMeta } from "../types";
import { categoryPath, childCategories, routesInCategory } from "../data";

type Props = {
  categories: Category[];
  routes: RouteMeta[];
  currentCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  onSelectRoute: (id: string) => void;
};

export default function CategoryBrowser({
  categories,
  routes,
  currentCategoryId,
  onSelectCategory,
  onSelectRoute,
}: Props) {
  const subcategories = childCategories(categories, currentCategoryId);
  const directRoutes = currentCategoryId ? routesInCategory(routes, currentCategoryId) : [];
  const breadcrumb = currentCategoryId ? categoryPath(categories, currentCategoryId) : [];

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
        <div className="tile-grid">
          {subcategories.map((c) => {
            const count = routesInCategory(routes, c.id).length;
            const hasChildren = childCategories(categories, c.id).length > 0;
            return (
              <button key={c.id} className="tile" onClick={() => onSelectCategory(c.id)}>
                <span className="tile-name">{c.name.trim()}</span>
                <span className="tile-meta">
                  {count > 0 ? `${count} tras` : hasChildren ? "podkategorie" : "brak tras"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {currentCategoryId && directRoutes.length > 0 && (
        <ul className="route-list">
          {directRoutes.map((r) => (
            <li key={r.id}>
              <button className="route-row" onClick={() => onSelectRoute(r.id)}>
                <span className="route-title">{r.title}</span>
                <span className="route-meta">
                  {r.date ? `${r.date} · ` : ""}
                  {r.distanceKm.toFixed(1)} km · {r.ascentM} m w górę
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {currentCategoryId && subcategories.length === 0 && directRoutes.length === 0 && (
        <p className="empty-state">Brak tras w tej kategorii.</p>
      )}
    </div>
  );
}
