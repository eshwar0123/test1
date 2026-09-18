import React from "react";

/* Must match CASE_ID_DISPLAY_MAP in repository_1.js / ViewerHeader.js */
const CASE_ID_DISPLAY_MAP = {
  'CASE-REAL-2001': 'GENRAD-SUB-54634582',
  'CASE-REAL-2002': 'GENRAD-SUB-78291364',
  'CASE-REAL-2003': 'GENRAD-SUB-62847193',
  'CASE-REAL-2004': 'GENRAD-SUB-93745128',
  'CASE-REAL-2005': 'GENRAD-SUB-41826597',
  'CASE-REAL-2006': 'GENRAD-SUB-85317624',
  'CASE-REAL-2007': 'GENRAD-SUB-16294837',
  'CASE-REAL-2008': 'GENRAD-SUB-73819264',
  'CASE-REAL-2009': 'GENRAD-SUB-48572913',
  'CASE-REAL-2010': 'GENRAD-SUB-92164738',
  'CASE-REAL-2011': 'GENRAD-SUB-58372914',
  'CASE-REAL-2012': 'GENRAD-SUB-31947528',
  'CASE-REAL-2013': 'GENRAD-SUB-26491837',
  'CASE-REAL-2014': 'GENRAD-SUB-67384521',
  'CASE-REAL-2015': 'GENRAD-SUB-94827156',
  'CASE-REAL-2016': 'GENRAD-SUB-52381749',
  'CASE-REAL-2017': 'GENRAD-SUB-29183746',
  'CASE-REAL-2018': 'GENRAD-SUB-74829163',
  'CASE-REAL-2019': 'GENRAD-SUB-38196274',
  'CASE-REAL-2020': 'GENRAD-SUB-61473829',
  'CASE-REAL-2021': 'GENRAD-SUB-57293841',
  'CASE-REAL-2022': 'GENRAD-SUB-83641927',
  'CASE-REAL-2023': 'GENRAD-SUB-29471836',
  'CASE-REAL-2024': 'GENRAD-SUB-46183729',
  'CASE-REAL-2025': 'GENRAD-SUB-72914638',
  'CASE-REAL-2026': 'GENRAD-SUB-35819274',
  'CASE-REAL-2027': 'GENRAD-SUB-18274639',
  'CASE-REAL-2028': 'GENRAD-SUB-93614728',
  'CASE-REAL-2029': 'GENRAD-SUB-47382916',
  'CASE-REAL-2030': 'GENRAD-SUB-62917483',
  'CASE-REAL-2031': 'GENRAD-SUB-81934726',
  'CASE-REAL-2032': 'GENRAD-SUB-37461829',
  'CASE-REAL-2033': 'GENRAD-SUB-56219473',
  'CASE-REAL-2034': 'GENRAD-SUB-94736281',
  'CASE-REAL-2035': 'GENRAD-SUB-21847369',
  'CASE-REAL-2036': 'GENRAD-SUB-73916248',
  'CASE-REAL-2037': 'GENRAD-SUB-48263917',
  'CASE-REAL-2038': 'GENRAD-SUB-16394728',
  'CASE-REAL-2039': 'GENRAD-SUB-85729163',
  'CASE-REAL-2040': 'GENRAD-SUB-39481726',
  'CASE-REAL-2041': 'GENRAD-SUB-67192834',
  'CASE-REAL-2042': 'GENRAD-SUB-24738169',
  'CASE-REAL-2043': 'GENRAD-SUB-91274836',
  'CASE-REAL-2044': 'GENRAD-SUB-53847219',
  'CASE-REAL-2045': 'GENRAD-SUB-78163942',
  'CASE-REAL-2046': 'GENRAD-SUB-42691837',
  'CASE-REAL-2047': 'GENRAD-SUB-16837429',
  'CASE-REAL-2048': 'GENRAD-SUB-83742619',
  'CASE-REAL-2049': 'GENRAD-SUB-29163874',
  'CASE-REAL-2050': 'GENRAD-SUB-64817293',
  'CASE-REAL-2051': 'GENRAD-SUB-37291648',
  'CASE-REAL-2052': 'GENRAD-SUB-91628473',
  'CASE-REAL-2053': 'GENRAD-SUB-48371926',
  'CASE-REAL-2054': 'GENRAD-SUB-72914836',
  'CASE-REAL-2055': 'GENRAD-SUB-19283746',
  'CASE-REAL-2056': 'GENRAD-SUB-64839271',
  'CASE-REAL-2057': 'GENRAD-SUB-83162947',
  'CASE-REAL-2058': 'GENRAD-SUB-27493816',
  'CASE-REAL-2059': 'GENRAD-SUB-51836294',
  'CASE-REAL-2060': 'GENRAD-SUB-96274831',
  'CASE-REAL-2061': 'GENRAD-SUB-43817296',
  'CASE-REAL-2062': 'GENRAD-SUB-71392846',
  'CASE-REAL-2063': 'GENRAD-SUB-28461937',
  'CASE-REAL-2064': 'GENRAD-SUB-56293174',
};

/**
 * PACS-style corner overlay that appears on top of each image viewport.
 * pointer-events: none — never blocks interaction.
 */
export default function ViewerImageOverlay({
  patientName,
  patientAge,
  patientSex,
  caseId,
  sliceCurrent,
  sliceTotal,
  filename,
  // PACS-style top-right study / series annotation (from DICOM tags)
  studyDescription,
  seriesDescription,
  seriesNumber,
  modality,
}) {
  const mono = {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 11,
    lineHeight: 1.65,
    whiteSpace: "nowrap",
    textShadow: "0 1px 4px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.9)",
    display: "block",
  };

  const displayCaseId = caseId ? (CASE_ID_DISPLAY_MAP[caseId] || caseId) : null;
  const patientLine = [patientSex, patientAge && `${patientAge}y`, displayCaseId && `#${displayCaseId}`]
    .filter(Boolean)
    .join(" · ");

  const shortFile = filename
    ? filename.length > 30
      ? filename.slice(0, 27) + "…"
      : filename
    : null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        {/* Top-left: patient identity */}
        <div>
          {patientName && (
            <span style={{ ...mono, color: "#e5e7eb", fontWeight: 600 }}>
              {patientName}
            </span>
          )}
          {patientLine && (
            <span style={{ ...mono, color: "#9ca3af" }}>{patientLine}</span>
          )}
        </div>

        {/* Top-right: study / series annotation (PACS-style) */}
        <div style={{ textAlign: "right" }}>
          {modality && (
            <span style={{ ...mono, color: "#9ca3af" }}>{modality}</span>
          )}
          {seriesNumber != null && (
            <span style={{ ...mono, color: "#9ca3af" }}>{`Se: ${seriesNumber}`}</span>
          )}
          {studyDescription && (
            <span style={{ ...mono, color: "#e5e7eb", fontWeight: 600 }}>
              {studyDescription}
            </span>
          )}
          {seriesDescription && (
            <span style={{ ...mono, color: "#d1d5db" }}>{seriesDescription}</span>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        {/* Bottom-left: filename */}
        <div>
          {shortFile && (
            <span style={{ ...mono, color: "#6b7280" }}>{shortFile}</span>
          )}
        </div>

        {/* Bottom-right: slice indicator */}
        <div style={{ textAlign: "right" }}>
          {sliceTotal > 1 && (
            <span style={{ ...mono, color: "#d1d5db" }}>
              {sliceCurrent} / {sliceTotal}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
