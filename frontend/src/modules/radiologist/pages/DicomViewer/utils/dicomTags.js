import dicomParser from "dicom-parser";

const stripWadouri = (id) => String(id || "").replace(/^wadouri:/i, "");

export async function readDicomOverlayTags(idsOrUrls) {
  if (!Array.isArray(idsOrUrls) || idsOrUrls.length === 0) return null;
  const url = stripWadouri(idsOrUrls[0]);
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    let resp;
    try {
      resp = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const ds = dicomParser.parseDicom(new Uint8Array(buf));
    const s = (tag) => {
      try { const v = ds.string(tag); return v ? v.trim() : null; } catch { return null; }
    };
    const rawTime = s("x00080030");
    const formattedTime = rawTime && rawTime.length >= 6
      ? `${rawTime.slice(0,2)}:${rawTime.slice(2,4)}:${rawTime.slice(4,6)}`
      : rawTime;
    const rawDate = s("x00080020");
    const formattedDate = rawDate && rawDate.length === 8
      ? `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}`
      : rawDate;
    return {
      patientId:          s("x00100020"),
      institutionName:    s("x00080080"),
      institutionAddress: s("x00080081"),
      studyDate:          formattedDate,
      studyTime:          formattedTime,
      modality:           s("x00080060"),
      bodyPart:           s("x00180015"),
      projection:         s("x00185100"),
      kvp:                s("x00180060"),
      ma:                 s("x00181151"),
      msec:               s("x00181150"),
      mas:                s("x00189332"),
      ei:                 s("x00181411"),
    };
  } catch (e) {
    console.warn("[dicom-overlay] read failed", e);
    return null;
  }
}
