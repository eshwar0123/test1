import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import * as csCore from "@cornerstonejs/core";
import { initCornerstoneOnce } from "../radiologist/pages/DicomViewer/hooks/useCornerstoneInit";
import { buildImageId } from "../radiologist/pages/DicomViewer/utils/viewerUtils";

// Public, read-only patient image viewer at /view/:token.
// Images only: no report, AI, chat, annotation tools or download buttons.
// The server re-checks the link's expiry on every request and answers 410 once
// it has passed; image URLs are short-lived presigned URLs that this page
// re-requests before they lapse.

const ENGINE_ID = "patient-view-engine";
const VIEWPORT_ID = "patient-view-vp";
const PX_PER_SLICE = 14; // touch / mouse drag distance per slice

const shell = {
  minHeight: "100vh", background: "#05080f", color: "#e2e8f0", display: "flex", flexDirection: "column",
  fontFamily: "Inter, Arial, sans-serif",
};

function Message({ title, text }) {
  return (
    <div style={{ ...shell, alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
      <img src="/logo1.png" alt="" style={{ width: 120, marginBottom: 28, opacity: 0.9 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{title}</div>
      {text && <div style={{ color: "#94a3b8", maxWidth: 360 }}>{text}</div>}
    </div>
  );
}

export default function PatientViewer() {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // loading | ready | expired | notfound | error
  const [data, setData] = useState(null);
  const [activeUid, setActiveUid] = useState(null);
  const [idx, setIdx] = useState(0);
  const [viewerError, setViewerError] = useState("");

  const elRef = useRef(null);
  const engineRef = useRef(null);
  const vpRef = useRef(null);
  const idxRef = useRef(0);
  const uidRef = useRef(null);

  const fetchLinkData = useCallback(async () => {
    const r = await fetch(`/api/share/patient/${encodeURIComponent(token)}`, { cache: "no-store" });
    if (r.status === 410) { setState("expired"); return null; }
    if (r.status === 404) { setState("notfound"); return null; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }, [token]);

  // Initial load + refresh before the presigned image URLs lapse.
  useEffect(() => {
    let alive = true;
    let timer = null;
    const run = async (first) => {
      try {
        const j = await fetchLinkData();
        if (!alive || !j) return;
        setData(j);
        if (first) {
          const firstSeries = j.series.find((s) => !s.isScout) || j.series[0];
          setActiveUid(firstSeries.seriesUid);
          setState("ready");
        }
        const ttl = Number(j.image_url_ttl_seconds) || 900;
        timer = setTimeout(() => run(false), Math.max(60, ttl - 120) * 1000);
      } catch {
        if (!alive) return;
        if (first) setState("error");
        else timer = setTimeout(() => run(false), 30000);
      }
    };
    run(true);
    return () => { alive = false; clearTimeout(timer); };
  }, [fetchLinkData]);

  const series = data?.series || [];
  const active = series.find((s) => s.seriesUid === activeUid) || series[0];

  // Create the viewport once the container exists.
  useEffect(() => {
    if (state !== "ready" || !elRef.current) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await initCornerstoneOnce();
        if (cancelled || !elRef.current) return;
        const engine = new csCore.RenderingEngine(ENGINE_ID);
        engine.setViewports([{
          viewportId: VIEWPORT_ID, type: csCore.Enums.ViewportType.STACK, element: elRef.current,
          defaultOptions: { background: [0, 0, 0] },
        }]);
        engineRef.current = engine;
        vpRef.current = engine.getViewport(VIEWPORT_ID);
        setViewerError("");
        setData((d) => (d ? { ...d } : d)); // trigger the stack effect now that the viewport exists
      } catch (e) {
        if (!cancelled) setViewerError("Could not start the image viewer");
      }
    })();
    const onResize = () => { try { engineRef.current?.resize(true, false); } catch { /* ignore */ } };
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      try { engineRef.current?.destroy(); } catch { /* ignore */ }
      engineRef.current = null;
      vpRef.current = null;
    };
  }, [state]);

  // (Re)load the stack when the series changes or fresh URLs arrive.
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp || !active?.urls?.length) return;
    if (uidRef.current !== active.seriesUid) {
      uidRef.current = active.seriesUid;
      idxRef.current = Math.floor(active.urls.length / 2);
    }
    const start = Math.min(idxRef.current, active.urls.length - 1);
    vp.setStack(active.urls.map(buildImageId), start)
      .then(() => { vp.render(); setIdx(start); setViewerError(""); })
      .catch(() => setViewerError("Some images could not be loaded. Reload the page to try again."));
  }, [data, active?.seriesUid, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = useCallback((delta) => {
    const vp = vpRef.current;
    if (!vp || !active) return;
    const next = Math.max(0, Math.min(active.urls.length - 1, (vp.getCurrentImageIdIndex?.() ?? idxRef.current) + delta));
    if (next === idxRef.current) return;
    idxRef.current = next;
    vp.setImageIdIndex(next).then(() => setIdx(next)).catch(() => {});
  }, [active]);

  // Wheel, keyboard and touch/drag scrolling.
  useEffect(() => {
    const el = elRef.current;
    if (state !== "ready" || !el) return undefined;
    const onWheel = (e) => { e.preventDefault(); step(e.deltaY > 0 ? 1 : -1); };
    const onKey = (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") step(-1);
    };
    let lastY = null;
    let acc = 0;
    const onDown = (e) => { lastY = e.clientY; acc = 0; el.setPointerCapture?.(e.pointerId); };
    const onMove = (e) => {
      if (lastY == null) return;
      acc += e.clientY - lastY;
      lastY = e.clientY;
      while (Math.abs(acc) >= PX_PER_SLICE) {
        step(acc > 0 ? 1 : -1);
        acc -= Math.sign(acc) * PX_PER_SLICE;
      }
    };
    const onUp = () => { lastY = null; };
    const stop = (e) => e.preventDefault();
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("contextmenu", stop);
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("contextmenu", stop);
      window.removeEventListener("keydown", onKey);
    };
  }, [state, step]);

  if (state === "loading") return <Message title="Loading your images…" />;
  if (state === "expired") return <Message title="This link has expired" text="Please contact the centre that shared it with you." />;
  if (state === "notfound") return <Message title="Link not found" text="Check that you opened the complete link." />;
  if (state === "error") return <Message title="Could not load the images" text="Please check your connection and reload the page." />;

  const total = active?.urls.length || 0;
  const expiry = data?.expires_at ? new Date(data.expires_at) : null;

  return (
    <div style={{ ...shell, height: "100vh" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#0b1220", borderBottom: "1px solid #1e293b" }}>
        <img src="/logo1.png" alt="Onix AI" style={{ height: 28 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>
          {expiry ? `Available until ${expiry.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : ""}
        </span>
      </header>

      {series.length > 1 && (
        <div style={{ display: "flex", gap: 8, padding: "8px 16px", overflowX: "auto", background: "#0b1220" }}>
          {series.map((s, i) => (
            <button
              key={s.seriesUid || i}
              onClick={() => setActiveUid(s.seriesUid)}
              style={{
                flex: "0 0 auto", padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                border: `1px solid ${s.seriesUid === active?.seriesUid ? "#3b82f6" : "#334155"}`,
                background: s.seriesUid === active?.seriesUid ? "rgba(59,130,246,0.2)" : "transparent", color: "#e2e8f0",
              }}
            >
              {s.description || `Series ${i + 1}`} · {s.urls.length}
            </button>
          ))}
        </div>
      )}

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <div ref={elRef} style={{ position: "absolute", inset: 0, touchAction: "none", cursor: "ns-resize" }} />
        <div style={{ position: "absolute", left: 12, bottom: 10, fontSize: 12, color: "#cbd5e1", pointerEvents: "none", textShadow: "0 1px 2px #000" }}>
          {total > 0 ? `Image ${Math.min(idx + 1, total)} / ${total}` : ""}
        </div>
        {viewerError && (
          <div style={{ position: "absolute", top: 12, left: 12, right: 12, padding: "8px 12px", borderRadius: 8, background: "#7f1d1d", color: "#fecaca", fontSize: 13 }}>
            {viewerError}
          </div>
        )}
      </div>
    </div>
  );
}
