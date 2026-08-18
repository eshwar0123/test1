import { useEffect, useRef, useState } from 'react';

const COLORS = ['#7dEBe1', '#7dEBe1', '#67e8f9', '#a78bfa'];
const STATUSES = [
  'Analyzing request',
  'Reading current findings',
  'Applying instruction',
  'Generating revisions',
  'Finalizing structure',
];

export default function ReportRewriteOverlay({
  phase,                // 'idle' | 'thinking' | 'revealing' | 'done'
  instruction,
  onRevealComplete,
}) {
  const layerRef = useRef(null);
  const animKey = useRef(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const [statusOn, setStatusOn] = useState(true);
  const [morphed, setMorphed] = useState(false);
  const [coreTop, setCoreTop] = useState('42%');
  const [lit, setLit] = useState(false);

  const spawnParticle = (opts = {}) => {
    const layer = layerRef.current;
    if (!layer) return;
    const p = document.createElement('div');
    const size = opts.size ?? (1.5 + Math.random() * 2.5);
    const color = opts.color ?? COLORS[Math.floor(Math.random() * COLORS.length)];
    Object.assign(p.style, {
      position: 'absolute', borderRadius: '50%', pointerEvents: 'none',
      width: `${size}px`, height: `${size}px`, background: color,
      boxShadow: `0 0 ${size * 3}px ${color}`,
      left: `${opts.x ?? Math.random() * 100}%`,
      top: `${opts.y ?? 100 + Math.random() * 5}%`,
      opacity: '0', willChange: 'transform, opacity',
    });
    layer.appendChild(p);
    const dy = opts.dy ?? -(180 + Math.random() * 220);
    const dx = opts.dx ?? (Math.random() - 0.5) * 60;
    const dur = opts.dur ?? (2800 + Math.random() * 2200);
    const peak = opts.peak ?? (0.55 + Math.random() * 0.4);
    requestAnimationFrame(() => {
      p.style.transition = `transform ${dur}ms linear, opacity ${dur * 0.4}ms ease-out`;
      p.style.transform = `translate(${dx}px, ${dy}px)`;
      p.style.opacity = String(peak);
    });
    setTimeout(() => {
      p.style.transition = `opacity ${dur * 0.5}ms ease-in`;
      p.style.opacity = '0';
    }, dur * 0.45);
    setTimeout(() => p.remove(), dur);
  };

  const spawnRing = () => {
    const layer = layerRef.current;
    if (!layer) return;
    const r = document.createElement('div');
    Object.assign(r.style, {
      position: 'absolute', left: '50%', top: '42%',
      width: '32px', height: '32px',
      border: '1px solid rgba(125,235,225,0.55)', borderRadius: '50%',
      pointerEvents: 'none', transform: 'translate(-50%, -50%) scale(0)',
    });
    layer.appendChild(r);
    requestAnimationFrame(() => {
      r.style.transition = 'transform 2400ms ease-out, opacity 2400ms ease-out, border-color 2400ms ease-out';
      r.style.transform = 'translate(-50%, -50%) scale(6)';
      r.style.opacity = '0';
      r.style.borderColor = 'rgba(125,235,225,0)';
    });
    setTimeout(() => r.remove(), 2500);
  };

  const spawnCluster = (yPct) => {
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      spawnParticle({
        x: 15 + Math.random() * 70,
        y: yPct + (Math.random() - 0.5) * 8,
        size: 2 + Math.random() * 2.5,
        dy: -(60 + Math.random() * 100),
        dx: (Math.random() - 0.5) * 40,
        dur: 1600 + Math.random() * 1200, peak: 0.85,
        color: Math.random() < 0.7 ? '#7dEBe1' : '#ffffff',
      });
    }
  };

  // Phase: thinking
  useEffect(() => {
    if (phase !== 'thinking') return;
    setLit(false); setMorphed(false); setCoreTop('42%');
    setStatusIdx(0); setStatusOn(true);
    const ambient = setInterval(() => {
      if (Math.random() < 0.85) spawnParticle();
      if (Math.random() < 0.3) spawnParticle({ size: 1, peak: 0.3, dur: 4000 });
    }, 70);
    const rings = setInterval(spawnRing, 750);
    spawnRing();
    const statusRot = setInterval(() => {
      setStatusOn(false);
      setTimeout(() => {
        setStatusIdx((i) => (i + 1) % STATUSES.length);
        setStatusOn(true);
      }, 350);
    }, 1100);
    return () => { clearInterval(ambient); clearInterval(rings); clearInterval(statusRot); };
  }, [phase]);

  // Phase: revealing
  useEffect(() => {
    if (phase !== 'revealing') return;
    const key = ++animKey.current;
    setStatusOn(false); setMorphed(true);
    const ambient = setInterval(() => { if (Math.random() < 0.5) spawnParticle(); }, 90);
    let cluster = null;
    const morphDelay = setTimeout(() => {
      if (key !== animKey.current) return;

      // Snap the beam to the very top (no transition), then descend to past
      // the bottom — so it traverses the full editor height.
      const coreEl = layerRef.current?.parentElement?.querySelector('.rrwo-core');
      if (coreEl) {
        coreEl.style.transition = 'none';
        coreEl.style.top = '0%';
        // Force reflow so the next style change re-applies the CSS transition
        void coreEl.offsetHeight;
        coreEl.style.transition = '';
      }
      setCoreTop('0%');

      // After one paint, kick off the descent (full-height: 0% → 105%)
      requestAnimationFrame(() => {
        if (key !== animKey.current) return;
        setCoreTop('105%');
      });

      const start = Date.now();
      const dur = 4000;
      cluster = setInterval(() => {
        const t = Math.min(1, (Date.now() - start) / dur);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const yPct = 0 + eased * 105;          // full traversal: top → bottom
        if (yPct > 0 && yPct < 100) spawnCluster(yPct);
      }, 55);
      setTimeout(() => {
        if (key !== animKey.current) return;
        clearInterval(cluster); clearInterval(ambient);
        setLit(true);
        onRevealComplete?.();
      }, dur + 100);
    }, 500);
    return () => { clearTimeout(morphDelay); if (cluster) clearInterval(cluster); clearInterval(ambient); };
  }, [phase, onRevealComplete]);

  if (phase === 'idle' || phase === 'done') return null;

  return (
    <div className={`rrwo ${morphed ? 'rrwo-revealing' : ''} ${lit ? 'rrwo-lit' : ''}`}>
      <style>{styles}</style>
      <div className="rrwo-banner">
        <span className="rrwo-dot" /> Rewriting
        {instruction && <span className="rrwo-echo">"{instruction}"</span>}
      </div>
      <div className="rrwo-stage">
        <div ref={layerRef} className="rrwo-layer" />
        <div className={`rrwo-core ${morphed ? 'rrwo-morph' : ''}`} style={{ top: coreTop }} />
        {!morphed && (
          <div className={`rrwo-status ${statusOn ? '' : 'rrwo-fade'}`}>
            {STATUSES[statusIdx]}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = `
.rrwo { position: absolute; inset: 0; z-index: 50; display: flex; flex-direction: column; pointer-events: none; }
.rrwo-banner { display: flex; align-items: center; gap: 8px; height: 26px; padding: 0 14px; font-size: 11px; font-weight: 500; color: rgba(160,250,240,0.95); background: rgba(5,9,18,0.95); border-bottom: 0.5px solid rgba(125,235,225,0.15); }
.rrwo-banner .rrwo-echo { color: rgba(255,255,255,0.55); font-style: italic; font-weight: 400; margin-left: 4px; }
.rrwo-dot { width: 6px; height: 6px; border-radius: 50%; background: #7dEBe1; box-shadow: 0 0 8px #7dEBe1; animation: rrwoPls 1.2s ease-in-out infinite; }
@keyframes rrwoPls { 0%,100% { opacity: 0.5; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
.rrwo-stage { position: relative; flex: 1; overflow: hidden; background: #050912; transition: background 600ms ease, opacity 600ms ease; }
/* During reveal: keep the beam + particles visible, but drop the dark
   background so the (already-updated) report shows through. */
.rrwo-revealing .rrwo-stage { background: transparent; }
.rrwo-lit .rrwo-stage { background: transparent; opacity: 0; pointer-events: none; }
.rrwo-lit .rrwo-banner { opacity: 0; transition: opacity 600ms ease; }
.rrwo-layer { position: absolute; inset: 0; pointer-events: none; }
.rrwo-core { position: absolute; left: 50%; width: 16px; height: 16px; border-radius: 50%; background: #7dEBe1; box-shadow: 0 0 28px #7dEBe1, 0 0 56px rgba(125,235,225,0.55); transform: translate(-50%, -50%); z-index: 4; transition: opacity 400ms ease, width 500ms cubic-bezier(0.4,0,0.2,1), height 500ms cubic-bezier(0.4,0,0.2,1), border-radius 500ms ease, top 4000ms cubic-bezier(0.4,0.05,0.55,0.95); animation: rrwoCp 2.4s ease-in-out infinite; }
@keyframes rrwoCp { 0%,100% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-50%,-50%) scale(1.35); } }
.rrwo-core.rrwo-morph { animation: none; transform: translate(-50%,-50%); width: 110%; height: 1px; border-radius: 0; box-shadow: 0 0 18px #7dEBe1, 0 0 36px rgba(125,235,225,0.6); }
.rrwo-status { position: absolute; left: 50%; top: 64%; transform: translateX(-50%); font-size: 11px; color: rgba(160,250,240,0.9); white-space: nowrap; z-index: 4; transition: opacity 350ms ease; }
.rrwo-status.rrwo-fade { opacity: 0; }
`;
