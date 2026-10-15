// Opens a case in the radiologist DICOM viewer / report editor, exactly the
// way the radiologist worklist (repository_1.js openViewer) does. The scan row
// comes from /technician/scan/{case_id}, which checks the case belongs to the
// technician's organization.
import { readToken } from "./reportDownloads";

export async function openCaseInEditor(navigate, caseId, fallback = {}) {
  // Fullscreen must be requested synchronously from the click gesture.
  try {
    if (!document.fullscreenElement) {
      const root = document.documentElement;
      const fn = root.requestFullscreen || root.webkitRequestFullscreen;
      fn?.call(root)?.catch?.(() => {});
    }
  } catch { /* fullscreen is optional */ }

  const tok = readToken();
  const headers = tok ? { Authorization: `Bearer ${tok}` } : {};

  const res = await fetch(`/api/technician/scan/${encodeURIComponent(caseId)}`, { headers });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.detail || `Could not open case (HTTP ${res.status})`);
  }
  const s = json.data;

  // The report is read/written as the ASSIGNED RADIOLOGIST so it is signed by
  // them and shows their last saved draft (see radiologist/.../actingReportUserId.js).
  if (!s.report_user_id) {
    throw new Error("No radiologist is assigned to this case yet, so there is no report to edit.");
  }
  try { sessionStorage.setItem("report_as_user_id", String(s.report_user_id)); } catch { /* ignore */ }

  let fileUrl = s.file_url || "";
  let seriesFiles = null;
  const s3Key = s.s3_key || null;
  const storageType = s.storage_type || "local";

  // S3-stored studies need presigned URLs (same as the radiologist worklist).
  if (storageType === "s3" && s3Key) {
    try {
      const lower = s3Key.toLowerCase();
      const isNiftiKey = lower.endsWith(".nii") || lower.endsWith(".nii.gz");
      if (!isNiftiKey) {
        const prefix = s3Key.substring(0, s3Key.lastIndexOf("/") + 1);
        const sr = await fetch(`/api/storage/presigned-series?prefix=${encodeURIComponent(prefix)}`, { headers });
        const sd = await sr.json();
        if (sd?.urls?.length > 0) {
          seriesFiles = sd.urls.map((u) => u.url);
          fileUrl = sd.urls[0].url;
        } else {
          const one = await fetch(`/api/storage/download-url?s3_key=${encodeURIComponent(s3Key)}`, { headers });
          const od = await one.json();
          if (od?.url) fileUrl = od.url;
        }
      } else {
        const one = await fetch(`/api/storage/download-url?s3_key=${encodeURIComponent(s3Key)}`, { headers });
        const od = await one.json();
        if (od?.url) fileUrl = od.url;
      }
    } catch (e) {
      console.error("[technician] S3 presigned URL fetch failed", e);
    }
  }

  const lowUrl = (fileUrl || "").toLowerCase();
  const rawPath = lowUrl.split("?")[0];
  const lowKey = (s3Key || "").toLowerCase();
  const isNifti =
    rawPath.endsWith(".nii") || rawPath.endsWith(".nii.gz") ||
    lowKey.endsWith(".nii") || lowKey.endsWith(".nii.gz");
  const isSeries =
    (Array.isArray(seriesFiles) && seriesFiles.length > 0) ||
    lowUrl.includes("/dicom-series/") || lowUrl.includes("/bulk-series/") ||
    (storageType === "s3" && !!s3Key && !isNifti);

  navigate(isSeries && !isNifti ? "/radiologist/dcmviewer-cpu" : "/radiologist/dcmviewer", {
    state: {
      fileUrl,
      filename: null,
      seriesFiles,
      patientName: s.patient_name || fallback.patientName,
      patientAge: s.patient_age ?? fallback.age,
      patientSex: s.patient_sex ?? fallback.sex,
      caseId: s.case_id,
      clientId: "",
      priority: String(s.priority || "routine").toLowerCase(),
      status: s.status || "pending",
      study: s.study || fallback.study || "",
      modality: s.scan_type || fallback.modality || "",
      referredBy: "Dr. —",
      location: "-",
      waitMins: 20,
      history: s.history || "",
      // open straight into the report editor (no viewer) - see Dicomviewer.js reportOnly
      reportOnly: true,
    },
  });
}
