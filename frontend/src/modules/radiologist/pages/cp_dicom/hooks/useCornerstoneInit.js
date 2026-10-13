import * as csCore from "@cornerstonejs/core";
import {
  init as csToolsInit,
  addTool,
  annotation as csAnnotation,
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
} from "@cornerstonejs/tools";
import dicomParser from "dicom-parser";
import * as cornerstoneDICOMImageLoader from "@cornerstonejs/dicom-image-loader";
import {
  init as initNiftiLoader,
  cornerstoneNiftiImageLoader,
} from "@cornerstonejs/nifti-volume-loader";

let csInitPromise = null;
let viewportScopedAnnotationManagerApplied = false;

export async function initCornerstoneOnce() {
  if (csInitPromise) return csInitPromise;

  csInitPromise = (async () => {
    await csCore.init();
    await initNiftiLoader();
    csCore.imageLoader.registerImageLoader("nifti", cornerstoneNiftiImageLoader);

    const dicomImageLoader =
      cornerstoneDICOMImageLoader.default || cornerstoneDICOMImageLoader;

    dicomImageLoader.external = dicomImageLoader.external || {};
    dicomImageLoader.external.cornerstone = csCore;
    dicomImageLoader.external.dicomParser = dicomParser;

    if (dicomImageLoader.init) {
      dicomImageLoader.init({
        maxWebWorkers: 0,
        startWebWorkersOnDemand: false,
        useWebWorkers: false,
      });
    }

    // Some versions expect cornerstone core as an argument; others ignore it.
    try {
      dicomImageLoader.wadouri?.register?.(csCore);
    } catch {
      dicomImageLoader.wadouri?.register?.();
    }

    csToolsInit();
    if (!viewportScopedAnnotationManagerApplied) {
      try {
        const manager = csAnnotation?.state?.getAnnotationManager?.();
        if (!manager) {
          throw new Error("Cornerstone annotation manager not available");
        }
        manager.getGroupKey = (annotationGroupSelector) => {
          if (typeof annotationGroupSelector === "string") {
            return annotationGroupSelector;
          }
          const enabledElement = csCore.getEnabledElement?.(annotationGroupSelector);
          if (!enabledElement) {
            throw new Error("Element not enabled for annotation grouping");
          }
          return `${enabledElement.renderingEngineId}:${enabledElement.viewportId}`;
        };
        viewportScopedAnnotationManagerApplied = true;
      } catch (e) {
        console.warn("Failed to apply viewport-scoped annotation manager:", e);
      }
    }
    addTool(WindowLevelTool);
    addTool(PanTool);
    addTool(ZoomTool);
    addTool(LengthTool);
    addTool(RectangleROITool);
    addTool(CircleROITool);
    addTool(PlanarFreehandROITool);
    addTool(ArrowAnnotateTool);
    addTool(StackScrollTool);
    addTool(CrosshairsTool);
  })();

  return csInitPromise;
}
