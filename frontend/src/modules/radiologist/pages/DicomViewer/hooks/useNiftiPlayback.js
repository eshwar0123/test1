import { useEffect } from "react";

export default function useNiftiPlayback({
  isNifti,
  isPlaying,
  isCornerstoneNifti,
  playMs,
  getActiveNiftiViewport,
  refreshNiftiSliceIndicators,
  activeNiftiSlot,
  setIsPlaying,
  niftiVol,
  niftiPlane,
  setNzIndex,
  setNxIndex,
  setNyIndex,
}) {
  useEffect(() => {
    if (!isNifti || !isPlaying) return;
    if (isCornerstoneNifti) {
      const id = setInterval(() => {
        const vp = getActiveNiftiViewport();
        if (!vp?.scroll || !vp?.getCamera) return;
        const before = JSON.stringify(vp.getCamera()?.focalPoint || []);
        vp.scroll(1);
        vp.render();
        refreshNiftiSliceIndicators([activeNiftiSlot]);
        const after = JSON.stringify(vp.getCamera()?.focalPoint || []);
        if (before === after) {
          setIsPlaying(false);
        }
      }, playMs);
      return () => clearInterval(id);
    }
    if (!niftiVol) return;
    const id = setInterval(() => {
      if (niftiPlane === "axial") {
        setNzIndex((z) => {
          if (z + 1 >= niftiVol.d) {
            setIsPlaying(false);
            return z;
          }
          return z + 1;
        });
      } else if (niftiPlane === "sagittal") {
        setNxIndex((x) => {
          if (x + 1 >= niftiVol.w) {
            setIsPlaying(false);
            return x;
          }
          return x + 1;
        });
      } else {
        setNyIndex((y) => {
          if (y + 1 >= niftiVol.h) {
            setIsPlaying(false);
            return y;
          }
          return y + 1;
        });
      }
    }, playMs);
    return () => clearInterval(id);
  }, [
    isPlaying,
    playMs,
    isNifti,
    isCornerstoneNifti,
    niftiVol,
    niftiPlane,
    activeNiftiSlot,
    getActiveNiftiViewport,
    refreshNiftiSliceIndicators,
    setIsPlaying,
    setNzIndex,
    setNxIndex,
    setNyIndex,
  ]);
}
