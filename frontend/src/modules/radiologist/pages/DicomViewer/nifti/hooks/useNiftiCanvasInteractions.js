export default function useNiftiCanvasInteractions({
  niftiVol,
  niftiTool,
  niftiPan,
  setNiftiPan,
  niftiPanDrag,
  setNiftiPanDrag,
  niftiMeasureStart,
  setNiftiMeasureStart,
  setNiftiMeasureHover,
  niftiMeasures,
  setNiftiMeasures,
  annTool,
  annColor,
  annOpacity,
  annotations,
  setAnnotations,
  setSelectedAnnId,
  annDrawing,
  setAnnDrawing,
  annDrag,
  setAnnDrag,
  niftiDrag,
  setNiftiDrag,
  setNiftiBoxes,
  nxIndex,
  nyIndex,
  nzIndex,
  setNxIndex,
  setNyIndex,
  setNzIndex,
  setNiftiWc,
  niftiZoomMode,
  setNiftiZoom,
  setNiftiPlane,
  setNiftiGridSelected,
  clamp,
  normalizeBox,
  pointInBox,
  distPointToSegment,
}) {
  const niftiCanvasToVoxel = (canvas, e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);
    return { x, y };
  };

  const currentSliceIndex = (plane) => {
    if (plane === "axial") return nzIndex;
    if (plane === "sagittal") return nxIndex;
    return nyIndex;
  };

  const startAnnotation = (plane, p) => {
    const slice = currentSliceIndex(plane);
    const base = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: annTool,
      plane,
      slice,
      color: annColor,
      opacity: annOpacity,
      note: "",
    };
    if (annTool === "freehand") {
      setAnnDrawing({ ...base, points: [p] });
    } else {
      setAnnDrawing({ ...base, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    }
  };

  const finishAnnotation = () => {
    if (!annDrawing) return;
    setAnnotations((a) => [...a, annDrawing]);
    setSelectedAnnId(annDrawing.id);
    setAnnDrawing(null);
  };

  const updateAnnotation = (p) => {
    if (!annDrawing) return;
    if (annDrawing.type === "freehand") {
      setAnnDrawing((d) => ({ ...d, points: [...d.points, p] }));
    } else {
      setAnnDrawing((d) => ({ ...d, x1: p.x, y1: p.y }));
    }
  };

  const hitTestAnnotation = (plane, p) => {
    const slice = currentSliceIndex(plane);
    const list = annotations.filter((a) => a.plane === plane && a.slice === slice);
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      if (a.type === "box") {
        if (pointInBox(p.x, p.y, a)) return a;
      } else if (a.type === "circle") {
        const cx = (a.x0 + a.x1) / 2;
        const cy = (a.y0 + a.y1) / 2;
        const rx = Math.abs(a.x1 - a.x0) / 2;
        const ry = Math.abs(a.y1 - a.y0) / 2;
        const v = ((p.x - cx) ** 2) / (rx * rx + 1e-6) + ((p.y - cy) ** 2) / (ry * ry + 1e-6);
        if (v <= 1.0) return a;
      } else if (a.type === "line" || a.type === "arrow") {
        const d = distPointToSegment(p.x, p.y, a.x0, a.y0, a.x1, a.y1);
        if (d <= 6) return a;
      } else if (a.type === "freehand") {
        for (let j = 1; j < a.points.length; j++) {
          const d = distPointToSegment(p.x, p.y, a.points[j - 1].x, a.points[j - 1].y, a.points[j].x, a.points[j].y);
          if (d <= 6) return a;
        }
      }
    }
    return null;
  };

  const startNiftiDrag = (plane, e) => {
    if (!niftiVol) return;
    const canvas = e.currentTarget;
    const p = niftiCanvasToVoxel(canvas, e);
    if (niftiTool === "pan") {
      setNiftiPanDrag({ plane, startClient: { x: e.clientX, y: e.clientY }, startPan: { ...niftiPan[plane] } });
      return;
    }
    if (niftiTool === "measure") {
      const start = niftiMeasureStart[plane];
      if (!start) {
        setNiftiMeasureStart((s) => ({ ...s, [plane]: { x: p.x, y: p.y } }));
        setNiftiMeasureHover((h) => ({ ...h, [plane]: { x: p.x, y: p.y } }));
      } else {
        setNiftiMeasures((m) => [...m, { plane, x0: start.x, y0: start.y, x1: p.x, y1: p.y }]);
        setNiftiMeasureStart((s) => ({ ...s, [plane]: null }));
        setNiftiMeasureHover((h) => ({ ...h, [plane]: null }));
      }
      return;
    }
    if (annTool === "select") {
      const hit = hitTestAnnotation(plane, p);
      if (hit) {
        setSelectedAnnId(hit.id);
        setAnnDrag({ id: hit.id, plane, start: p });
      } else {
        setSelectedAnnId(null);
      }
      return;
    }
    if (annTool !== "select") {
      startAnnotation(plane, p);
      return;
    }
    let box;
    if (plane === "axial") {
      box = normalizeBox({
        x0: clamp(p.x, 0, niftiVol.w - 1),
        y0: clamp(p.y, 0, niftiVol.h - 1),
        x1: clamp(p.x, 0, niftiVol.w - 1),
        y1: clamp(p.y, 0, niftiVol.h - 1),
        z0: nzIndex,
        z1: nzIndex,
      });
    } else if (plane === "sagittal") {
      box = normalizeBox({
        x0: nxIndex,
        x1: nxIndex,
        y0: clamp(p.y, 0, niftiVol.h - 1),
        y1: clamp(p.y, 0, niftiVol.h - 1),
        z0: clamp(p.x, 0, niftiVol.d - 1),
        z1: clamp(p.x, 0, niftiVol.d - 1),
      });
    } else {
      box = normalizeBox({
        x0: clamp(p.x, 0, niftiVol.w - 1),
        x1: clamp(p.x, 0, niftiVol.w - 1),
        y0: nyIndex,
        y1: nyIndex,
        z0: clamp(p.y, 0, niftiVol.d - 1),
        z1: clamp(p.y, 0, niftiVol.d - 1),
      });
    }
    setNiftiDrag({ plane, start: p, box });
  };

  const updateNiftiDrag = (plane, e) => {
    if (!niftiVol) return;
    if (niftiTool === "pan" && niftiPanDrag && niftiPanDrag.plane === plane) {
      const dx = e.clientX - niftiPanDrag.startClient.x;
      const dy = e.clientY - niftiPanDrag.startClient.y;
      setNiftiPan((p) => ({
        ...p,
        [plane]: { x: niftiPanDrag.startPan.x + dx, y: niftiPanDrag.startPan.y + dy },
      }));
      return;
    }
    if (niftiTool === "measure") {
      const start = niftiMeasureStart[plane];
      if (start) {
        const canvas = e.currentTarget;
        const p = niftiCanvasToVoxel(canvas, e);
        setNiftiMeasureHover((h) => ({ ...h, [plane]: { x: p.x, y: p.y } }));
      }
      return;
    }
    const canvas = e.currentTarget;
    const p = niftiCanvasToVoxel(canvas, e);
    if (annDrag && annDrag.id) {
      const dx = p.x - annDrag.start.x;
      const dy = p.y - annDrag.start.y;
      setAnnotations((arr) =>
        arr.map((a) => {
          if (a.id !== annDrag.id) return a;
          if (a.type === "freehand") {
            return { ...a, points: a.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) };
          }
          return { ...a, x0: a.x0 + dx, y0: a.y0 + dy, x1: a.x1 + dx, y1: a.y1 + dy };
        })
      );
      setAnnDrag({ ...annDrag, start: p });
      return;
    }
    if (annDrawing) {
      updateAnnotation(p);
      return;
    }
    if (!niftiDrag || niftiDrag.plane !== plane) return;
    let box = { ...niftiDrag.box };
    if (plane === "axial") {
      box.x1 = clamp(p.x, 0, niftiVol.w - 1);
      box.y1 = clamp(p.y, 0, niftiVol.h - 1);
    } else if (plane === "sagittal") {
      box.z1 = clamp(p.x, 0, niftiVol.d - 1);
      box.y1 = clamp(p.y, 0, niftiVol.h - 1);
    } else {
      box.x1 = clamp(p.x, 0, niftiVol.w - 1);
      box.z1 = clamp(p.y, 0, niftiVol.d - 1);
    }
    setNiftiDrag({ ...niftiDrag, box: normalizeBox(box) });
  };

  const endNiftiDrag = (plane) => {
    if (niftiTool === "pan") {
      setNiftiPanDrag(null);
      return;
    }
    if (niftiTool === "measure") {
      setNiftiMeasureHover((h) => ({ ...h, [plane]: null }));
      return;
    }
    if (annDrawing) finishAnnotation();
    setAnnDrag(null);
    if (!niftiDrag || niftiDrag.plane !== plane) return;
    const b = normalizeBox(niftiDrag.box);
    const isTiny =
      Math.abs(b.x1 - b.x0) < 2 &&
      Math.abs(b.y1 - b.y0) < 2 &&
      Math.abs(b.z1 - b.z0) < 2;
    if (!isTiny) {
      setNiftiBoxes((prev) => [
        ...prev,
        { id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, ...b, note: "" },
      ]);
    }
    setNiftiDrag(null);
  };

  const onNiftiContextMenu = (plane, e) => {
    if (!niftiVol) return;
    if (niftiTool !== "measure") return;
    e.preventDefault();
    const p = niftiCanvasToVoxel(e.currentTarget, e);
    const measures = niftiMeasures
      .map((m, idx) => ({ ...m, idx }))
      .filter((m) => m.plane === plane);
    if (!measures.length) return;
    let best = null;
    for (const m of measures) {
      const d = distPointToSegment(p.x, p.y, m.x0, m.y0, m.x1, m.y1);
      if (!best || d < best.d) best = { d, idx: m.idx };
    }
    if (best && best.d <= 6) {
      setNiftiMeasures((arr) => arr.filter((_, i) => i !== best.idx));
    }
  };

  const openBoxInViewer = (box) => {
    if (!niftiVol) return;
    if (box.plane && typeof box.slice === "number") {
      setNiftiPlane(box.plane);
      if (box.plane === "axial") setNzIndex(clamp(box.slice, 0, niftiVol.d - 1));
      if (box.plane === "sagittal") setNxIndex(clamp(box.slice, 0, niftiVol.w - 1));
      if (box.plane === "coronal") setNyIndex(clamp(box.slice, 0, niftiVol.h - 1));
    }
    if (typeof box.x0 === "number" && typeof box.x1 === "number") {
      const cx = Math.round((box.x0 + box.x1) / 2);
      const cy = Math.round((box.y0 + box.y1) / 2);
      setNxIndex(clamp(cx, 0, niftiVol.w - 1));
      setNyIndex(clamp(cy, 0, niftiVol.h - 1));
    } else if (box.points && box.points.length) {
      const xs = box.points.map((p) => p.x);
      const ys = box.points.map((p) => p.y);
      const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
      const cy = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
      setNxIndex(clamp(cx, 0, niftiVol.w - 1));
      setNyIndex(clamp(cy, 0, niftiVol.h - 1));
    }
    setNiftiGridSelected(true);
  };

  const onWheelNiftiAxial = (e) => {
    if (!niftiVol) return;
    e.preventDefault();
    if (niftiTool === "brightness") {
      const delta = e.deltaY > 0 ? -10 : 10;
      setNiftiWc((v) => (v ?? niftiVol.wc) + delta);
      return;
    }
    if (niftiZoomMode) {
      const dir = e.deltaY > 0 ? -1 : 1;
      setNiftiZoom((z) => ({ ...z, axial: clamp(z.axial + dir * 0.1, 0.5, 5) }));
      return;
    }
    const dir = e.deltaY > 0 ? 1 : -1;
    setNzIndex(clamp(nzIndex + dir, 0, niftiVol.d - 1));
  };

  const onWheelNiftiSagittal = (e) => {
    if (!niftiVol) return;
    e.preventDefault();
    if (niftiTool === "brightness") {
      const delta = e.deltaY > 0 ? -10 : 10;
      setNiftiWc((v) => (v ?? niftiVol.wc) + delta);
      return;
    }
    if (niftiZoomMode) {
      const dir = e.deltaY > 0 ? -1 : 1;
      setNiftiZoom((z) => ({ ...z, sagittal: clamp(z.sagittal + dir * 0.1, 0.5, 5) }));
      return;
    }
    const dir = e.deltaY > 0 ? 1 : -1;
    setNxIndex(clamp(nxIndex + dir, 0, niftiVol.w - 1));
  };

  const onWheelNiftiCoronal = (e) => {
    if (!niftiVol) return;
    e.preventDefault();
    if (niftiTool === "brightness") {
      const delta = e.deltaY > 0 ? -10 : 10;
      setNiftiWc((v) => (v ?? niftiVol.wc) + delta);
      return;
    }
    if (niftiZoomMode) {
      const dir = e.deltaY > 0 ? -1 : 1;
      setNiftiZoom((z) => ({ ...z, coronal: clamp(z.coronal + dir * 0.1, 0.5, 5) }));
      return;
    }
    const dir = e.deltaY > 0 ? 1 : -1;
    setNyIndex(clamp(nyIndex + dir, 0, niftiVol.h - 1));
  };

  return {
    startNiftiDrag,
    updateNiftiDrag,
    endNiftiDrag,
    onNiftiContextMenu,
    openBoxInViewer,
    onWheelNiftiAxial,
    onWheelNiftiSagittal,
    onWheelNiftiCoronal,
  };
}
