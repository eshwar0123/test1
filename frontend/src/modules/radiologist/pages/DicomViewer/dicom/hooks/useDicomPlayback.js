import { useEffect } from "react";

export default function useDicomPlayback({
  isDicom,
  isPlaying,
  playMs,
  getActiveDicomViewport,
  refreshDicomSliceIndicators,
  activeDicomSlot,
  setIsPlaying,
}) {
  useEffect(() => {
    if (!isDicom || !isPlaying) return;
    const id = setInterval(() => {
      const vp = getActiveDicomViewport();
      if (!vp) return;

      const imageIds = vp.getImageIds?.() || [];
      if (imageIds.length <= 1) {
        setIsPlaying(false);
        return;
      }

      const curr = Math.max(0, Number(vp.getCurrentImageIdIndex?.() ?? 0));
      const next = curr + 1 >= imageIds.length ? 0 : curr + 1;

      if (vp.setImageIdIndex) {
        vp.setImageIdIndex(next);
        vp.render?.();
      } else if (vp.scroll) {
        vp.scroll(1);
        vp.render?.();
      }

      refreshDicomSliceIndicators([activeDicomSlot]);
    }, playMs);
    return () => clearInterval(id);
  }, [
    isPlaying,
    playMs,
    isDicom,
    activeDicomSlot,
    getActiveDicomViewport,
    refreshDicomSliceIndicators,
    setIsPlaying,
  ]);
}
