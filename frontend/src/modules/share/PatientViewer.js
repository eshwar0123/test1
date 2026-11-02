import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import * as csCore from "@cornerstonejs/core";
import { initCornerstoneOnce } from "../radiologist/pages/DicomViewer/hooks/useCornerstoneInit";
import { buildImageId } from "../radiologist/pages/DicomViewer/utils/viewerUtils";

// Public, read-only patient image viewer at /view/:token.
// Images only: no report, AI, chat, annotation tools or download buttons.
// The patient must enter the link's password (given by the centre) before any
// image is returned. The server re-checks expiry + password on every request and
// answers 410 once the link has expired; image URLs are short-lived presigned URLs
// that this page re-requests (with the same password, kept in memory only) before
// they lapse.

const ENGINE_ID = "patient-view-engine";
const VIEWPORT_ID = "patient-view-vp";
const PX_PER_SLICE = 14; // touch / mouse drag distance per slice

const shell = {
  minHeight: "100vh", background: "#05080f", color: "#e2e8f0", display: "flex", flexDirection: "column",
  fontFamily: "Inter, Arial, sans-serif",
};

function PasswordForm({ onSubmit, error, busy, locked }) {
  const [value, setValue] = useState("");
  return (
    <div style={{ ...shell, alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
      <img src="/logo1.png" alt="" style={{ width: 120, marginBottom: 28, opacity: 0.9 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Enter your password</div>
      <div style={{ color: "#94a3b8", maxWidth: 360, marginBottom: 18 }}>
        Your scan images are protected. Type the password the centre gave you to view them.
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (value.trim() && !busy && !locked) onSubmit(value.trim()); }}
        style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 300 }}
      >
        <input
          type="text" value={value} autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="Password" disabled={locked}
          style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#fff", fontSize: 20, letterSpacing: 4, textAlign: "center", fontFamily: "monospace" }}
        />
        <button
          type="submit" disabled={busy || locked || !value.trim()}
          style={{ padding: "11px 14px", borderRadius: 10, border: "none", background: locked ? "#334155" : "#2563eb", color: "#fff", fontWeight: 700, fontSize: 15, cursor: busy || locked ? "not-allowed" : "pointer" }}
        >
          {busy ? "Checking…" : "View images"}
        </button>
        {error && <div style={{ color: "#fca5a5", fontSize: 13 }}>{error}</div>}
      </form>
    </div>
  );
}

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
  const [state, setState] = useState("loading"); // loading | password | ready | expired | notfound | error
  const [pwError, setPwError] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const passwordRef = useRef("");
  const [data, setData] = useState(null);
  const [activeUid, setActiveUid] = useState(null);
  const [idx, setIdx] = useState(0);
  const [viewerError, setViewerError] = useState("");

  const elRef = useRef(null);
  const engineRef = useRef(null);
  const vpRef = useRef(null);
  const idxRef = useRef(0);
  const uidRef = useRef(null);

  // POST with the password; null means "not usable" (state already updated).
  const fetchLinkData = useCallback(async (password) => {
    const r = await fetch(`/api/share/patient/${encodeURIComponent(token)}`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (r.status === 410) { setState("expired"); return null; }
    if (r.status === 404) { setState("notfound"); return null; }
    if (r.status === 403 || r.status === 429) {
      const j = await r.json().catch(() => null);
      setPwError(j?.detail || "Incorrect password.");
      if (r.status === 429) setLocked(true);
      setState("password");
      return null;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }, [token]);

  // Is the link alive? (no password needed to learn it expired / doesn't exist)
  useEffect(() => {
    let alive = true;
    fetch(`/api/share/patient/${encodeURIComponent(token)}/status`, { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 410) return setState("expired");
        if (r.status === 404) return setState("notfound");
        if (!r.ok) return setState("error");
        const j = await r.json().catch(() => ({}));
        if (j?.locked) { setLocked(true); setPwError("Too many wrong attempts. Please ask the centre for a new link."); }
        setState("password");
      })
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [token]);

  const submitPassword = useCallback(async (password) => {
    setPwBusy(true);
    setPwError("");
    try {
      const j = await fetchLinkData(password);
      if (!j) return;
      passwordRef.current = password;
      setData(j);
      const firstSeries = j.series.find((s) => !s.isScout) || j.series[0];
      setActiveUid(firstSeries.seriesUid);
      setState("ready");
    } catch {
      setPwError("Could not check the password. Please try again.");
    } finally {
      setPwBusy(false);
    }
  }, [fetchLinkData]);

  // After unlocking: refresh the presigned image URLs before they lapse.
  useEffect(() => {
    if (state !== "ready") return undefined;
    let alive = true;
    let timer = null;
    const schedule = (ttl) => {
      timer = setTimeout(async () => {
        try {
          const j = await fetchLinkData(passwordRef.current);
          if (!alive || !j) return;
          setData(j);
          schedule(Number(j.image_url_ttl_seconds) || 900);
        } catch {
          if (alive) schedule(30);
        }
      }, Math.max(60, ttl - 120) * 1000);
    };
    schedule(Number(data?.image_url_ttl_seconds) || 900);
    return () => { alive = false; clearTimeout(timer); };
  }, [state, fetchLinkData]); // eslint-disable-line react-hooks/exhaustive-deps

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
  if (state === "password") return <PasswordForm onSubmit={submitPassword} error={pwError} busy={pwBusy} locked={locked} />;
  if (state === "expired") return <Message title="This link has expired" text="Please contact the centre that shared it with you." />;
  if (state === "notfound") return <Message title="Link not found" text="Check that you opened the complete link." />;
  if (state === "error") return <Message title="Could not load the images" text="Please check your connection and reload the page." />;

  // Name / age / sex (top-left) and modality / study type (top-right), burned over the image.
  const pt = data?.patient || {};
  const overlayText = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12, lineHeight: 1.7, textShadow: "0 1px 4px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.9)", pointerEvents: "none" };
  const patientOverlay = (pt.name || pt.age || pt.sex || pt.modality || pt.study_type) ? (
    <>
      <div style={{ position: "absolute", top: 10, left: 12, zIndex: 5, display: "flex", flexDirection: "column", ...overlayText }}>
        {pt.name && <span style={{ color: "#f1f5f9", fontWeight: 700 }}>Patient Name: {pt.name}</span>}
        {pt.age && <span style={{ color: "#9ca3af" }}>Age: <span style={{ color: "#e5e7eb" }}>{/[a-z]$/i.test(pt.age) ? pt.age.toUpperCase() : `${pt.age}Y`}</span></span>}
        {pt.sex && <span style={{ color: "#9ca3af" }}>Sex: <span style={{ color: "#e5e7eb" }}>{pt.sex}</span></span>}
      </div>
      <div style={{ position: "absolute", top: 10, right: 12, zIndex: 5, display: "flex", flexDirection: "column", alignItems: "flex-end", textAlign: "right", maxWidth: "45%", ...overlayText }}>
        {pt.modality && <span style={{ color: "#e5e7eb", fontWeight: 700 }}>{pt.modality}</span>}
        {pt.study_type && <span style={{ color: "#cbd5e1" }}>{pt.study_type}</span>}
      </div>
    </>
  ) : null;

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
        {patientOverlay}
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
