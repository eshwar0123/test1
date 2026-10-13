import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API } from "../api";
import OpenSeadragon from "openseadragon";
import Chat from "./Chat";
import AnnotationLabel from "./AnnotationLabel";
import "./Viewer.css";
import RecentreIcon from "../assets/recentre.svg";
import AnnotateIcon from "../assets/annotate.svg";

export default function Viewer() {
  const { scanId } = useParams();
  const nav = useNavigate();

  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  /* ---------------- UI STATE ---------------- */
  const [metadata, setMetadata] = useState(null);
  const [showChat, setShowChat] = useState(true);
  const [activeTool, setActiveTool] = useState(null);
  const [showAnnotateMenu, setShowAnnotateMenu] = useState(false);
  const [activeColor, setActiveColor] = useState("#ff0000");
  
  // Store last used color in localStorage
  useEffect(() => {
    const savedColor = localStorage.getItem('annotationColor');
    if (savedColor) {
      setActiveColor(savedColor);
    }
  }, []);
  
  const handleColorChange = (newColor) => {
    setActiveColor(newColor);
    localStorage.setItem('annotationColor', newColor);
  };
  const [showAnnotations, setShowAnnotations] = useState(true);

  /* ---------------- ANNOTATIONS ---------------- */
  const [annotations, setAnnotations] = useState([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);
  const [flash, setFlash] = useState(false);

  const selectedAnnotation = annotations.find(
    a => a.id === selectedAnnotationId
  );

  /* ---------------- DRAW ---------------- */
  const [draftShape, setDraftShape] = useState(null);
  const drawingRef = useRef(null);
  const [, forceUpdate] = useState(0);

  /* ---------------- COLOR UTILS ---------------- */
  function getContrastColor(hexColor) {
    // Convert hex to RGB
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return black for light backgrounds, white for dark backgrounds
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  /* ---------------- API ---------------- */
  async function fetchAnnotations() {
    const res = await API.get(`/annotations/scan/${scanId}`);
    return res.data.annotations;
  }

  async function saveAnnotation(shape) {
    const res = await API.post("/annotations", {
      scan_id: scanId,
      tool_type: shape.type,
      color: shape.color,
      label: null,
      data:
        shape.type === "rect"
          ? { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
          : shape.type === "circle"
          ? { cx: shape.cx, cy: shape.cy, r: shape.r }
          : { points: shape.points },
    });
    return res.data.annotation_id;
  }

  async function deleteAnnotation(id) {
    await API.delete(`/annotations/${id}`);
    setAnnotations(prev => prev.filter(a => a.id !== id));
    setSelectedAnnotationId(null);
  }

  /* ---------------- EFFECTS ---------------- */
  useEffect(() => {
    API.get(`/scan-metadata/${scanId}`).then((res) => {
      setMetadata({
        dziUrl: res.data?.dziUrl || "https://openseadragon.github.io/example-images/duomo/duomo.dzi",
      });
    });
  }, [scanId]);

  useEffect(() => {
    if (!metadata) return;
    fetchAnnotations().then((dbAnnotations) => {
      const restored = dbAnnotations.map((a) => ({
        id: a.id,
        type: a.tool_type,
        color: a.color,
        label: a.label,
        labelColor: a.label_color,
        ...(a.tool_type === "path" ? { points: a.data.points } : a.data),
      }));
      setAnnotations(restored);
    });
  }, [metadata, scanId]);

  useEffect(() => {
    if (!metadata) return;

    const viewer = OpenSeadragon({
      id: "osd-viewer",
      tileSources: metadata.dziUrl,
      prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
      showNavigationControl: false,
      animationTime: 0.8,
      blendTime: 0.1,
      immediateRender: false,
      constrainDuringPan: true,
      zoomPerClick: 1.04,
      scrollToZoom: false,
    });

    viewerRef.current = viewer;

    const rerender = () => forceUpdate(v => v + 1);
    viewer.addHandler("viewport-change", rerender);

    // Smooth touchpad zoom
    const onWheel = (event) => {
      event.preventDefault();

      const canvas = viewer.canvas;
      const rect = canvas.getBoundingClientRect();

      const pixel = new OpenSeadragon.Point(
        event.clientX - rect.left,
        event.clientY - rect.top
      );

      const viewport = viewer.viewport;
      const zoomFactor = event.deltaY < 0 ? 1.08 : 0.92;
      const viewportPoint = viewport.pointFromPixel(pixel);

      viewport.zoomTo(
        viewport.getZoom() * zoomFactor,
        viewportPoint,
        true
      );
    };

    viewer.canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      viewer.canvas.removeEventListener("wheel", onWheel);
      viewer.removeHandler("viewport-change", rerender);
      viewer.destroy();
    };
  }, [metadata]);

  /* ---------------- COORDINATES ---------------- */
  function screenToImage(e) {
    const rect = containerRef.current.getBoundingClientRect();
    const pixel = new OpenSeadragon.Point(
      e.clientX - rect.left,
      e.clientY - rect.top
    );
    const viewportPt = viewerRef.current.viewport.pointFromPixel(pixel);
    return viewerRef.current.viewport.viewportToImageCoordinates(viewportPt);
  }

  function imageToScreen(x, y) {
    const viewportPt = viewerRef.current.viewport.imageToViewportCoordinates(x, y);
    return viewerRef.current.viewport.pixelFromPoint(viewportPt);
  }

  /* ---------------- FIND ANNOTATION AT CLICK POINT ---------------- */
  function findAnnotationAtPoint(e) {
    const imgPt = screenToImage(e);
    
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      
      if (ann.type === "rect") {
        if (
          imgPt.x >= ann.x &&
          imgPt.x <= ann.x + ann.w &&
          imgPt.y >= ann.y &&
          imgPt.y <= ann.y + ann.h
        ) {
          return ann;
        }
      }
      
      if (ann.type === "circle") {
        const dist = Math.hypot(imgPt.x - ann.cx, imgPt.y - ann.cy);
        if (dist <= ann.r) {
          return ann;
        }
      }
      
      if (ann.type === "path") {
        for (let j = 0; j < ann.points.length - 1; j++) {
          const p1 = ann.points[j];
          const p2 = ann.points[j + 1];
          const dist = distanceToSegment(imgPt, p1, p2);
          if (dist < 50) {
            return ann;
          }
        }
      }
    }
    
    return null;
  }

  function distanceToSegment(pt, p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthSq = dx * dx + dy * dy;
    
    if (lengthSq === 0) return Math.hypot(pt.x - p1.x, pt.y - p1.y);
    
    let t = ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    
    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;
    
    return Math.hypot(pt.x - projX, pt.y - projY);
  }

  /* ---------------- DRAW EVENTS ---------------- */
  function onMouseDown(e) {
    if (!activeTool) return;
    
    if (activeTool === "eraser") {
      const clickedAnnotation = findAnnotationAtPoint(e);
      if (clickedAnnotation) {
        if (window.confirm(`Delete annotation${clickedAnnotation.label ? ` "${clickedAnnotation.label}"` : ''}?`)) {
          deleteAnnotation(clickedAnnotation.id);
        }
      }
      return;
    }

    const imgPt = screenToImage(e);
    drawingRef.current = activeTool === "freehand" ? [imgPt] : imgPt;

    if (activeTool === "freehand") {
      setDraftShape({
        type: "path",
        points: [imgPt],
        color: activeColor,
      });
    }
  }

  function onMouseMove(e) {
    if (!drawingRef.current || !activeTool || activeTool === "eraser") return;
    const imgPt = screenToImage(e);
    const start = drawingRef.current;

    if (activeTool === "rect") {
      setDraftShape({
        type: "rect",
        x: Math.min(start.x, imgPt.x),
        y: Math.min(start.y, imgPt.y),
        w: Math.abs(imgPt.x - start.x),
        h: Math.abs(imgPt.y - start.y),
        color: activeColor,
      });
    }

    if (activeTool === "circle") {
      const r = Math.hypot(imgPt.x - start.x, imgPt.y - start.y);
      setDraftShape({
        type: "circle",
        cx: start.x,
        cy: start.y,
        r,
        color: activeColor,
      });
    }

    if (activeTool === "freehand") {
      start.push(imgPt);
      setDraftShape({
        type: "path",
        points: [...start],
        color: activeColor,
      });
    }
  }

  async function onMouseUp() {
    if (!draftShape || activeTool === "eraser") return;

    // Skip tiny shapes
    if (
      (draftShape.type === "rect" && draftShape.w < 5) ||
      (draftShape.type === "circle" && draftShape.r < 5)
    ) {
      setDraftShape(null);
      drawingRef.current = null;
      return;
    }

    const id = await saveAnnotation(draftShape);
    setAnnotations(prev => [...prev, { ...draftShape, id }]);
    setDraftShape(null);
    drawingRef.current = null;
    setActiveTool(null);
  }

  /* ---------------- RENDER ANNOTATION ---------------- */
  function selectAnnotation(id) {
    if (activeTool === "eraser") return;
    setSelectedAnnotationId(id);
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
  }

  function getLabelPosition(shape) {
    if (shape.type === "rect") {
      return imageToScreen(shape.x, shape.y);
    }
    if (shape.type === "circle") {
      return imageToScreen(shape.cx, shape.cy - shape.r);
    }
    if (shape.type === "path" && shape.points.length > 0) {
      return imageToScreen(shape.points[0].x, shape.points[0].y);
    }
    return { x: 0, y: 0 };
  }

  function renderShape(shape, i, draft = false) {
    const isSelected = shape.id === selectedAnnotationId;

    const common = {
      stroke: isSelected ? "#00ffff" : shape.color,
      fill: draft ? "none" : shape.color,
      opacity: isSelected ? 0.6 : 0.3,
      strokeWidth: isSelected ? 3 : 2,
      onClick: () => !draft && selectAnnotation(shape.id),
      style: { cursor: draft ? "default" : activeTool === "eraser" ? "crosshair" : "pointer" },
    };

    const elements = [];

    if (shape.type === "rect") {
      const p1 = imageToScreen(shape.x, shape.y);
      const p2 = imageToScreen(shape.x + shape.w, shape.y + shape.h);
      elements.push(
        <rect key={`shape-${i}`} x={p1.x} y={p1.y} width={p2.x - p1.x} height={p2.y - p1.y} {...common} />
      );
    }

    if (shape.type === "circle") {
      const c = imageToScreen(shape.cx, shape.cy);
      const e = imageToScreen(shape.cx + shape.r, shape.cy);
      elements.push(
        <circle key={`shape-${i}`} cx={c.x} cy={c.y} r={Math.abs(e.x - c.x)} {...common} />
      );
    }

    if (shape.type === "path") {
      const d = shape.points.map((p, idx) => {
        const s = imageToScreen(p.x, p.y);
        return `${idx === 0 ? "M" : "L"} ${s.x} ${s.y}`;
      }).join(" ");
      elements.push(
        <path key={`shape-${i}`} d={d} stroke={shape.color} fill="none" strokeWidth="2" {...common} />
      );
    }

    // Render label flag
    if (shape.label && !draft) {
      const pos = getLabelPosition(shape);
      const labelColor = shape.labelColor || shape.color;
      const textColor = getContrastColor(labelColor);
      const padding = 4;
      const fontSize = 12;
      
      const textWidth = shape.label.length * 7;
      const flagWidth = textWidth + padding * 2;
      const flagHeight = fontSize + padding * 2;

      elements.push(
        <g key={`label-${i}`} onClick={() => selectAnnotation(shape.id)} style={{ cursor: activeTool === "eraser" ? "crosshair" : "pointer" }}>
          <rect
            x={pos.x}
            y={pos.y - flagHeight - 5}
            width={flagWidth}
            height={flagHeight}
            fill={labelColor}
            stroke="#000"
            strokeWidth="1"
            rx="3"
            opacity="0.9"
          />
          <text
            x={pos.x + padding}
            y={pos.y - padding - 5}
            fill={textColor}
            fontSize={fontSize}
            fontWeight="600"
            style={{ 
              userSelect: "none",
              textShadow: textColor === '#ffffff' ? "1px 1px 2px rgba(0,0,0,0.8)" : "1px 1px 2px rgba(255,255,255,0.5)"
            }}
          >
            {shape.label}
          </text>
          <line
            x1={pos.x}
            y1={pos.y - 5}
            x2={pos.x}
            y2={pos.y}
            stroke={labelColor}
            strokeWidth="2"
          />
        </g>
      );
    }

    return elements;
  }

  return (
    <div className="viewer-layout-wrapper">
      <div ref={containerRef} className="viewer-container">
        <button className="back-btn" onClick={() => nav("/radiologist/repository")}>
          ← Back
        </button>

        <div className="main-toolbar" onMouseDown={e => e.stopPropagation()}>
          <button
            onClick={() => setActiveTool(null)}
            className={activeTool === null ? "active" : ""}
          >
            ↔
          </button>

          <div className="separator" />

          <button onClick={() => setShowAnnotateMenu(v => !v)}>
            <img src={AnnotateIcon} alt="annotate" />
          </button>

          <input
            type="color"
            value={activeColor}
            onChange={(e) => handleColorChange(e.target.value)}
          />

          <div className="separator" />

          <button 
            onClick={() => setActiveTool(activeTool === "eraser" ? null : "eraser")}
            className={activeTool === "eraser" ? "active" : ""}
            title="Eraser"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
              <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
            </svg>
          </button>

          <button 
            onClick={() => setShowAnnotations(v => !v)}
            title={showAnnotations ? "Hide annotations" : "Show annotations"}
          >
            {showAnnotations ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/>
                <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z"/>
                <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/>
                <path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/>
              </svg>
            )}
          </button>

          <div className="separator" />

          <button onClick={() => viewerRef.current?.viewport.zoomBy(1.25, null, true)}>＋</button>
          <button onClick={() => viewerRef.current?.viewport.zoomBy(0.8, null, true)}>－</button>
          <button onClick={() => viewerRef.current?.viewport.goHome(true)}>
            <img src={RecentreIcon} alt="Recentre" />
          </button>

          <div className="separator" />

          <button onClick={() => setShowChat(v => !v)}>💬</button>
        </div>

        {showAnnotateMenu && (
          <div className="annotate-menu">
            <button onClick={() => setActiveTool("rect")}>▭</button>
            <button onClick={() => setActiveTool("circle")}>◯</button>
            <button onClick={() => setActiveTool("freehand")}>✏️</button>
          </div>
        )}

        <div id="osd-viewer" className="osd-root" />

        <svg
          className={`svg-overlay ${activeTool ? "drawing-active" : ""} ${flash ? "flash" : ""} ${activeTool === "eraser" ? "eraser-mode" : ""}`}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
        >
          {showAnnotations && annotations.map((ann, i) => renderShape(ann, i))}
          {draftShape && renderShape(draftShape, "draft", true)}
        </svg>
      </div>

      <AnnotationLabel
        annotation={selectedAnnotation}
        onUpdate={(updated) => {
          setAnnotations(prev =>
            prev.map(a => (a.id === updated.id ? {
              ...a,
              label: updated.label,
              labelColor: updated.labelColor
            } : a))
          );
        }}
        onDelete={() => deleteAnnotation(selectedAnnotationId)}
      />

      {showChat && <Chat scanId={scanId} annotationId={selectedAnnotation} />}
    </div>
  );
}