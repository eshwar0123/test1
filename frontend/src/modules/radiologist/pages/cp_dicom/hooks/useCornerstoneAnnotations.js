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
  annotation as csAnnotation,
} from "@cornerstonejs/tools";

export default function useCornerstoneAnnotations({
  isCornerstoneActive,
  toolGroupIdRef,
  renderingEngineRef,
  slotPlanes,
  setAnnTool,
  setAnnDraftTitle,
  setAnnDraftComment,
  setAnnSaveDialog,
  annSaveDialog,
  annDraftTitle,
  annDraftComment,
  cornerstoneAnnMeta,
  setCornerstoneAnnMeta,
  setCornerstoneAnnNotes,
  setCornerstoneAnnVersion,
  setActiveSlot,
  getVisibleSlots,
  getViewportIdForSlot,

  backendUrl,
  caseId,
  getUserId,
  setDbAnnotations,
  setSavedCornerstoneUids,
}) {
  const toolLabels = {
    [RectangleROITool.toolName]: "box",
    [CircleROITool.toolName]: "circle",
    [PlanarFreehandROITool.toolName]: "free",
    [LengthTool.toolName]: "line",
    [ArrowAnnotateTool.toolName]: "arrow",
  };

  const normalizeType = (t) => (t === "freehand" ? "free" : t);

  const getCornerstoneAnnotationToolName = (toolId) => {
    if (toolId === "box") return RectangleROITool.toolName;
    if (toolId === "circle") return CircleROITool.toolName;
    if (toolId === "freehand" || toolId === "free")
      return PlanarFreehandROITool.toolName;
    if (toolId === "line") return LengthTool.toolName;
    if (toolId === "arrow") return ArrowAnnotateTool.toolName;
    return null;
  };

  // ✅ helper: force tool back to SELECT (WindowLevel) so saved annotation click always highlights correctly
  const forceSelectMode = () => {
    try {
      setAnnTool?.("select");
    } catch {}

    if (!isCornerstoneActive) return;

    try {
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
        try {
          tg.setToolPassive(name);
        } catch {}
      });

      // WindowLevel behaves like "select/inspect" for your workflow
      tg.setToolActive(WindowLevelTool.toolName, {
        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
      });
    } catch (e) {
      console.warn("forceSelectMode failed:", e);
    }
  };

  const activateCornerstoneAnnotationTool = (toolId) => {
    setAnnTool(toolId);
    if (!isCornerstoneActive) return;

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
      try {
        tg.setToolPassive(name);
      } catch {}
    });

    const target = getCornerstoneAnnotationToolName(toolId);
    if (target) {
      tg.setToolActive(target, {
        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
      });
    } else {
      tg.setToolActive(WindowLevelTool.toolName, {
        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
      });
    }
  };

  const getCornerstoneAnnotationItems = () => {
    if (!isCornerstoneActive) return [];
    const toolNames = [
      RectangleROITool.toolName,
      CircleROITool.toolName,
      PlanarFreehandROITool.toolName,
      LengthTool.toolName,
      ArrowAnnotateTool.toolName,
    ];

    const items = [];
    const seen = new Set();

    const visibleSlots = getVisibleSlots();
    const slotByViewportId = new Map(
      visibleSlots.map((slot) => [getViewportIdForSlot(slot), slot])
    );

    const all = csAnnotation?.state?.getAllAnnotations?.() || [];
    all.forEach((a) => {
      const uid = a?.annotationUID;
      const toolName = a?.metadata?.toolName;
      if (!uid || seen.has(uid)) return;
      if (!toolName || !toolNames.includes(toolName)) return;

      seen.add(uid);

      const vpId = a?.metadata?.viewportId;
      const slotFromVp = vpId != null ? slotByViewportId.get(vpId) : undefined;
      const slot = Number.isInteger(slotFromVp)
        ? slotFromVp
        : visibleSlots[0] ?? 0;

      const plane = slotPlanes[slot] || "axial";
      items.push({ uid, slot, plane, type: toolLabels[toolName] || toolName });
    });

    return items;
  };

  const getCornerstoneAnnotationItemByUid = (uid) => {
    if (!uid) return null;
    return getCornerstoneAnnotationItems().find((x) => x.uid === uid) || null;
  };

  const openAnnotationSaveDialog = (uid, fallback = null) => {
    let item = getCornerstoneAnnotationItemByUid(uid);
    if (!item && fallback) item = fallback;
    if (!item) return;

    setAnnDraftTitle("");
    setAnnDraftComment("");
    setAnnSaveDialog({
      open: true,
      uid,
      slot: item.slot,
      plane: item.plane,
      type: item.type,
    });
  };

  const closeAnnotationSaveDialog = () => {
    setAnnSaveDialog({
      open: false,
      uid: null,
      slot: 0,
      plane: "axial",
      type: "",
    });
    setAnnDraftTitle("");
    setAnnDraftComment("");
  };

  const saveAnnotationDialog = async (scope) => {
    const uid = annSaveDialog.uid;
    if (!uid) return;

    const userId = getUserId?.();
    if (!userId) {
      console.error("Missing userId (localStorage auth)");
      return;
    }

    const safeType = normalizeType(annSaveDialog.type || "annotation");
    const title = (annDraftTitle || `${safeType}`).trim();
    const comments = (annDraftComment || "").trim();
    const visibility = scope === "all" ? "everybody" : "mine";

    const raw = csAnnotation?.state?.getAnnotation?.(uid);
    let tool_data = {};
    try {
      tool_data = raw ? JSON.parse(JSON.stringify(raw)) : {};
    } catch {
      tool_data = {};
    }

    // ✅ store slice info for later jump
    try {
      const vpId = raw?.metadata?.viewportId;
      const engine = renderingEngineRef.current;
      const vp = vpId ? engine?.getViewport?.(vpId) : null;

      // stack viewport
      const currentIndex =
        (typeof vp?.getCurrentImageIdIndex === "function" &&
          vp.getCurrentImageIdIndex()) ??
        (typeof vp?.getImageIdIndex === "function" && vp.getImageIdIndex()) ??
        null;

      const ids =
        typeof vp?.getImageIds === "function" ? vp.getImageIds() || [] : [];
      const currentImageId =
        currentIndex != null && ids[currentIndex] ? ids[currentIndex] : null;

      // volume viewport (nifti)
      const sliceIndex =
        typeof vp?.getSliceIndex === "function" ? vp.getSliceIndex() : null;

      tool_data = {
        ...tool_data,
        metadata: {
          ...(tool_data?.metadata || {}),
          imageIdIndex: currentIndex,
          referencedImageId: currentImageId,
          sliceIndex: sliceIndex ?? tool_data?.metadata?.sliceIndex,
        },
      };
    } catch (e) {
      console.warn("Could not attach slice info to tool_data", e);
    }

    // optimistic UI
    setCornerstoneAnnMeta((prev) => ({
      ...prev,
      [uid]: { title, comment: comments, scope },
    }));
    setCornerstoneAnnNotes((prev) => ({ ...prev, [uid]: comments }));

    // Save locally (no backend required)
    const localAnnotation = {
      annotation_id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      case_id: caseId,
      user_id: userId,
      annotation_type: safeType,
      visibility,
      title,
      comments,
      tool_data,
      created_at: new Date().toISOString(),
    };

    setDbAnnotations?.((prev) => [localAnnotation, ...(prev || [])]);
    setSavedCornerstoneUids?.((prev) => {
      const next = new Set(prev);
      next.add(uid);
      return next;
    });
    console.log("[Annotations] Saved locally:", localAnnotation.annotation_id);
    closeAnnotationSaveDialog();
  };

  const jumpToCornerstoneAnnotationByUid = (uid, slot, dbToolData = null) => {
    if (!uid || !isCornerstoneActive) return;

    // ✅ IMPORTANT: always exit drawing mode so annotation shows
    forceSelectMode();

    const visibleSlots = getVisibleSlots?.() || [];
    const safeSlot = Number.isInteger(slot) ? slot : (visibleSlots[0] ?? 0);
    setActiveSlot?.(safeSlot);

    const engine = renderingEngineRef.current;
    const vpId = getViewportIdForSlot?.(safeSlot);
    const vp = engine?.getViewport?.(vpId);
    if (!vp) return;

    const element = vp.element || vp.getElement?.();
    if (!element) return;

    let workingUid = uid;

    let ann = csAnnotation?.state?.getAnnotation?.(workingUid) || null;

    // rehydrate if needed
    if (!ann && dbToolData) {
      try {
        const toolObj =
          typeof dbToolData === "string" ? JSON.parse(dbToolData) : dbToolData;
        if (!toolObj) return;

        const toolToAdd = {
          ...toolObj,
          annotationUID: toolObj?.annotationUID || workingUid,
          metadata: {
            ...(toolObj?.metadata || {}),
            viewportId: vpId,
          },
        };

        workingUid = toolToAdd.annotationUID || workingUid;

        csAnnotation?.state?.addAnnotation?.(toolToAdd, element);
        ann = csAnnotation?.state?.getAnnotation?.(workingUid) || toolToAdd;
      } catch (e) {
        console.error("Rehydrate annotation failed:", e);
        return;
      }
    }

    if (!ann) return;

    const forceRerender = () => {
      try {
        const ids = (visibleSlots.length ? visibleSlots : [safeSlot]).map((s) =>
          getViewportIdForSlot(s)
        );
        try {
          engine?.renderViewports?.(ids);
        } catch {}

        requestAnimationFrame(() => {
          try {
            vp?.render?.();
          } catch {}
          try {
            engine?.renderViewports?.(ids);
          } catch {}
        });

        setTimeout(() => {
          try {
            vp?.render?.();
          } catch {}
          try {
            engine?.renderViewports?.(ids);
          } catch {}
        }, 60);
      } catch {}
    };

    // jump slice (volume + stack)
    try {
      const sliceIndex =
        ann?.metadata?.sliceIndex ??
        ann?.metadata?.imageIdIndex ??
        ann?.data?.imageIdIndex ??
        null;

      let jumped = false;

      // VolumeViewport
      if (sliceIndex != null && typeof vp?.setSliceIndex === "function") {
        vp.setSliceIndex(Number(sliceIndex));
        jumped = true;
      }

      // StackViewport
      if (!jumped && typeof vp?.setImageIdIndex === "function") {
        const refId =
          ann?.metadata?.referencedImageId ||
          ann?.metadata?.imageId ||
          ann?.metadata?.referenceImageId;

        if (refId && typeof vp?.getImageIds === "function") {
          const ids = vp.getImageIds() || [];
          const idx = ids.findIndex((x) => String(x) === String(refId));
          if (idx >= 0) {
            vp.setImageIdIndex(idx);
            jumped = true;
          }
        }

        if (!jumped && sliceIndex != null) {
          vp.setImageIdIndex(Number(sliceIndex));
          jumped = true;
        }
      }

      // camera fallback
      if (!jumped) {
        const points = [];
        const handlePoints = ann?.data?.handles?.points;
        if (Array.isArray(handlePoints)) {
          handlePoints.forEach((p) => {
            if (Array.isArray(p) && p.length >= 3) points.push(p);
          });
        }
        const polyline = ann?.data?.contour?.polyline;
        if (Array.isArray(polyline)) {
          polyline.forEach((p) => {
            if (Array.isArray(p) && p.length >= 3) points.push(p);
          });
        }

        if (points.length) {
          const center = [0, 0, 0];
          for (const p of points) {
            center[0] += p[0];
            center[1] += p[1];
            center[2] += p[2];
          }
          center[0] /= points.length;
          center[1] /= points.length;
          center[2] /= points.length;

          const cam = vp.getCamera?.();
          const vpn = cam?.viewPlaneNormal;
          if (
            cam?.focalPoint &&
            cam?.position &&
            Array.isArray(vpn) &&
            vpn.length >= 3
          ) {
            const fullDelta = [
              center[0] - cam.focalPoint[0],
              center[1] - cam.focalPoint[1],
              center[2] - cam.focalPoint[2],
            ];
            const d =
              fullDelta[0] * vpn[0] +
              fullDelta[1] * vpn[1] +
              fullDelta[2] * vpn[2];
            const delta = [vpn[0] * d, vpn[1] * d, vpn[2] * d];

            vp.setCamera?.({
              focalPoint: [
                cam.focalPoint[0] + delta[0],
                cam.focalPoint[1] + delta[1],
                cam.focalPoint[2] + delta[2],
              ],
              position: [
                cam.position[0] + delta[0],
                cam.position[1] + delta[1],
                cam.position[2] + delta[2],
              ],
            });
            jumped = true;
          }
        }
      }

      if (jumped) forceRerender();
    } catch (e) {
      console.warn("Jump failed:", e);
    }

    // ✅ ensure visible + selected + rerender again
    try {
      csAnnotation?.state?.setAnnotationVisibility?.(workingUid, true);
    } catch {}
    try {
      csAnnotation?.selection?.setAnnotationSelected?.(workingUid, true);
    } catch {}

    forceRerender();
  };

  const deleteCornerstoneAnnotationByUid = (uid, slot) => {
    if (!uid || !isCornerstoneActive) return;

    const visibleSlots = getVisibleSlots?.() || [];
    const safeSlot = Number.isInteger(slot) ? slot : visibleSlots[0] ?? 0;

    try {
      if (csAnnotation?.state?.removeAnnotation) {
        csAnnotation.state.removeAnnotation(uid);
      } else if (csAnnotation?.state?.removeAnnotations) {
        csAnnotation.state.removeAnnotations([uid]);
      } else if (csAnnotation?.state?.remove) {
        csAnnotation.state.remove(uid);
      }
    } catch (e) {
      console.error("Failed to remove annotation from cornerstone state", e);
    }

    try {
      setCornerstoneAnnMeta?.((prev) => {
        const next = { ...(prev || {}) };
        delete next[uid];
        return next;
      });
    } catch {}

    try {
      setCornerstoneAnnNotes?.((prev) => {
        const next = { ...(prev || {}) };
        delete next[uid];
        return next;
      });
    } catch {}

    try {
      setActiveSlot?.(safeSlot);
      const engine = renderingEngineRef.current;
      const ids = (visibleSlots.length ? visibleSlots : [safeSlot]).map((s) =>
        getViewportIdForSlot(s)
      );
      engine?.renderViewports?.(ids);
    } catch {}

    try {
      setCornerstoneAnnVersion?.((v) => v + 1);
    } catch {}
  };

  return {
    getCornerstoneAnnotationToolName,
    activateCornerstoneAnnotationTool,
    getCornerstoneAnnotationItems,
    openAnnotationSaveDialog,
    closeAnnotationSaveDialog,
    saveAnnotationDialog,
    deleteCornerstoneAnnotationByUid,
    jumpToCornerstoneAnnotationByUid,
  };
}
