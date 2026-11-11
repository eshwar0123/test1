// Age of a patient when the scanner wrote it at the end of the patient name,
// e.g. "AISHWARIYA KHURANA 33/F", "NARENDER KUMAR 34Y/M", "RAMESH 45", "SITA (28 F)".
// Mirrors backend/machine_ingest/dicom_meta.py:age_from_patient_name.
//
// The number has to stand apart from the name (start / space / comma / bracket before it), so a
// digit that belongs to the name itself ("TEST1") is never read as an age.
const NAME_AGE_RE =
  /(?:^|[\s,(\-_])(\d{1,3})\s*(?:Y(?:RS?|EARS?)?)?\s*(?:[/\-]?\s*(?:MALE|FEMALE|M|F|O))?\s*\)?\s*$/i;

export function ageFromPatientName(name) {
  const s = String(name ?? "").replace(/\^/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const m = NAME_AGE_RE.exec(s);
  if (!m) return null;
  const age = parseInt(m[1], 10);
  return age >= 1 && age <= 120 ? age : null;
}

// The age to show for a patient: the stored age when it is a real value (> 0), otherwise the age
// written after the patient name, otherwise undefined (so the viewer shows nothing, not "0").
export function resolvePatientAge(storedAge, patientName) {
  const n = parseInt(String(storedAge ?? "").replace(/y$/i, ""), 10);
  if (Number.isFinite(n) && n > 0) return n;
  return ageFromPatientName(patientName) ?? undefined;
}

