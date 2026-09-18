import React, { useMemo, useState } from "react";
import { CModal, CModalBody, CModalHeader, CModalTitle } from "@coreui/react";

const round1 = (n) => Math.round(n * 10) / 10;

function splitRemainder(total, fixedValue, count) {
  const rem = Math.max(0, total - fixedValue);
  const each = round1(rem / count);
  const values = Array(count).fill(each);

  const sum = round1(values.reduce((a, b) => a + b, 0));
  const diff = round1(rem - sum);
  values[values.length - 1] = round1(values[values.length - 1] + diff);
  return values;
}

const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function regularPolygonPoints(cx, cy, radius, sides, rotationDeg = -90) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rad(rotationDeg + (360 / sides) * i);
    pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
  }
  return pts;
}

function pointsToStr(pts) {
  return pts.map((p) => `${p.x},${p.y}`).join(" ");
}

function midPoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function edgeAngle(a, b) {
  return deg(Math.atan2(b.y - a.y, b.x - a.x));
}

/** ✅ Force-fit SVG text into a max width (viewBox units) */
function fitTextProps(text, maxLen) {
  if (!text) return {};
  const approx = text.length * 9;
  if (approx <= maxLen) return {};
  return { textLength: maxLen, lengthAdjust: "spacingAndGlyphs" };
}

export default function KeywordWheel({
  centerLabelProp,
  centerValueProp,
  labelsProp,
  compact = false, // ✅ compact mode for role card
}) {

  const centerLabel = centerLabelProp || "CONTRIBUTING";
  const centerValue = centerValueProp ?? 45.5;

  const TOTAL = 100;

  // ✅ 1 PLACE TO CONTROL TEXT SIZES (NORMAL + MODAL)
  const FONT = {
    normal: { label: 12.5, percent: 12, centerLabel: 18, centerValue: 26 },
    modal: { label: 8, percent: 12, centerLabel: 14, centerValue: 21 },
  };

  const labels =
  labelsProp && Array.isArray(labelsProp) && labelsProp.length === 8
    ? labelsProp
    : [
        "ADAPTING",
        "SELF-DIRECTING",
        "PERSEVERING",
        "PROCESSING",
        "PRODUCING",
        "CONTRIBUTING",
        "ACHIEVING",
        "LEADING",
      ];


  const manualPercents = {}; // optional

  const COLORS = {
    background: "rgba(73, 14, 60, 0.35)",
    border: "rgba(31, 5, 25, 0.88)",
    text: "rgba(0, 0, 0, 0.88)",
    centerTextMain: "rgba(0, 0, 0, 0.94)",
    centerTextValue: "rgb(255,255,255)",
    segmentFill: "rgba(154, 175, 185, 0.73)",
    highlightFill: "rgba(73, 14, 60, 0.35)",
    highlightText: "rgb(8, 8, 8)",
    bullet: "rgba(31, 5, 25, 0.88)",
  };

  const segments = useMemo(() => {
    const others = labels.filter((l) => l !== "CONTRIBUTING");
    const auto = splitRemainder(TOTAL, centerValue, others.length);

    let idx = 0;
    return labels.map((name) => {
      let value;
      if (name === "CONTRIBUTING") value = centerValue;
      else if (manualPercents[name] != null) value = manualPercents[name];
      else value = auto[idx++];

      return { name, value: round1(value) };
    });
  }, [centerValue]);

  const sortedSegments = useMemo(() => {
    return [...segments].sort((a, b) => b.value - a.value);
  }, [segments]);
  const top3 = useMemo(() => sortedSegments.slice(0, 3), [sortedSegments]);


  const [active, setActive] = useState(null);
  const modalOpen = active != null;
  const activeSeg = active != null ? segments[active] : null;

  const size = 360;
  const cx = size / 2;
  const cy = size / 2;

  const SIDES = 8;

  // ✅ MODAL-ONLY RING GEOMETRY (thicker ring in modal so text fits)
  const RING = {
    normal: { outer: 194, inner: 116, center: 109 },
    modal: { outer: 166, inner: 86, center: 75 }, // ✅ more space for words
  };

  const rotation = -90 + 360 / (SIDES * 2);

  // big = modal geometry ONLY (normal remains same)
  const bigMode = modalOpen;
  const rr = bigMode ? RING.modal : RING.normal;

  const outer = regularPolygonPoints(cx, cy, rr.outer, SIDES, rotation);
  const inner = regularPolygonPoints(cx, cy, rr.inner, SIDES, rotation);
  const centerPoly = regularPolygonPoints(cx, cy, rr.center, SIDES, rotation);

  const segPolys = segments.map((_, i) => {
    const i2 = (i + 1) % SIDES;
    return [outer[i], outer[i2], inner[i2], inner[i]];
  });

  const findIndexByName = (name) => segments.findIndex((x) => x.name === name);

  function Segment({ s, i, big = false, labelSize, percentSize }) {
    const isSelected = i === active;
    const isContrib = s.name === "CONTRIBUTING";

    const fill = isSelected || isContrib ? COLORS.highlightFill : COLORS.segmentFill;
    const textColor = isSelected || isContrib ? COLORS.highlightText : COLORS.text;
    const strokeW = isSelected ? (big ? 6 : 4) : big ? 3 : 2;

    const i2 = (i + 1) % SIDES;

    const outerMid = midPoint(outer[i], outer[i2]);
    const innerMid = midPoint(inner[i], inner[i2]);

    // ✅ MODAL ONLY: push text more toward INNER edge so long words fit
    const t = big ? 0.68 : 0.5; // higher = closer to inner
    const p = {
      x: outerMid.x * (1 - t) + innerMid.x * t,
      y: outerMid.y * (1 - t) + innerMid.y * t,
    };

    // ✅ rotation (your version)
    let rot = edgeAngle(outer[i], outer[i2]);
    if (rot > 90) rot -= 180;
    if (rot < -90) rot += 180;

    // ✅ keep within readable tilt
    if (Math.abs(rot) > 90) rot = rot > 0 ? 90 : -90;

    const parts =
      s.name.includes("-") && s.name.length > 10 ? s.name.split("-") : [s.name];

    // ✅ modal allows slightly larger max width (more fitting)
    const maxLabelLen = big ? 110 : 64;
    const maxPctLen = big ? 62 : 46;

    // gap control (you have)
    const LABEL_Y = big ? 12 : 15;
    const PCT_Y = big ? 14 : 19;
    const HYPHEN_DY = big ? 11 : 11;

    return (
      <g
        onClick={() => setActive(i)}
        style={{ cursor: "pointer" }}
        opacity={active == null || isSelected ? 1 : 0.55}
      >
        <polygon
          points={pointsToStr(segPolys[i])}
          fill={fill}
          stroke={COLORS.border}
          strokeWidth={strokeW}
          strokeLinejoin="round"
        />

        {/* label */}
        <text
          x={p.x}
          y={p.y - LABEL_Y}
          fill={textColor}
          fontSize={labelSize}
          fontWeight="900"
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(${rot} ${p.x} ${p.y})`}
          style={{ letterSpacing: 0.3 }}
        >
          {parts.length === 1 ? (
            <tspan {...fitTextProps(parts[0], maxLabelLen)}>{parts[0]}</tspan>
          ) : (
            <>
              <tspan x={p.x} dy="0" {...fitTextProps(parts[0] + "-", maxLabelLen)}>
                {parts[0]}-
              </tspan>
              <tspan x={p.x} dy={HYPHEN_DY} {...fitTextProps(parts[1], maxLabelLen)}>
                {parts[1]}
              </tspan>
            </>
          )}
        </text>

        {/* percent */}
        <text
          x={p.x}
          y={p.y + PCT_Y}
          fill={textColor}
          fontSize={percentSize}
          fontWeight="900"
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(${rot} ${p.x} ${p.y})`}
        >
          <tspan {...fitTextProps(`${s.value}%`, maxPctLen)}>{s.value}%</tspan>
        </text>
      </g>
    );
  }

  function WheelSVG({ big = false }) {
    const fs = big ? FONT.modal : FONT.normal;

    return (
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${size} ${size}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {segments.map((s, i) => (
          <Segment
            key={s.name}
            s={s}
            i={i}
            big={big}
            labelSize={fs.label}
            percentSize={fs.percent}
          />
        ))}

        <polygon
          points={pointsToStr(centerPoly)}
          fill={COLORS.background}
          stroke={COLORS.border}
          strokeWidth={big ? 5 : 3}
          strokeLinejoin="round"
        />

        <text
          x={cx}
          y={cy - (big ? 12 : 14)}
          fill={COLORS.centerTextMain}
          fontSize={fs.centerLabel}
          fontWeight="900"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ letterSpacing: 0.8 }}
        >
          <tspan {...fitTextProps(centerLabel, big ? 200 : 130)}>{centerLabel}</tspan>
        </text>

        <text
          x={cx}
          y={cy + (big ? 24 : 24)}
          fill={COLORS.centerTextValue}
          fontSize={fs.centerValue}
          fontWeight="900"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          <tspan {...fitTextProps(`${centerValue}%`, big ? 220 : 140)}>
            {centerValue}%
          </tspan>
        </text>
      </svg>
    );
  }

  return (
    <>
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap:10,            // ✅ smaller default gap
          flexWrap: "wrap",        // ✅ IMPORTANT: wrap on small screens
        }}
      

      >
        <div style={{ width: compact ? 210 : 240, height: compact ? 210 : 240 }}>
          <WheelSVG />
        </div>


       

         {/* MIDDLE: Wheel + Right bullet list 
        <div style={{ flex: 1, minWidth: 160 }}>
          {sortedSegments.map((s) => (
            <div
              key={s.name}
              onClick={() => setActive(findIndexByName(s.name))}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 20,
                padding: "2px 0",
                cursor: "pointer",
                userSelect: "none",
              }}
              title={`${s.name} - ${s.value}%`}
            >
              <div
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: COLORS.bullet,
                  flexShrink: 0,   
                  flexShrink: 0,
                }}
              />
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: COLORS.text,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.name} <span style={{ opacity: 0.75 }}>-</span> {s.value}%
              </div>
            </div>
          ))}
        </div>*/}
      </div>

      <CModal
        visible={modalOpen}
        onClose={() => setActive(null)}
        alignment="center"
        size="xl"
        fullscreen="md"
      >
        <CModalHeader>
          <CModalTitle>
            {activeSeg ? `${activeSeg.name} • ${activeSeg.value}%` : "Details"}
          </CModalTitle>
        </CModalHeader>

        <CModalBody>
          <div
            style={{
              width: "100%",
              display: "flex",
              gap: 22,
              alignItems: "stretch",
            }}
          >
            {/* LEFT: Wheel */}
            <div
              style={{
                flex: 1,
                minWidth: 560,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <div style={{ width: "min(820px, 78vw)", height: "min(620px, 70vh)" }}>
                <WheelSVG big />
              </div>
            </div>

            {/* RIGHT: Top 3 metrics */}
            <div
              style={{
                width: 300,
                flexShrink: 0,
              
                paddingLeft: 18,
                marginRight: 32,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 900, marginTop: 54, alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
                Top 3 
              </div>

              {top3.map((s) => (
                <div
                  key={s.name}
                  onClick={() => setActive(findIndexByName(s.name))}
                  style={{
                    cursor: "pointer",
                    border: "1px solid rgba(15,23,42,0.10)",
                    borderRadius: 14,
                    padding: "12px 12px",
                    background: "rgba(248,250,252,0.60)",
                  }}
                  title={`${s.name} - ${s.value}%`}
                >
                  <div style={{ fontSize: 18, fontWeight: 900 }}>
                    {s.name}
                  </div>

                  <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>
                    {s.value}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CModalBody>

      </CModal>
    </>
  );
}
