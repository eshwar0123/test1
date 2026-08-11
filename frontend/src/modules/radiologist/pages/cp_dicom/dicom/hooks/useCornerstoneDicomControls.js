import * as csCore from "@cornerstonejs/core";
import {
  ToolGroupManager,
  Enums as ToolsEnums,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  LengthTool,
  RectangleROITool,
  CircleROITool,
  PlanarFreehandROITool,
  ArrowAnnotateTool,
  StackScrollTool,
  annotation as csAnnotation,
  utilities as csToolsUtilities,
} from "@cornerstonejs/tools";

const safeAddTool = (toolGroup, toolName, options) => {
  try {
    toolGroup.addTool(toolName, options);
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (!msg.includes("already registered")) throw e;
  }
};

export default function useCornerstoneDicomControls({
  isCornerstoneDicom,
  dicomGrid,
  setDicomTool,
  toolGroupIdRef,
  getVisibleDicomSlots,
  renderingEngineRef,
  renderingEngineIdRef,
  activeDicomSlot,
  refreshDicomSliceIndicators,
  setActiveDicomSlot,
  dicomZoomMode,
  dicomTool,
  clamp,
  getActiveDicomViewport,
  annTool,
  getViewportIdForSlot,
  dicomImageIdsRef,
  axRef,
  sagRef,
  corRef,
  singleRef,
  isTransientMeasurementUid,
}) {
  const buildDicomToolGroup = (viewportIds) => {
    const tgId = toolGroupIdRef.current;
    if (!tgId) return null;
    try { ToolGroupManager.destroyToolGroup(tgId); } catch {}
    const tg = ToolGroupManager.createToolGroup(tgId);
    if (!tg) return null;

    safeAddTool(tg, StackScrollTool.toolName);
    safeAddTool(tg, PanTool.toolName);
    safeAddTool(tg, WindowLevelTool.toolName);
    safeAddTool(tg, ZoomTool.toolName);
    safeAddTool(tg, LengthTool.toolName);
    safeAddTool(tg, RectangleROITool.toolName);
    safeAddTool(tg, CircleROITool.toolName);
    safeAddTool(tg, PlanarFreehandROITool.toolName);
    safeAddTool(tg, ArrowAnnotateTool.toolName, {
      configuration: {
        arrowFirst: true,
        getTextCallback: (doneChangingTextCallback) => doneChangingTextCallback(" "),
        changeTextCallback: (data, eventData, doneChangingTextCallback) =>
          doneChangingTextCallback(" "),
      },
    });

    viewportIds.forEach((vpId) => {
      try { tg.addViewport(vpId, renderingEngineIdRef.current); } catch {}
    });
    tg.setToolActive(StackScrollTool.toolName, {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }],
    });
    tg.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
    });
    tg.setToolActive(WindowLevelTool.toolName, {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Secondary }],
    });
    tg.setToolActive(ZoomTool.toolName, {
      bindings: [{ modifierKey: ToolsEnums.KeyboardBindings.Ctrl }],
    });
    return tg;
  };

  const activateCornerstoneDicomTool = (mode) => {
    setDicomTool(mode);
    if (!isCornerstoneDicom) return;
    const tg = ToolGroupManager.getToolGroup(toolGroupIdRef.current);
    if (!tg) return;
    const clearNames = [
      WindowLevelTool.toolName,
      PanTool.toolName,
      ZoomTool.toolName,
      LengthTool.toolName,
      RectangleROITool.toolName,
      CircleROITool.toolName,
      PlanarFreehandROITool.toolName,
      ArrowAnnotateTool.toolName,
    ];
    clearNames.forEach((name) => {
      try { tg.setToolPassive(name); } catch {}
    });
    if (mode === "pan") {
      tg.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else if (mode === "brightness") {
      tg.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else if (mode === "measure") {
      tg.setToolActive(LengthTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else if (mode === "measure-rect") {
      tg.setToolActive(RectangleROITool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else if (mode === "measure-circle") {
      tg.setToolActive(CircleROITool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else if (mode === "measure-freehand") {
      tg.setToolActive(PlanarFreehandROITool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else if (mode === "crosshair") {
      // Keep Cornerstone crosshairs disabled for stack DICOM.
      // Crosshair visualization is handled by custom overlay in the grid.
      tg.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else if (mode === "zoom") {
      tg.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else {
      tg.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    }
    const visibleSlots = getVisibleDicomSlots();
    const vpIds = visibleSlots.map((slot) => getViewportIdForSlot(slot));
    renderingEngineRef.current?.renderViewports?.(vpIds);
  };

  const rebuildCornerstoneDicomViewports = async () => {
    if (!isCornerstoneDicom) return;
    const engine = renderingEngineRef.current;
    const imageIds = dicomImageIdsRef.current || [];
    if (!engine || !imageIds.length) return;

    const useTriPlanar = dicomGrid?.mode === "main2" && imageIds.length > 1;

    if (useTriPlanar) {
      const slotElements = [axRef.current, sagRef.current, corRef.current];
      const slots = getVisibleDicomSlots().filter((slot) => !!slotElements[slot]);
      if (!slots.length) return;
      const viewportInputs = slots.map((slot) => ({
        viewportId: `DICOM_SLOT_${slot}`,
        type: csCore.Enums.ViewportType.STACK,
        element: slotElements[slot],
        defaultOptions: {},
      }));
      engine.setViewports(viewportInputs);
      const viewportIds = viewportInputs.map((v) => v.viewportId);
      buildDicomToolGroup(viewportIds);
      engine.resize(true, false);

      const previewStep = 3;
      const previewIds = imageIds.filter((_, idx) => idx % previewStep === 0);
      const initialIds = previewIds.length ? previewIds : imageIds;

      for (const vpId of viewportIds) {
        const vp = engine.getViewport(vpId);
        if (!vp) continue;
        await vp.setStack(initialIds);
        vp.render();
      }
      if (initialIds !== imageIds) {
        setTimeout(() => {
          viewportIds.forEach((vpId) => {
            const vp = engine.getViewport(vpId);
            if (!vp) return;
            vp.setStack(imageIds).then(() => vp.render()).catch(() => {});
          });
        }, 0);
      }
      refreshDicomSliceIndicators(slots);
      activateCornerstoneDicomTool(dicomZoomMode ? "zoom" : dicomTool);
      return;
    }

    if (!singleRef.current) return;
    const viewportId = "DICOM_SINGLE";
    engine.setViewports([
      { viewportId, type: csCore.Enums.ViewportType.STACK, element: singleRef.current, defaultOptions: {} },
    ]);
    buildDicomToolGroup([viewportId]);
    engine.resize(true, false);
    const vp = engine.getViewport(viewportId);
    const previewStep = Math.max(Math.ceil(imageIds.length / 24), 1);
    const previewIds = imageIds.filter((_, idx) => idx % previewStep === 0);
    const initialIds = previewIds.length ? previewIds : imageIds;
    await vp.setStack(initialIds);
    vp.render();
    if (initialIds !== imageIds) {
      setTimeout(() => {
        const liveVp = engine.getViewport(viewportId);
        if (!liveVp) return;
        liveVp.setStack(imageIds).then(() => liveVp.render()).catch(() => {});
      }, 0);
    }
    refreshDicomSliceIndicators([0]);
    activateCornerstoneDicomTool(dicomZoomMode ? "zoom" : dicomTool);
  };

  const scrollCornerstoneDicom = (delta) => {
    const vp = getActiveDicomViewport();
    if (!vp?.scroll) return;
    vp.scroll(delta);
    vp.render();
    refreshDicomSliceIndicators([activeDicomSlot]);
  };

  const scrollCornerstoneDicomBySlot = (slot, delta) => {
    if (!isCornerstoneDicom) return;
    const vpId = getViewportIdForSlot(slot);
    const vp = renderingEngineRef.current?.getViewport?.(vpId);
    if (!vp?.scroll) return;
    vp.scroll(delta);
    vp.render();
    refreshDicomSliceIndicators([slot]);
  };

  const handleCornerstoneDicomWheel = (slot, e) => {
    if (!isCornerstoneDicom) return;
    const vpId = getViewportIdForSlot(slot);
    const vp = renderingEngineRef.current?.getViewport?.(vpId);
    if (!vp) return;
    setActiveDicomSlot(slot);

    if (dicomZoomMode || dicomTool === "zoom") {
      const cam = vp.getCamera?.();
      if (!cam?.parallelScale) return;
      const factor = e.deltaY > 0 ? 1.08 : 0.92;
      const next = clamp(cam.parallelScale * factor, 0.0001, 100000);
      vp.setCamera?.({ parallelScale: next });
      vp.render?.();
      return;
    }

    if (dicomTool === "brightness") {
      const props = vp.getProperties?.() || {};
      const range = props.voiRange || { lower: -150, upper: 250 };
      const shift = e.deltaY > 0 ? -12 : 12;
      vp.setProperties?.({ voiRange: { lower: range.lower + shift, upper: range.upper + shift } });
      vp.render?.();
      return;
    }

    const dir = e.deltaY > 0 ? 1 : -1;
    scrollCornerstoneDicomBySlot(slot, dir);
  };

  const rotateCornerstoneDicom = (deltaDeg) => {
    const vp = getActiveDicomViewport();
    if (!vp?.getViewPresentation || !vp?.setViewPresentation) return;
    const present = vp.getViewPresentation() || {};
    const rotation = (((present.rotation || 0) + deltaDeg) % 360 + 360) % 360;
    vp.setViewPresentation({ ...present, rotation });
    vp.render();
  };
  const canDeleteMeasurementUid = (uid) => {
    if (!uid) return false;
    if (typeof isTransientMeasurementUid === "function") {
      try {
        return !!isTransientMeasurementUid(uid);
      } catch {
        return false;
      }
    }
    return false;
  };

  const deleteLastLengthOnDicomSlot = (slot, evt) => {
    if (!isCornerstoneDicom) return;
    const vp = renderingEngineRef.current?.getViewport?.(getViewportIdForSlot(slot));
    if (!vp?.element) return;
    const measurementToolNames = new Set([
      LengthTool.toolName,
      RectangleROITool.toolName,
      CircleROITool.toolName,
      PlanarFreehandROITool.toolName,
    ]);

    if (evt?.currentTarget && typeof evt.clientX === "number" && typeof evt.clientY === "number") {
      try {
        const rect = evt.currentTarget.getBoundingClientRect();
        const canvasPoint = [evt.clientX - rect.left, evt.clientY - rect.top];
        const hit = csToolsUtilities?.getAnnotationNearPoint?.(vp.element, canvasPoint, 8);
        const hitToolName = hit?.metadata?.toolName || hit?.toolName;
        if (hit?.annotationUID && measurementToolNames.has(hitToolName)) {
          if (canDeleteMeasurementUid(hit.annotationUID)) {
            csAnnotation.state.removeAnnotation(hit.annotationUID);
            vp.render?.();
          }
          return;
        }
      } catch {}
    }

    let activeMeasurementToolName = LengthTool.toolName;
    if (dicomTool === "measure-rect") activeMeasurementToolName = RectangleROITool.toolName;
    else if (dicomTool === "measure-circle") activeMeasurementToolName = CircleROITool.toolName;
    else if (dicomTool === "measure-freehand") activeMeasurementToolName = PlanarFreehandROITool.toolName;
    const anns = csAnnotation?.state?.getAnnotations?.(activeMeasurementToolName, vp.element) || [];
    if (!anns.length) return;
    const last = [...anns].reverse().find((a) => canDeleteMeasurementUid(a?.annotationUID));
    if (!last?.annotationUID) return;
    csAnnotation.state.removeAnnotation(last.annotationUID);
    vp.render?.();
  };

  const isScopedToolActive =
    isCornerstoneDicom &&
    ((dicomTool !== "none" && dicomTool !== "crosshair") || dicomZoomMode || annTool !== "select");

  return {
    activateCornerstoneDicomTool,
    scrollCornerstoneDicom,
    handleCornerstoneDicomWheel,
    rotateCornerstoneDicom,
    deleteLastLengthOnDicomSlot,
    rebuildCornerstoneDicomViewports,
    isScopedToolActive,
  };
}
