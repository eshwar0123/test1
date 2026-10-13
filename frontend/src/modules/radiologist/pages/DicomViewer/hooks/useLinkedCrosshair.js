import { useEffect } from "react";
import { setSyncMode } from "../utils/WorldSyncStore";

export default function useLinkedCrosshair({
  enabled,
  crosshairMode,
  visibleSlots,
  onAfterSync,
}) {
  useEffect(() => {
    if (!enabled) return;

    setSyncMode(crosshairMode === "syncPointer" ? "crosshair" : "full");
    onAfterSync?.(visibleSlots);

    return () => {
      setSyncMode("off");
    };
  }, [enabled, crosshairMode, visibleSlots, onAfterSync]);
}
