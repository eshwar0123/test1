// WorldSyncStore.js
//
// Module-level singleton for the global world-coordinate synchronization state.
//
// Every viewport that participates in sync reads from and writes to this store.
// The world point is a patient-space (LPS) coordinate — the same anatomical
// location across every linked series and every orientation.
//
// No React state or context: updates propagate synchronously so that scroll and
// crosshair events never lag behind a React render cycle.
//
// SYNC MODES
//   "off"        — no synchronization of any kind
//   "position"   — scroll in one viewport → all others jump to same anatomy
//   "crosshair"  — click/drag crosshair → reslice; scroll does NOT propagate
//   "full"       — position + crosshair + zoom + pan + WL (all sync)

let _worldPoint = null;      // [x, y, z] LPS patient space, or null
let _syncMode   = "full";    // "off" | "position" | "crosshair" | "full"

const _positionListeners  = new Set();  // called when worldPoint changes
const _wlListeners        = new Set();  // called when W/L syncs (full mode)
const _zoomPanListeners   = new Set();  // called when zoom/pan syncs (full mode)

// ─── world point ─────────────────────────────────────────────────────────────

export function setWorldPoint(pt, source = null) {
  _worldPoint = pt ? [pt[0], pt[1], pt[2]] : null;
  _positionListeners.forEach(fn => {
    try { fn(_worldPoint, source); } catch {}
  });
}

export function getWorldPoint() {
  return _worldPoint;
}

export function subscribePosition(fn) {
  _positionListeners.add(fn);
  return () => _positionListeners.delete(fn);
}

// ─── W/L sync ────────────────────────────────────────────────────────────────

export function broadcastWL(voiRange, source = null) {
  if (_syncMode !== "full") return;
  _wlListeners.forEach(fn => {
    try { fn(voiRange, source); } catch {}
  });
}

export function subscribeWL(fn) {
  _wlListeners.add(fn);
  return () => _wlListeners.delete(fn);
}

// ─── zoom / pan sync ─────────────────────────────────────────────────────────

export function broadcastZoomPan(camera, source = null) {
  if (_syncMode !== "full") return;
  _zoomPanListeners.forEach(fn => {
    try { fn(camera, source); } catch {}
  });
}

export function subscribeZoomPan(fn) {
  _zoomPanListeners.add(fn);
  return () => _zoomPanListeners.delete(fn);
}

// ─── sync mode ───────────────────────────────────────────────────────────────

export function setSyncMode(mode) {
  _syncMode = mode;
}

export function getSyncMode() {
  return _syncMode;
}

// ─── utility ─────────────────────────────────────────────────────────────────

export function reset() {
  _worldPoint = null;
}

export function isPositionSyncActive() {
  return _syncMode === "position" || _syncMode === "full";
}

export function isCrosshairSyncActive() {
  return _syncMode === "crosshair" || _syncMode === "full";
}
