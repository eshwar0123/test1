// useAnatomyLabel.js
// Cornerstone3D: turn a canvas point (click or crosshair) into a world coord,
// ask the backend what anatomy is there, expose {label, loading, lookupAt}.
//
// Relative URL on purpose (ngrok-safe; no hardcoded 127.0.0.1:8100).

import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../utils/constants'; // SAME prefix as every other call
// The Vite dev server only proxies /api/* to the backend. BACKEND_URL carries the
// /api prefix, so this becomes /api/radiology/api/anatomy/label -> proxied ->
// backend /radiology/api/anatomy/label. A bare /radiology/... is NOT proxied (404).

export default function useAnatomyLabel(studyUid) {
  const [label, setLabel] = useState(null);   // { label, label_id, voxel } | null
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  // Look up anatomy at a viewport + canvas coordinate [cx, cy].
  // viewport is a CS3D viewport (toolGroup viewport): has canvasToWorld().
  const lookupAt = useCallback(
    async (viewport, canvasPos) => {
      if (!studyUid || !viewport) return;
      const [x, y, z] = viewport.canvasToWorld(canvasPos); // LPS mm
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(`${BACKEND_URL}/radiology/api/anatomy/label`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ study_uid: studyUid, x, y, z }),
          signal: ctrl.signal,
        });
        const data = await res.json();
        setLabel(data || null);   // keep full response (incl. reason) so it's visible
      } catch (e) {
        if (e.name !== 'AbortError') setLabel(null);
      } finally {
        setLoading(false);
      }
    },
    [studyUid]
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  return { label, loading, lookupAt };
}

/* --------------------------------------------------------------------------
WIRING (in Dicomviewer.js)

  import { getEnabledElement } from '@cornerstonejs/core';
  import useAnatomyLabel from './useAnatomyLabel';

  const { label, loading, lookupAt } = useAnatomyLabel(studyUid);

  // (A) click-to-identify — most reliable trigger
  function onViewportClick(evt) {
    const ee = getEnabledElement(evt.currentTarget);   // the cs3d element
    if (!ee) return;
    const rect = evt.currentTarget.getBoundingClientRect();
    const canvasPos = [evt.clientX - rect.left, evt.clientY - rect.top];
    lookupAt(ee.viewport, canvasPos);
  }
  // attach onMouseUp / onClick to each viewport element div.

  // (B) drive it from the Crosshairs tool instead: on drag end, read the
  // crosshair center and convert. The tool stores its center; if your
  // CS3D version exposes it:
  //   const center = crosshairsToolInstance.getToolCenter?.();  // world LPS
  //   then POST center directly (skip canvasToWorld).
  // Otherwise fall back to (A) — clicking sets the crosshair anyway.

  // Render the tooltip:
  //   {loading && <span className="anatomy-pill">…</span>}
  //   {label && <span className="anatomy-pill">{prettify(label.label)}</span>}
  // prettify('vertebrae_L2') -> 'Vertebra L2'

-------------------------------------------------------------------------- */

export function prettify(name) {
  if (!name) return '';
  return name
    .replace(/vertebrae_/, 'Vertebra ')
    .replace(/_left$/, ' (Left)')
    .replace(/_right$/, ' (Right)')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
