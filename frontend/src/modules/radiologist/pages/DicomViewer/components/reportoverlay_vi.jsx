import { useEffect, useRef, useState } from 'react';

const COLORS = ['#7dEBe1', '#7dEBe1', '#67e8f9', '#a78bfa'];
const STATUSES = [
  'Analyzing request',
  'Reading current findings',
  'Applying instruction',
  'Generating revisions',
  'Finalizing report',
];

export default function ReportRewriteOverlay({
  phase,
  instruction,
  onRevealComplete,
  onStop,
}) {
  const layerRef = useRef(null);
  const animKey = useRef(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const [statusOn, setStatusOn] = useState(true);
  const [morphed, setMorphed] = useState(false);
  const [coreTop, setCoreTop] = useState('50%');
  const [coreBot, setCoreBot] = useState('50%');
  const [lit, setLit] = useState(false);
  const [maskClipped, setMaskClipped] = useState(false);

  const spawnParticle = (opts = {}) => {
    const layer = layerRef.current;
    if (!layer) return;
    
    const p = document.createElement('div');
    const size = opts.size ?? (0.8 + Math.random() * 1.8);
    const color = opts.color ?? COLORS[Math.floor(Math.random() * COLORS.length)];
    
    Object.assign(p.style, {
      position: 'absolute',
      borderRadius: '50%',
      pointerEvents: 'none',
      width: `${size}px`,
      height: `${size}px`,
      background: color,
      boxShadow: `0 0 ${size * 2.5}px ${color}`,
      left: `${opts.x ?? Math.random() * 100}%`,
      top: `${opts.y ?? Math.random() * 100}%`,
      opacity: '0',
      willChange: 'transform, opacity',
      zIndex: 2,
    });
    
    layer.appendChild(p);
    
    const dy = opts.dy ?? -(80 + Math.random() * 140);
    const dx = opts.dx ?? (Math.random() - 0.5) * 60;
    const dur = opts.dur ?? (2200 + Math.random() * 1800);
    const peak = opts.peak ?? (0.45 + Math.random() * 0.35);
    
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
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: '18px',
      height: '18px',
      border: '0.5px solid rgba(125,235,225,0.4)',
      borderRadius: '50%',
      pointerEvents: 'none',
      transform: 'translate(-50%, -50%) scale(0)',
      zIndex: 1,
    });
    
    layer.appendChild(r);
    
    requestAnimationFrame(() => {
      r.style.transition = 'transform 1600ms ease-out, opacity 1600ms ease-out, border-color 1600ms ease-out';
      r.style.transform = 'translate(-50%, -50%) scale(5)';
      r.style.opacity = '0';
      r.style.borderColor = 'rgba(125,235,225,0)';
    });
    
    setTimeout(() => r.remove(), 1700);
  };

  const spawnCluster = (yPct) => {
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      spawnParticle({
        x: 20 + Math.random() * 60,
        y: yPct + (Math.random() - 0.5) * 5,
        size: 1 + Math.random() * 1.4,
        dy: -(50 + Math.random() * 80),
        dx: (Math.random() - 0.5) * 40,
        dur: 1100 + Math.random() * 900,
        peak: 0.75,
        color: Math.random() < 0.7 ? '#7dEBe1' : '#ffffff',
      });
    }
  };

  useEffect(() => {
    if (phase !== 'thinking') return;
    
    setLit(false);
    setMorphed(false);
    setCoreTop('50%');
    setCoreBot('50%');
    setStatusIdx(0);
    setStatusOn(true);
    setMaskClipped(false);

    const ambient = setInterval(() => {
      if (Math.random() < 0.9) spawnParticle();
      if (Math.random() < 0.35) spawnParticle({ size: 0.6, peak: 0.2, dur: 3500 });
    }, 60);

    const rings = setInterval(spawnRing, 800);
    spawnRing();

    const statusRot = setInterval(() => {
      setStatusOn(false);
      setTimeout(() => {
        setStatusIdx((i) => Math.min(i + 1, STATUSES.length - 1));
        setStatusOn(true);
      }, 200);
    }, 850);

    return () => {
      clearInterval(ambient);
      clearInterval(rings);
      clearInterval(statusRot);
    };
  }, [phase]);

  // Cleanup when phase becomes idle (stop button clicked)
  useEffect(() => {
    if (phase === 'idle') {
      setMorphed(false);
      setLit(false);
      setCoreTop('50%');
      setCoreBot('50%');
      setStatusIdx(0);
      setStatusOn(true);
      setMaskClipped(false);
      
      // Clear all particles from DOM
      const layer = layerRef.current;
      if (layer) {
        layer.innerHTML = '';
      }
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'revealing') return;
    
    const key = ++animKey.current;
    setStatusOn(false);
    setMorphed(true);

    const ambient = setInterval(() => {
      if (Math.random() < 0.5) spawnParticle();
    }, 100);

    let cluster = null;
    
    const morphDelay = setTimeout(() => {
      if (key !== animKey.current) return;

      const stage = layerRef.current?.parentElement;
      if (stage) {
        const tops = stage.querySelectorAll('.rrwo-fixed-core');
        tops.forEach((el) => {
          el.style.transition = 'none';
          el.style.top = '50%';
          void el.offsetHeight;
          el.style.transition = '';
        });
      }

      setCoreTop('50%');
      setCoreBot('50%');

      requestAnimationFrame(() => {
        if (key !== animKey.current) return;
        setCoreTop('-5%');
        setCoreBot('105%');
        setMaskClipped(true);
      });

      const start = Date.now();
      const dur = 2800;
      
      cluster = setInterval(() => {
        const t = Math.min(1, (Date.now() - start) / dur);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const yUp = 50 - eased * 55;
        const yDown = 50 + eased * 55;
        if (yUp > 0 && yUp < 100) spawnCluster(yUp);
        if (yDown > 0 && yDown < 100) spawnCluster(yDown);
      }, 65);

      setTimeout(() => {
        if (key !== animKey.current) return;
        clearInterval(cluster);
        clearInterval(ambient);
        setLit(true);
        onRevealComplete?.();
      }, dur + 100);
    }, 250);

    return () => {
      clearTimeout(morphDelay);
      if (cluster) clearInterval(cluster);
      clearInterval(ambient);
    };
  }, [phase, onRevealComplete]);

  const styles = `
.rrwo-inline-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  gap: 0;
}

.rrwo-inline {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 80px;
  padding: 12px;
  border-radius: 0 0 8px 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  z-index: 10;
  border: 1px solid rgba(96,165,250,0.3);
  border-top: none;
  background: #000000;
}

.rrwo-inline-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 5;
  background: #000000;
}

.rrwo-inline-stage-mask-top,
.rrwo-inline-stage-mask-bottom {
  position: absolute;
  inset: 0;
  background: #111111;
  z-index: 1;
  pointer-events: none;
}

.rrwo-inline-stage-mask-top {
  clip-path: inset(0 0 calc(50% - 1px) 0);
  -webkit-clip-path: inset(0 0 calc(50% - 1px) 0);
}

.rrwo-inline-stage-mask-top.rrwo-inline-mask-clipped {
  clip-path: inset(0 0 100% 0);
  -webkit-clip-path: inset(0 0 100% 0);
  transition: clip-path 2800ms cubic-bezier(0.4,0.05,0.55,0.95),
              -webkit-clip-path 2800ms cubic-bezier(0.4,0.05,0.55,0.95);
}

.rrwo-inline-stage-mask-bottom {
  clip-path: inset(calc(50% - 1px) 0 0 0);
  -webkit-clip-path: inset(calc(50% - 1px) 0 0 0);
}

.rrwo-inline-stage-mask-bottom.rrwo-inline-mask-clipped {
  clip-path: inset(100% 0 0 0);
  -webkit-clip-path: inset(100% 0 0 0);
  transition: clip-path 2800ms cubic-bezier(0.4,0.05,0.55,0.95),
              -webkit-clip-path 2800ms cubic-bezier(0.4,0.05,0.55,0.95);
}

.rrwo-inline-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}

.rrwo-inline-core {
  position: absolute;
  left: 50%;
  top: 25%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #7dEBe1;
  box-shadow: 0 0 20px #7dEBe1;
  transform: translateX(-50%);
  z-index: 3;
}

.rrwo-inline-core.rrwo-inline-morph {
  background: #7dEBe1;
  width: 30%;
  height: 4px;
  border-radius: 2px;
  top: 50% !important;
  left: 50% !important;
  transform: translateX(-50%) translateY(-50%);
  box-shadow: none;
  animation: rrwo-inline-beam-glow 2000ms cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

.rrwo-inline-core-bottom {
  top: auto !important;
}

@keyframes rrwo-inline-beam-glow {
  0%   { background: #7dEBe1; }
  50%  { background: #67e8f9; }
  100% { background: #7dEBe1; }
}

.rrwo-inline-status {
  position: absolute;
  left: 50%;
  bottom: 8px;
  transform: translateX(-50%);
  font-size: 12px;
  color: rgba(160,250,240,0.85);
  white-space: nowrap;
  z-index: 6;
  transition: opacity 200ms ease;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  pointer-events: none;
}

.rrwo-inline-status.rrwo-inline-fade {
  opacity: 0;
}

.rrwo-inline-instruction {
  display: none;
}

.rrwo-inline-stop {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  background: rgba(125,235,225,0.08);
  border: 1px solid rgba(125,235,225,0.25);
  color: rgba(125,235,225,0.75);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 150ms ease;
  padding: 0;
  z-index: 8;
  font-size: 0;
}

.rrwo-inline-stop:hover {
  background: rgba(125,235,225,0.15);
  border-color: rgba(125,235,225,0.4);
  color: #7dEBe1;
}

.rrwo-inline-stop:active {
  transform: translateY(-50%) scale(0.92);
}

.rrwo-inline-stop svg {
  width: 16px;
  height: 16px;
}
`;

  if (phase === 'idle' || phase === 'done') return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', gap: 0 }}>
      <style>{styles}</style>

      {/* Header with prompt */}
      {/* Animation area */}
      <div className="rrwo-inline">
        <div className="rrwo-inline-stage">
          <div className={`rrwo-inline-stage-mask-top ${maskClipped ? 'rrwo-inline-mask-clipped' : ''}`} />
          <div className={`rrwo-inline-stage-mask-bottom ${maskClipped ? 'rrwo-inline-mask-clipped' : ''}`} />
          
          <div ref={layerRef} className="rrwo-inline-layer" />

          <div className={`rrwo-inline-core ${morphed ? 'rrwo-inline-morph' : ''}`} style={{ top: coreTop }} />
          {morphed && (
            <div className="rrwo-inline-core rrwo-inline-morph rrwo-inline-core-bottom" style={{ top: coreBot }} />
          )}

          {!morphed && (
            <div className={`rrwo-inline-status ${statusOn ? '' : 'rrwo-inline-fade'}`}>
              {STATUSES[statusIdx]}
            </div>
          )}
        </div>

        {instruction && (
          <div className="rrwo-inline-instruction">
            {instruction.length > 20 ? `${instruction.substring(0, 20)}...` : instruction}
          </div>
        )}

        <button className="rrwo-inline-stop" onClick={onStop} title="Stop generation">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </button>
      </div>
    </div>
  );
}
