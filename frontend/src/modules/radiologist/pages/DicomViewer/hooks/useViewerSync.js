import { useEffect } from "react";
import { reset, setSyncMode } from "../utils/WorldSyncStore";

export default function useViewerSync({
  enabled,
  visibleSlots,
  onAfterSync,
}) {
  useEffect(() => {
    if (!enabled) {
      setSyncMode("off");
      reset();
      return;
    }

    setSyncMode("full");
    onAfterSync?.(visibleSlots);

    return () => {
      setSyncMode("off");
      reset();
    };
  }, [enabled, visibleSlots, onAfterSync]);
}
