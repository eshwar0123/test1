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
  CrosshairsTool,
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

export default function useCornerstoneNiftiControls({
  isCornerstoneNifti,
  setNiftiTool,
  toolGroupIdRef,
  getVisibleNiftiSlots,
  renderingEngineRef,
  activeNiftiSlot,
  refreshNiftiSliceIndicators,
  setActiveNiftiSlot,
  niftiZoomMode,
  niftiTool,
  clamp,
  getActiveNiftiViewport,
  colormapPresets,
  niftiVolumeIdRef,
  renderingEngineIdRef,
  viewportIdsRef,
  niftiSlotPlanes,
  axRef,
  sagRef,
  corRef,
  niftiSlotColormap,
  annTool,
  isTransientMeasurementUid,
}) {
  const activateCornerstoneNiftiTool = (mode) => {
    setNiftiTool(mode);
    if (!isCornerstoneNifti) return;
    const tg = ToolGroupManager.getToolGroup(toolGroupIdRef.current);
    if (!tg) return;
    const clearNames = [
      WindowLevelTool.toolName,
      PanTool.toolName,
      ZoomTool.toolName,
      LengthTool.toolName,
      CrosshairsTool.toolName,
      RectangleROITool.toolName,
      CircleROITool.toolName,
      PlanarFreehandROITool.toolName,
      ArrowAnnotateTool.toolName,
    ];
    clearNames.forEach((name) => {
      try { tg.setToolPassive(name); } catch {}
    });
    try { tg.setToolDisabled(CrosshairsTool.toolName); } catch {}
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
      try { tg.setToolEnabled(CrosshairsTool.toolName); } catch {}
      tg.setToolActive(CrosshairsTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else if (mode === "zoom") {
      tg.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    } else {
      tg.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
    }
    const visibleSlots = getVisibleNiftiSlots();
    const vpIds = visibleSlots.map((slot) => `NIFTI_SLOT_${slot}`);
    renderingEngineRef.current?.renderViewports?.(vpIds);
  };

  const scrollCornerstoneNifti = (delta) => {
    const vp = getActiveNiftiViewport();
    if (!vp?.scroll) return;
    vp.scroll(delta);
    vp.render();
    refreshNiftiSliceIndicators([activeNiftiSlot]);
  };

  const scrollCornerstoneNiftiBySlot = (slot, delta) => {
    if (!isCornerstoneNifti) return;
    const vpId = `NIFTI_SLOT_${slot}`;
    const vp = renderingEngineRef.current?.getViewport?.(vpId);
    if (!vp?.scroll) return;
    vp.scroll(delta);
    vp.render();
    refreshNiftiSliceIndicators([slot]);
  };

  const applyNiftiColormapToSlot = (slot, presetLabel) => {
    if (!isCornerstoneNifti) return;
    const preset = colormapPresets.find((p) => p.label === presetLabel) || colormapPresets[1];
    const volumeId = niftiVolumeIdRef.current;
    const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
    if (!vp?.setProperties) return;
    const props = {
      colormap: { name: preset.csName },
      invert: !!preset.invert,
    };
    try {
      vp.setProperties(props, volumeId || undefined);
    } catch {
      try { vp.setProperties(props); } catch {}
    }
    vp.render?.();
  };

  const handleCornerstoneNiftiWheel = (slot, e) => {
    if (!isCornerstoneNifti) return;
    const vpId = `NIFTI_SLOT_${slot}`;
    const vp = renderingEngineRef.current?.getViewport?.(vpId);
    if (!vp) return;
    setActiveNiftiSlot(slot);

    if (niftiZoomMode || niftiTool === "zoom") {
      const cam = vp.getCamera?.();
      if (!cam?.parallelScale) return;
      const factor = e.deltaY > 0 ? 1.08 : 0.92;
      const next = clamp(cam.parallelScale * factor, 0.0001, 100000);
      vp.setCamera?.({ parallelScale: next });
      vp.render?.();
      return;
    }

    if (niftiTool === "brightness") {
      const props = vp.getProperties?.() || {};
      const range = props.voiRange || { lower: -150, upper: 250 };
      const shift = e.deltaY > 0 ? -12 : 12;
      vp.setProperties?.({ voiRange: { lower: range.lower + shift, upper: range.upper + shift } });
      vp.render?.();
      return;
    }

    const dir = e.deltaY > 0 ? 1 : -1;
    scrollCornerstoneNiftiBySlot(slot, dir);
  };

  const rotateCornerstoneNifti = (deltaDeg) => {
    const vp = getActiveNiftiViewport();
    if (!vp?.getViewPresentation || !vp?.setViewPresentation) return;
    const present = vp.getViewPresentation() || {};
    const rotation = (((present.rotation || 0) + deltaDeg) % 360 + 360) % 360;
    vp.setViewPresentation({ ...present, rotation });
    vp.render();
  };

  const rebuildNiftiToolGroup = (viewportIds) => {
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
    safeAddTool(tg, CrosshairsTool.toolName, {
      configuration: {
        getReferenceLineColor: () => "#22c55e",
        getReferenceLineControllable: () => true,
        getReferenceLineDraggableRotatable: () => true,
        getReferenceLineSlabThicknessControlsOn: () => false,
      },
    });
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
    try { tg.setToolDisabled(CrosshairsTool.toolName); } catch {}
    return tg;
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

  const deleteLastLengthOnNiftiSlot = (slot, evt) => {
    if (!isCornerstoneNifti) return;
    const vp = renderingEngineRef.current?.getViewport?.(`NIFTI_SLOT_${slot}`);
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
    if (niftiTool === "measure-rect") activeMeasurementToolName = RectangleROITool.toolName;
    else if (niftiTool === "measure-circle") activeMeasurementToolName = CircleROITool.toolName;
    else if (niftiTool === "measure-freehand") activeMeasurementToolName = PlanarFreehandROITool.toolName;
    const anns = csAnnotation?.state?.getAnnotations?.(activeMeasurementToolName, vp.element) || [];
    if (!anns.length) return;
    const last = [...anns].reverse().find((a) => canDeleteMeasurementUid(a?.annotationUID));
    if (!last?.annotationUID) return;
    csAnnotation.state.removeAnnotation(last.annotationUID);
    vp.render?.();
  };

  const rebuildCornerstoneNiftiViewports = async () => {
    const engine = renderingEngineRef.current;
    const volumeId = niftiVolumeIdRef.current;
    if (!engine || !volumeId) return;

    const orientationMap = {
      axial: csCore.Enums.OrientationAxis.AXIAL,
      sagittal: csCore.Enums.OrientationAxis.SAGITTAL,
      coronal: csCore.Enums.OrientationAxis.CORONAL,
    };
    const slotElements = [axRef.current, sagRef.current, corRef.current];
    const slots = getVisibleNiftiSlots().filter((slot) => !!slotElements[slot]);
    if (!slots.length) return;

    const viewportsInput = slots.map((slot) => ({
      viewportId: `NIFTI_SLOT_${slot}`,
      type: csCore.Enums.ViewportType.ORTHOGRAPHIC,
      element: slotElements[slot],
      defaultOptions: { orientation: orientationMap[niftiSlotPlanes[slot] || "axial"] },
    }));
    const viewportIds = viewportsInput.map((v) => v.viewportId);
    viewportIdsRef.current = viewportIds;

    engine.setViewports(viewportsInput);
    rebuildNiftiToolGroup(viewportIds);
    await csCore.setVolumesForViewports(engine, [{ volumeId }], viewportIds);
    getVisibleNiftiSlots().forEach((slot) => {
      applyNiftiColormapToSlot(slot, niftiSlotColormap[slot] || "BW");
    });
    engine.resize(true, false);
    engine.renderViewports(viewportIds);
    refreshNiftiSliceIndicators(slots);
    activateCornerstoneNiftiTool(niftiZoomMode ? "zoom" : niftiTool);
  };

  const isScopedToolActive =
    isCornerstoneNifti && (niftiTool !== "none" || niftiZoomMode || annTool !== "select");

  return {
    activateCornerstoneNiftiTool,
    scrollCornerstoneNifti,
    scrollCornerstoneNiftiBySlot,
    applyNiftiColormapToSlot,
    handleCornerstoneNiftiWheel,
    rotateCornerstoneNifti,
    deleteLastLengthOnNiftiSlot,
    rebuildCornerstoneNiftiViewports,
    isScopedToolActive,
  };
}
