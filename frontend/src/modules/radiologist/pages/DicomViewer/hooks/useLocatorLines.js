import { useEffect, useRef, useState } from "react";
import LocatorLineManager from "../utils/LocatorLineManager";

/* ─── useLocatorLines ─────────────────────────────────────────────────────
   Owns a LocatorLineManager instance for the lifetime of the viewer. The
   manager is self-discovering (listens to global ELEMENT_ENABLED /
   ELEMENT_DISABLED), so this hook does NOT need a list of viewport ids — it
   only needs to know whether the locator is currently enabled.

   Returns:
     linesByViewport : { [viewportId]: [{x1,y1,x2,y2,color}] }
       Pass linesByViewport[viewportId] down to <LocatorLineOverlay/>.

   The `enabled` flag is read live via a ref inside the manager, so toggling it
   does not recreate listeners — it just turns drawing on/off cheaply.
*/
export default function useLocatorLines({ enabled = true, color } = {}) {
  const [linesByViewport, setLinesByViewport] = useState({});
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const managerRef = useRef(null);

  useEffect(() => {
    const manager = new LocatorLineManager({
      color,
      getEnabled: () => enabledRef.current,
      onChange: (lines) => setLinesByViewport(lines || {}),
    });
    managerRef.current = manager;
    manager.start();
    return () => {
      manager.destroy();
      managerRef.current = null;
    };
    // color is captured once; changing it would need a remount, which is fine
    // because it never changes at runtime in this app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the enabled flag flips, ask the manager to recompute immediately so
  // the lines appear/disappear without waiting for the next viewport event.
  useEffect(() => {
    managerRef.current?.refresh();
  }, [enabled]);

  return { linesByViewport };
}
