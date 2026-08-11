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
  ReferenceLinesTool,
} from "@cornerstonejs/tools";
import dicomParser from "dicom-parser";
import * as cornerstoneDICOMImageLoader from "@cornerstonejs/dicom-image-loader";
import {
  init as initNiftiLoader,
  cornerstoneNiftiImageLoader,
} from "@cornerstonejs/nifti-volume-loader";

import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";

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
      // NOTE: enabling useWebWorkers here does NOT fix compressed-transfer-
      // syntax (JPEG-LS/JPEG2000/JPEG-Lossless) decoding in this build — the
      // codec loader throws "Codec loader requires a browser environment"
      // inside the worker (it checks `typeof window`, which doesn't exist in
      // a Worker's `self` scope). That's almost certainly why this was set
      // to disabled originally. See conversation notes for the real fix
      // (bundler worker config, a different loader version, or server-side
      // transcoding of compressed studies) before touching this again.
      dicomImageLoader.init({
        maxWebWorkers: 0,
        startWebWorkersOnDemand: false,
        useWebWorkers: false,
      });
    }

    // ── beforeSend for @cornerstonejs/dicom-image-loader ─────────────────
    // This is the loader CS3D actually uses for wadouri: imageIds.
    // Skip auth header for S3 presigned URLs — S3 rejects auth+signature combo.
    if (dicomImageLoader.configure) {
      dicomImageLoader.configure({
        beforeSend: (xhr, url) => {
          if (url && (url.includes("X-Amz-Signature") || url.includes("x-amz-signature"))) return;
          try {
            const auth = JSON.parse(localStorage.getItem("auth") || "{}");
            const token = auth.token || null;
            if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
          } catch {}
        },
      });
    }

    // ── Configure legacy WADO loader (wadouri: imageIds) ──────────────────
    // Skip Authorization header for S3 presigned URLs — S3 rejects requests
    // that have both a URL signature (X-Amz-Signature) and an auth header.
    try {
      const wadoLoader = cornerstoneWADOImageLoader;
      if (wadoLoader?.configure) {
        wadoLoader.configure({
          beforeSend: (xhr, imageId) => {
            const url = (imageId || "").replace(/^wadouri:/i, "");
            if (url.includes("X-Amz-Signature") || url.includes("x-amz-signature")) return;
            try {
              const auth = JSON.parse(localStorage.getItem("auth") || "{}");
              const token = auth.token || null;
              if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
            } catch {}
          },
        });
      }
    } catch (e) {
      console.warn("[useCornerstoneInit] WADO beforeSend config failed:", e);
    }

    // Register a thin wrapper that intercepts S3 presigned wadouri imageIds
    // and ensures no Authorization header is added (some versions ignore beforeSend).
    try {
      const originalLoader = csCore.imageLoader.getImageLoadObject;
      csCore.imageLoader.registerImageLoader("s3wadouri", async (imageId) => {
        const url = imageId.replace(/^s3wadouri:/i, "");
        const r = await fetch(url);
        const buf = await r.arrayBuffer();
        const blobUrl = URL.createObjectURL(new Blob([buf], { type: "application/octet-stream" }));
        const realId = "wadouri:" + blobUrl;
        return csCore.imageLoader.loadImage(realId);
      });
    } catch {}
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
    addTool(ReferenceLinesTool);
  })();

  return csInitPromise;
}
