import { useOverlayState } from "./useOverlayState";
import "./overlay-layer.css";

/** Global drawer stack mount — z-index 50. Legacy drawers remain in Layout. */
export function DrawerLayer(): React.JSX.Element | null {
  const { drawers, drawerApi } = useOverlayState();

  if (drawers.length === 0) return null;

  return (
    <div className="overlay-drawer-layer" data-overlay-layer="drawer">
      {drawers.map((drawer) => (
        <div key={drawer.id} className="overlay-drawer-layer__entry">
          <button
            type="button"
            className="overlay-drawer-layer__backdrop"
            aria-label="Close drawer"
            onClick={() => drawerApi.close(drawer.id)}
          />
          <aside className="overlay-drawer-layer__panel" role="dialog" aria-modal="true">
            {drawer.title ? (
              <h2 className="overlay-drawer-layer__title">{drawer.title}</h2>
            ) : null}
            <p className="overlay-drawer-layer__fallback">
              暂不支持此 Drawer 类型：{drawer.type}
            </p>
          </aside>
        </div>
      ))}
    </div>
  );
}
