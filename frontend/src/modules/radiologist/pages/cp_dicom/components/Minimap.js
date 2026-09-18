import React, { useRef, useEffect, useState, useCallback } from "react";

/**
 * Minimap — small overview showing the full image with a rectangle
 * indicating the current zoom/pan region.
 * Visible when zoomed in via any method (tool, scroll, camera).
 */
export default function Minimap({ renderingEngine, viewportId }) {
  const canvasRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const initialParallelScaleRef = useRef(null);

  const draw = useCallback(() => {
    if (!renderingEngine || !viewportId || !canvasRef.current) return;

    let vp;
    try {
      vp = renderingEngine.getViewport(viewportId);
    } catch {
      return;
    }
    if (!vp) return;

    const camera = vp.getCamera?.();
    if (!camera) return;

    // Detect zoom via multiple methods
    let zoom = 1;

    // Method 1: getZoom API
    if (typeof vp.getZoom === "function") {
      zoom = vp.getZoom() ?? 1;
    }

    // Method 2: parallelScale comparison (works for scroll/camera zoom)
    if (zoom <= 1.05 && camera.parallelScale) {
      if (!initialParallelScaleRef.current) {
        initialParallelScaleRef.current = camera.parallelScale;
      }
      const scaleRatio = initialParallelScaleRef.current / camera.parallelScale;
      if (scaleRatio > 1.05) {
        zoom = scaleRatio;
      }
    }

    if (zoom < 1.05) {
      setVisible(false);
      return;
    }
    setVisible(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Draw darkened background
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, W, H);

    // Calculate visible region
    const viewW = 1 / zoom;
    const viewH = 1 / zoom;

    // Get pan offset
    const pan = typeof vp.getPan === "function" ? vp.getPan() : [0, 0];
    const vpCanvas = vp.canvas || vp.element?.querySelector("canvas");
    const cw = vpCanvas?.width || vpCanvas?.clientWidth || 512;
    const ch = vpCanvas?.height || vpCanvas?.clientHeight || 512;

    const panNormX = (pan?.[0] || 0) / cw;
    const panNormY = (pan?.[1] || 0) / ch;

    const rectW = viewW * W;
    const rectH = viewH * H;
    const rectX = (W - rectW) / 2 - panNormX * W;
    const rectY = (H - rectH) / 2 - panNormY * H;

    // Draw visible region (clear area)
    ctx.clearRect(
      Math.max(0, rectX),
      Math.max(0, rectY),
      Math.min(rectW, W),
      Math.min(rectH, H)
    );

    // Border
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.strokeRect(rectX, rectY, rectW, rectH);

    // Corner markers
    const mk = 6;
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(rectX, rectY + mk); ctx.lineTo(rectX, rectY); ctx.lineTo(rectX + mk, rectY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rectX + rectW - mk, rectY); ctx.lineTo(rectX + rectW, rectY); ctx.lineTo(rectX + rectW, rectY + mk); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rectX, rectY + rectH - mk); ctx.lineTo(rectX, rectY + rectH); ctx.lineTo(rectX + mk, rectY + rectH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rectX + rectW - mk, rectY + rectH); ctx.lineTo(rectX + rectW, rectY + rectH); ctx.lineTo(rectX + rectW, rectY + rectH - mk); ctx.stroke();

    // Zoom level
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${zoom.toFixed(1)}x`, W / 2, H - 4);
  }, [renderingEngine, viewportId]);

  useEffect(() => {
    let rafId;
    const loop = () => {
      draw();
      rafId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(rafId);
  }, [draw]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        zIndex: 14,
        pointerEvents: "none",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.15)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
      }}
    >
      <canvas
        ref={canvasRef}
        width={120}
        height={90}
        style={{
          display: "block",
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(4px)",
        }}
      />
    </div>
  );
}
