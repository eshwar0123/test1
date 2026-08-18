import React, { useState, useRef, useEffect } from 'react';

const STATUSES = [
  'Analyzing request',
  'Reading current findings',
  'Applying instruction',
  'Generating revisions',
  'Finalizing report',
];

export default function ReportRewriteOverlay({ phase, instruction, onRevealComplete, onStop, status }) {
  const layerRef = useRef(null);
  const animKey = useRef(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const [statusOn, setStatusOn] = useState(true);
  const [morphed, setMorphed] = useState(false);
  const [coreTop, setCoreTop] = useState('35%');
  const [coreBot, setCoreBot] = useState('50%');
  const [lit, setLit] = useState(false);
  const [maskClipped, setMaskClipped] = useState(false);

  const spawnParticle = (opts = {}) => {
    const layer = layerRef.current;
    if (!layer) return;
    
    const el = document.createElement('div');
    const x = opts.x ?? Math.random() * 100;
    const y = opts.y ?? Math.random() * 100;
    const duration = opts.duration ?? 800 + Math.random() * 400;
    
    el.style.cssText = `
      position: absolute;
      left: ${x}%;
      top: ${y}%;
      width: 3px;
      height: 3px;
      borderRadius: 50%;
      background: #5eead4;
      pointerEvents: none;
      opacity: 0.7;
    `;
    
    layer.appendChild(el);
    
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      if (progress < 1) {
        el.style.opacity = String(0.7 * (1 - progress));
        el.style.transform = `translateY(${-progress * 80}px)`;
        requestAnimationFrame(animate);
      } else {
        el.remove();
      }
    };
    animate();
  };

  // Cleanup
  useEffect(() => {
    if (phase === 'idle') {
      setMorphed(false);
      setLit(false);
      setCoreTop('35%');
      setCoreBot('50%');
      setStatusIdx(0);
      setStatusOn(true);
      setMaskClipped(false);
      
      const layer = layerRef.current;
      if (layer) {
        layer.innerHTML = '';
      }
    }
  }, [phase]);

  // Thinking phase - spawn particles
  useEffect(() => {
    if (phase !== 'thinking') return;
    
    setMorphed(false);
    setStatusOn(true);
    
    const interval = setInterval(() => {
      if (Math.random() < 0.6) spawnParticle();
    }, 100);
    
    return () => clearInterval(interval);
  }, [phase]);

  // Revealing phase - morph animation
  useEffect(() => {
    if (phase !== 'revealing') return;
    
    const key = ++animKey.current;
    setStatusOn(false);
    setMorphed(true);
    
    const startTime = Date.now();
    const duration = 2800;
    
    const animate = () => {
      if (animKey.current !== key) return;
      
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      setCoreTop(String(35 + progress * 15) + '%');
      setCoreBot(String(50 + progress * 15) + '%');
      setMaskClipped(progress > 0.3);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        onRevealComplete?.();
      }
    };
    animate();
  }, [phase, onRevealComplete]);

  // Cycle statuses
  useEffect(() => {
    if (phase === 'idle' || !statusOn) return;
    
    const interval = setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUSES.length);
    }, 850);
    
    return () => clearInterval(interval);
  }, [phase, statusOn]);

  const styles = `
    .rrwo-stage {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .rrwo-layer {
      position: absolute;
      inset: 0;
      z-index: 5;
    }

    .rrwo-status {
      font-size: 12px;
      color: rgba(160, 250, 240, 0.9);
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      white-space: nowrap;
      transition: opacity 200ms ease;
      z-index: 20;
    }

    .rrwo-status.hidden {
      opacity: 0.3;
    }
  `;

  return (
    <>
      <style>{styles}</style>
      
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        {/* Animation stage - particles only, no dot */}
        <div className="rrwo-stage">
          <div ref={layerRef} className="rrwo-layer" />
        </div>

        {/* Status text - below animation with gap from dot */}
        {!morphed && (
          <div className={`rrwo-status ${statusOn ? '' : 'hidden'}`}>
            {STATUSES[statusIdx]}
          </div>
        )}
      </div>
    </>
  );
}
