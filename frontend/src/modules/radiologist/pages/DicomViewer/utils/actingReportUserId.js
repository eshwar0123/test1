// When a Technician opens the report editor, the report must be read/written
// as the ASSIGNED RADIOLOGIST (same case + radiologist user_id) so it shows
// their last saved draft and is signed by them. technician/utils/openCaseInEditor.js
// stores that id in sessionStorage; it only applies to technician sessions.
export function actingReportUserId() {
  try {
    const role = String(JSON.parse(localStorage.getItem("auth") || "{}").role || "").toLowerCase();
    if (role !== "technician") return null;
    return sessionStorage.getItem("report_as_user_id") || null;
  } catch {
    return null;
  }
}

