# DicomViewer Module Contract

This folder contains the split architecture for `frontend/src/pages/Dicomviewer.jsx`.

## Folder Responsibilities

- `components/`
  - Pure UI/presentation.
  - No data fetching.
  - No direct Cornerstone setup.
  - Receives state + handlers via props.

- `hooks/`
  - Stateful and behavioral logic.
  - Owns side effects (`useEffect`) and event wiring.
  - Does not own page layout.

- `services/`
  - External/business actions (report build/print/download).
  - No React state.

- `utils/`
  - Pure reusable functions/constants.
  - No React state and no side effects.

- `state/`
  - Reserved for shared state modules (currently optional).

## Current Dependency Flow

`Dicomviewer.jsx` (orchestrator) -> hooks -> components

- `Dicomviewer.jsx` wires everything.
- Hooks encapsulate behavior and expose functions/state interfaces.
- Components render UI from props only.

## Hook Contracts

### `useViewerDataLoader`
- File: `hooks/useViewerDataLoader.js`
- Purpose: load DICOM/NIfTI, initialize rendering engine/tool groups, setup viewports, cleanup.
- Inputs: refs, setters, utility functions, and `rebuildCornerstoneNiftiViewports` callback.
- Outputs: none (side-effect hook).

### `useCornerstoneNiftiControls`
- File: `hooks/useCornerstoneNiftiControls.js`
- Purpose: Cornerstone NIfTI tool control + viewport control.
- Returns:
  - `activateCornerstoneNiftiTool`
  - `scrollCornerstoneNifti`
  - `applyNiftiColormapToSlot`
  - `handleCornerstoneNiftiWheel`
  - `rotateCornerstoneNifti`
  - `deleteLastLengthOnNiftiSlot`
  - `rebuildCornerstoneNiftiViewports`
  - `isScopedToolActive`

### `useCornerstoneAnnotations`
- File: `hooks/useCornerstoneAnnotations.js`
- Purpose: annotation tool switching, save dialog, metadata/note lifecycle, jump/delete.

### `useNiftiCanvasInteractions`
- File: `hooks/useNiftiCanvasInteractions.js`
- Purpose: non-Cornerstone canvas interaction handlers (mouse drag/pan/measure/wheel/context-menu).

### `useNiftiCanvasRenderer`
- File: `hooks/useNiftiCanvasRenderer.js`
- Purpose: non-Cornerstone canvas drawing effect (slices + overlays + annotations + measures).

### `useNiftiPlayback`
- File: `hooks/useNiftiPlayback.js`
- Purpose: playback timer for slice progression.

### `useCornerstonePromptBlock`
- File: `hooks/useCornerstonePromptBlock.js`
- Purpose: temporarily override/restore browser prompt for Cornerstone annotation flow.

### `useViewerReportChat`
- File: `hooks/useViewerReportChat.js`
- Purpose: chat/onix handlers + report editor commands + print/download actions.

## Component Contracts

### `components/ViewerHeader.jsx`
- Top bar only.
- Must stay stateless; receives action callbacks from page.

### `components/NiftiToolbar.jsx`
- Toolbar UI only.
- No direct image processing.

### `components/CornerstoneNiftiGrid.jsx`
- Cornerstone viewport containers and UI bindings.

### `components/NiftiCanvasGrid.jsx`
- Non-Cornerstone canvas containers and event binding.

### `components/ViewerSidePanel.jsx`
- Tabs (metadata/chat/annotations/onix/report UI).
- Uses page-provided handlers; no internal domain logic.

## Service Contracts

### `services/reportService.js`
- Export report HTML.
- Print report.
- Download report PDF.

## Utils Contracts

### `utils/constants.js`
- Static profiles/config (backend URL, colormap presets, etc.).

### `utils/viewerUtils.js`
- Pure helpers for geometry, image processing, URL/date formatting, sorting.

## Change Rules (Important)

- If logic uses `useEffect` + state transitions, prefer `hooks/`.
- If logic touches external APIs/report generation, prefer `services/`.
- If logic is pure and reusable, prefer `utils/`.
- Keep components dumb: props in, JSX out.
- Keep `Dicomviewer.jsx` as orchestrator only (wiring + composition).

## Next Suggested Splits

- Move remaining fullscreen + Cornerstone annotation event bridge effects from `Dicomviewer.jsx` into dedicated hooks.
- Optionally add `state/` slice modules if shared state starts crossing hook boundaries.
