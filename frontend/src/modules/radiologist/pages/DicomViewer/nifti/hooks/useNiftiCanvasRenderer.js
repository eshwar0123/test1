import { useEffect } from "react";
import {
  applyWindowLevelToRGBA,
  makeGrayImageData,
} from "../../utils/viewerUtils";

export default function useNiftiCanvasRenderer({
  niftiVol,
  nxIndex,
  nyIndex,
  nzIndex,
  niftiBoxes,
  niftiDrag,
  niftiMeasures,
  niftiWc,
  niftiWw,
  niftiMeasureHover,
  niftiMeasureStart,
  annotations,
  annDrawing,
  niftiContainerRef,
}) {
  useEffect(() => {
    if (!niftiVol) return;
    const { w, h, d, data, wc, ww, pixDims } = niftiVol;
    const wcUse = niftiWc ?? wc;
    const wwUse = niftiWw ?? ww;
    const wh = w * h;

    const container = niftiContainerRef.current;
    if (!container) return;
    const canvases = container.querySelectorAll("canvas[data-nifti-plane]");
    if (!canvases.length) return;

    const getAx = (x, y) => data[nzIndex * wh + y * w + x];
    const getSag = (z, y) => data[z * wh + y * w + nxIndex];
    const getCor = (x, z) => data[z * wh + nyIndex * w + x];

    const drawBoxesOnAxial = (ctx) => {
      const active = niftiDrag?.plane === "axial" ? niftiDrag.box : null;
      const all = active ? [...niftiBoxes, active] : niftiBoxes;
      all.forEach((b) => {
        if (nzIndex < b.z0 || nzIndex > b.z1) return;
        const x = b.x0;
        const y = b.y0;
        const bw = b.x1 - b.x0;
        const bh = b.y1 - b.y0;
        if (bw < 1 || bh < 1) return;
        ctx.fillStyle = "rgba(255,0,0,0.2)";
        ctx.strokeStyle = "rgba(255,0,0,0.9)";
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);
      });
    };

    const drawBoxesOnSagittal = (ctx) => {
      const active = niftiDrag?.plane === "sagittal" ? niftiDrag.box : null;
      const all = active ? [...niftiBoxes, active] : niftiBoxes;
      all.forEach((b) => {
        if (nxIndex < b.x0 || nxIndex > b.x1) return;
        const x = b.z0;
        const y = b.y0;
        const bw = b.z1 - b.z0;
        const bh = b.y1 - b.y0;
        if (bw < 1 || bh < 1) return;
        ctx.fillStyle = "rgba(255,0,0,0.2)";
        ctx.strokeStyle = "rgba(255,0,0,0.9)";
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);
      });
    };

    const drawBoxesOnCoronal = (ctx) => {
      const active = niftiDrag?.plane === "coronal" ? niftiDrag.box : null;
      const all = active ? [...niftiBoxes, active] : niftiBoxes;
      all.forEach((b) => {
        if (nyIndex < b.y0 || nyIndex > b.y1) return;
        const x = b.x0;
        const y = b.z0;
        const bw = b.x1 - b.x0;
        const bh = b.z1 - b.z0;
        if (bw < 1 || bh < 1) return;
        ctx.fillStyle = "rgba(255,0,0,0.2)";
        ctx.strokeStyle = "rgba(255,0,0,0.9)";
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);
      });
    };

    canvases.forEach((canvas) => {
      const plane = canvas.dataset.niftiPlane;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (plane === "axial") {
        canvas.width = w; canvas.height = h;
        const img = makeGrayImageData(w, h);
        applyWindowLevelToRGBA(img, getAx, w, h, wcUse, wwUse);
        ctx.putImageData(img, 0, 0);
        drawBoxesOnAxial(ctx);
        const annList = annotations.filter((a) => a.plane === "axial" && a.slice === nzIndex);
        annList.forEach((a) => {
          ctx.strokeStyle = a.color;
          ctx.fillStyle = a.color;
          ctx.globalAlpha = a.opacity;
          if (a.type === "box") {
            const bw = a.x1 - a.x0;
            const bh = a.y1 - a.y0;
            ctx.fillRect(a.x0, a.y0, bw, bh);
            ctx.strokeRect(a.x0, a.y0, bw, bh);
          } else if (a.type === "circle") {
            const cx = (a.x0 + a.x1) / 2;
            const cy = (a.y0 + a.y1) / 2;
            const rx = Math.abs(a.x1 - a.x0) / 2;
            const ry = Math.abs(a.y1 - a.y0) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else if (a.type === "line" || a.type === "arrow") {
            ctx.beginPath();
            ctx.moveTo(a.x0, a.y0);
            ctx.lineTo(a.x1, a.y1);
            ctx.stroke();
            if (a.type === "arrow") {
              const ang = Math.atan2(a.y1 - a.y0, a.x1 - a.x0);
              const len = 8;
              ctx.beginPath();
              ctx.moveTo(a.x1, a.y1);
              ctx.lineTo(a.x1 - len * Math.cos(ang - 0.4), a.y1 - len * Math.sin(ang - 0.4));
              ctx.lineTo(a.x1 - len * Math.cos(ang + 0.4), a.y1 - len * Math.sin(ang + 0.4));
              ctx.closePath();
              ctx.fill();
            }
          } else if (a.type === "freehand") {
            ctx.beginPath();
            a.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        });
        if (annDrawing && annDrawing.plane === "axial" && annDrawing.slice === nzIndex) {
          ctx.strokeStyle = annDrawing.color;
          ctx.fillStyle = annDrawing.color;
          ctx.globalAlpha = annDrawing.opacity;
          if (annDrawing.type === "freehand") {
            ctx.beginPath();
            annDrawing.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
          } else if (annDrawing.type === "line" || annDrawing.type === "arrow") {
            ctx.beginPath();
            ctx.moveTo(annDrawing.x0, annDrawing.y0);
            ctx.lineTo(annDrawing.x1, annDrawing.y1);
            ctx.stroke();
            if (annDrawing.type === "arrow") {
              const ang = Math.atan2(annDrawing.y1 - annDrawing.y0, annDrawing.x1 - annDrawing.x0);
              const len = 8;
              ctx.beginPath();
              ctx.moveTo(annDrawing.x1, annDrawing.y1);
              ctx.lineTo(annDrawing.x1 - len * Math.cos(ang - 0.4), annDrawing.y1 - len * Math.sin(ang - 0.4));
              ctx.lineTo(annDrawing.x1 - len * Math.cos(ang + 0.4), annDrawing.y1 - len * Math.sin(ang + 0.4));
              ctx.closePath();
              ctx.fill();
            }
          } else if (annDrawing.type === "circle") {
            const cx = (annDrawing.x0 + annDrawing.x1) / 2;
            const cy = (annDrawing.y0 + annDrawing.y1) / 2;
            const rx = Math.abs(annDrawing.x1 - annDrawing.x0) / 2;
            const ry = Math.abs(annDrawing.y1 - annDrawing.y0) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            const bw = annDrawing.x1 - annDrawing.x0;
            const bh = annDrawing.y1 - annDrawing.y0;
            ctx.fillRect(annDrawing.x0, annDrawing.y0, bw, bh);
            ctx.strokeRect(annDrawing.x0, annDrawing.y0, bw, bh);
          }
          ctx.globalAlpha = 1;
        }
        const px = pixDims?.[1] || 1;
        const py = pixDims?.[2] || 1;
        niftiMeasures.filter((m) => m.plane === "axial").forEach((m) => {
          ctx.strokeStyle = "#ff4de3";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(m.x0 + 0.5, m.y0 + 0.5);
          ctx.lineTo(m.x1 + 0.5, m.y1 + 0.5);
          ctx.stroke();
          ctx.fillStyle = "#5CFF5C";
          ctx.beginPath();
          ctx.arc(m.x0, m.y0, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(m.x1, m.y1, 2.5, 0, Math.PI * 2);
          ctx.fill();
          const dx = (m.x1 - m.x0) * px;
          const dy = (m.y1 - m.y0) * py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          ctx.fillStyle = "#ff4de3";
          ctx.font = "10px sans-serif";
          ctx.fillText(`${dist.toFixed(2)} mm`, m.x1 + 6, m.y1 - 6);
        });
        const hover = niftiMeasureHover.axial;
        const start = niftiMeasureStart.axial;
        if (start && hover) {
          ctx.strokeStyle = "#ff4de3";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(start.x + 0.5, start.y + 0.5);
          ctx.lineTo(hover.x + 0.5, hover.y + 0.5);
          ctx.stroke();
          ctx.fillStyle = "#5CFF5C";
          ctx.beginPath();
          ctx.arc(start.x, start.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          const dx = (hover.x - start.x) * px;
          const dy = (hover.y - start.y) * py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          ctx.fillStyle = "#ff4de3";
          ctx.font = "10px sans-serif";
          ctx.fillText(`${dist.toFixed(2)} mm`, hover.x + 6, hover.y - 6);
        }
      } else if (plane === "sagittal") {
        canvas.width = d; canvas.height = h;
        const img = makeGrayImageData(d, h);
        applyWindowLevelToRGBA(img, getSag, d, h, wcUse, wwUse);
        ctx.putImageData(img, 0, 0);
        drawBoxesOnSagittal(ctx);
        const annList = annotations.filter((a) => a.plane === "sagittal" && a.slice === nxIndex);
        annList.forEach((a) => {
          ctx.strokeStyle = a.color;
          ctx.fillStyle = a.color;
          ctx.globalAlpha = a.opacity;
          if (a.type === "box") {
            const bw = a.x1 - a.x0;
            const bh = a.y1 - a.y0;
            ctx.fillRect(a.x0, a.y0, bw, bh);
            ctx.strokeRect(a.x0, a.y0, bw, bh);
          } else if (a.type === "circle") {
            const cx = (a.x0 + a.x1) / 2;
            const cy = (a.y0 + a.y1) / 2;
            const rx = Math.abs(a.x1 - a.x0) / 2;
            const ry = Math.abs(a.y1 - a.y0) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else if (a.type === "line" || a.type === "arrow") {
            ctx.beginPath();
            ctx.moveTo(a.x0, a.y0);
            ctx.lineTo(a.x1, a.y1);
            ctx.stroke();
            if (a.type === "arrow") {
              const ang = Math.atan2(a.y1 - a.y0, a.x1 - a.x0);
              const len = 8;
              ctx.beginPath();
              ctx.moveTo(a.x1, a.y1);
              ctx.lineTo(a.x1 - len * Math.cos(ang - 0.4), a.y1 - len * Math.sin(ang - 0.4));
              ctx.lineTo(a.x1 - len * Math.cos(ang + 0.4), a.y1 - len * Math.sin(ang + 0.4));
              ctx.closePath();
              ctx.fill();
            }
          } else if (a.type === "freehand") {
            ctx.beginPath();
            a.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        });
        if (annDrawing && annDrawing.plane === "sagittal" && annDrawing.slice === nxIndex) {
          ctx.strokeStyle = annDrawing.color;
          ctx.fillStyle = annDrawing.color;
          ctx.globalAlpha = annDrawing.opacity;
          if (annDrawing.type === "freehand") {
            ctx.beginPath();
            annDrawing.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
          } else if (annDrawing.type === "line" || annDrawing.type === "arrow") {
            ctx.beginPath();
            ctx.moveTo(annDrawing.x0, annDrawing.y0);
            ctx.lineTo(annDrawing.x1, annDrawing.y1);
            ctx.stroke();
            if (annDrawing.type === "arrow") {
              const ang = Math.atan2(annDrawing.y1 - annDrawing.y0, annDrawing.x1 - annDrawing.x0);
              const len = 8;
              ctx.beginPath();
              ctx.moveTo(annDrawing.x1, annDrawing.y1);
              ctx.lineTo(annDrawing.x1 - len * Math.cos(ang - 0.4), annDrawing.y1 - len * Math.sin(ang - 0.4));
              ctx.lineTo(annDrawing.x1 - len * Math.cos(ang + 0.4), annDrawing.y1 - len * Math.sin(ang + 0.4));
              ctx.closePath();
              ctx.fill();
            }
          } else if (annDrawing.type === "circle") {
            const cx = (annDrawing.x0 + annDrawing.x1) / 2;
            const cy = (annDrawing.y0 + annDrawing.y1) / 2;
            const rx = Math.abs(annDrawing.x1 - annDrawing.x0) / 2;
            const ry = Math.abs(annDrawing.y1 - annDrawing.y0) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            const bw = annDrawing.x1 - annDrawing.x0;
            const bh = annDrawing.y1 - annDrawing.y0;
            ctx.fillRect(annDrawing.x0, annDrawing.y0, bw, bh);
            ctx.strokeRect(annDrawing.x0, annDrawing.y0, bw, bh);
          }
          ctx.globalAlpha = 1;
        }
        const px = pixDims?.[3] || 1;
        const py = pixDims?.[2] || 1;
        niftiMeasures.filter((m) => m.plane === "sagittal").forEach((m) => {
          ctx.strokeStyle = "#ff4de3";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(m.x0 + 0.5, m.y0 + 0.5);
          ctx.lineTo(m.x1 + 0.5, m.y1 + 0.5);
          ctx.stroke();
          ctx.fillStyle = "#5CFF5C";
          ctx.beginPath();
          ctx.arc(m.x0, m.y0, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(m.x1, m.y1, 2.5, 0, Math.PI * 2);
          ctx.fill();
          const dx = (m.x1 - m.x0) * px;
          const dy = (m.y1 - m.y0) * py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          ctx.fillStyle = "#ff4de3";
          ctx.font = "10px sans-serif";
          ctx.fillText(`${dist.toFixed(2)} mm`, m.x1 + 6, m.y1 - 6);
        });
        const hover = niftiMeasureHover.sagittal;
        const start = niftiMeasureStart.sagittal;
        if (start && hover) {
          ctx.strokeStyle = "#ff4de3";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(start.x + 0.5, start.y + 0.5);
          ctx.lineTo(hover.x + 0.5, hover.y + 0.5);
          ctx.stroke();
          ctx.fillStyle = "#5CFF5C";
          ctx.beginPath();
          ctx.arc(start.x, start.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          const dx = (hover.x - start.x) * px;
          const dy = (hover.y - start.y) * py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          ctx.fillStyle = "#ff4de3";
          ctx.font = "10px sans-serif";
          ctx.fillText(`${dist.toFixed(2)} mm`, hover.x + 6, hover.y - 6);
        }
      } else if (plane === "coronal") {
        canvas.width = w; canvas.height = d;
        const img = makeGrayImageData(w, d);
        applyWindowLevelToRGBA(img, getCor, w, d, wcUse, wwUse);
        ctx.putImageData(img, 0, 0);
        drawBoxesOnCoronal(ctx);
        const annList = annotations.filter((a) => a.plane === "coronal" && a.slice === nyIndex);
        annList.forEach((a) => {
          ctx.strokeStyle = a.color;
          ctx.fillStyle = a.color;
          ctx.globalAlpha = a.opacity;
          if (a.type === "box") {
            const bw = a.x1 - a.x0;
            const bh = a.y1 - a.y0;
            ctx.fillRect(a.x0, a.y0, bw, bh);
            ctx.strokeRect(a.x0, a.y0, bw, bh);
          } else if (a.type === "circle") {
            const cx = (a.x0 + a.x1) / 2;
            const cy = (a.y0 + a.y1) / 2;
            const rx = Math.abs(a.x1 - a.x0) / 2;
            const ry = Math.abs(a.y1 - a.y0) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else if (a.type === "line" || a.type === "arrow") {
            ctx.beginPath();
            ctx.moveTo(a.x0, a.y0);
            ctx.lineTo(a.x1, a.y1);
            ctx.stroke();
            if (a.type === "arrow") {
              const ang = Math.atan2(a.y1 - a.y0, a.x1 - a.x0);
              const len = 8;
              ctx.beginPath();
              ctx.moveTo(a.x1, a.y1);
              ctx.lineTo(a.x1 - len * Math.cos(ang - 0.4), a.y1 - len * Math.sin(ang - 0.4));
              ctx.lineTo(a.x1 - len * Math.cos(ang + 0.4), a.y1 - len * Math.sin(ang + 0.4));
              ctx.closePath();
              ctx.fill();
            }
          } else if (a.type === "freehand") {
            ctx.beginPath();
            a.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        });
        if (annDrawing && annDrawing.plane === "coronal" && annDrawing.slice === nyIndex) {
          ctx.strokeStyle = annDrawing.color;
          ctx.fillStyle = annDrawing.color;
          ctx.globalAlpha = annDrawing.opacity;
          if (annDrawing.type === "freehand") {
            ctx.beginPath();
            annDrawing.points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
          } else if (annDrawing.type === "line" || annDrawing.type === "arrow") {
            ctx.beginPath();
            ctx.moveTo(annDrawing.x0, annDrawing.y0);
            ctx.lineTo(annDrawing.x1, annDrawing.y1);
            ctx.stroke();
            if (annDrawing.type === "arrow") {
              const ang = Math.atan2(annDrawing.y1 - annDrawing.y0, annDrawing.x1 - annDrawing.x0);
              const len = 8;
              ctx.beginPath();
              ctx.moveTo(annDrawing.x1, annDrawing.y1);
              ctx.lineTo(annDrawing.x1 - len * Math.cos(ang - 0.4), annDrawing.y1 - len * Math.sin(ang - 0.4));
              ctx.lineTo(annDrawing.x1 - len * Math.cos(ang + 0.4), annDrawing.y1 - len * Math.sin(ang + 0.4));
              ctx.closePath();
              ctx.fill();
            }
          } else if (annDrawing.type === "circle") {
            const cx = (annDrawing.x0 + annDrawing.x1) / 2;
            const cy = (annDrawing.y0 + annDrawing.y1) / 2;
            const rx = Math.abs(annDrawing.x1 - annDrawing.x0) / 2;
            const ry = Math.abs(annDrawing.y1 - annDrawing.y0) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            const bw = annDrawing.x1 - annDrawing.x0;
            const bh = annDrawing.y1 - annDrawing.y0;
            ctx.fillRect(annDrawing.x0, annDrawing.y0, bw, bh);
            ctx.strokeRect(annDrawing.x0, annDrawing.y0, bw, bh);
          }
          ctx.globalAlpha = 1;
        }
        const px = pixDims?.[1] || 1;
        const py = pixDims?.[3] || 1;
        niftiMeasures.filter((m) => m.plane === "coronal").forEach((m) => {
          ctx.strokeStyle = "#ff4de3";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(m.x0 + 0.5, m.y0 + 0.5);
          ctx.lineTo(m.x1 + 0.5, m.y1 + 0.5);
          ctx.stroke();
          ctx.fillStyle = "#5CFF5C";
          ctx.beginPath();
          ctx.arc(m.x0, m.y0, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(m.x1, m.y1, 2.5, 0, Math.PI * 2);
          ctx.fill();
          const dx = (m.x1 - m.x0) * px;
          const dy = (m.y1 - m.y0) * py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          ctx.fillStyle = "#ff4de3";
          ctx.font = "10px sans-serif";
          ctx.fillText(`${dist.toFixed(2)} mm`, m.x1 + 6, m.y1 - 6);
        });
        const hover = niftiMeasureHover.coronal;
        const start = niftiMeasureStart.coronal;
        if (start && hover) {
          ctx.strokeStyle = "#ff4de3";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(start.x + 0.5, start.y + 0.5);
          ctx.lineTo(hover.x + 0.5, hover.y + 0.5);
          ctx.stroke();
          ctx.fillStyle = "#5CFF5C";
          ctx.beginPath();
          ctx.arc(start.x, start.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          const dx = (hover.x - start.x) * px;
          const dy = (hover.y - start.y) * py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          ctx.fillStyle = "#ff4de3";
          ctx.font = "10px sans-serif";
          ctx.fillText(`${dist.toFixed(2)} mm`, hover.x + 6, hover.y - 6);
        }
      }
    });
  }, [
    niftiVol,
    nxIndex,
    nyIndex,
    nzIndex,
    niftiBoxes,
    niftiDrag,
    niftiMeasures,
    niftiWc,
    niftiWw,
    niftiMeasureHover,
    niftiMeasureStart,
    annotations,
    annDrawing,
    niftiContainerRef,
  ]);
}
