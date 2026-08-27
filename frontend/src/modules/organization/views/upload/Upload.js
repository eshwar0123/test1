import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";                    // npm i xlsx
import "./Upload.css";
import "./Upload.modal.css";                     // new — provided in 06_Upload_additions.css

/* -----------------------------------------------------------
 * Backend wiring
 * --------------------------------------------------------- */
// Works in both Vite (import.meta.env.VITE_API_BASE) and CRA (process.env.REACT_APP_API_BASE).
// `typeof` guards keep whichever bundler you're NOT on from throwing at load time.
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env &&
    (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE)) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE) ||
  "";

const authHeaders = () => {
  // 1. Try every common raw-token key
  let tok =
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("jwt") ||
    localStorage.getItem("idToken") ||
    sessionStorage.getItem("token") ||
    sessionStorage.getItem("access_token");

  // 2. Fallback — some apps store the token inside a JSON user/auth blob
  if (!tok) {
    for (const k of ["user", "auth", "authUser", "currentUser", "profile"]) {
      const raw = localStorage.getItem(k) || sessionStorage.getItem(k);
      if (!raw) continue;
      try {
        const p = JSON.parse(raw);
        tok = p.token || p.access_token || p.accessToken || p.jwt || p.idToken;
        if (tok) break;
      } catch { /* not JSON */ }
    }
  }
  return tok ? { Authorization: `Bearer ${tok}` } : {};
};

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...opts,
    headers: {
      ...(opts.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...authHeaders(),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${txt}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.blob();
}

/* -----------------------------------------------------------
 * File-matching logic  (Excel row  ↔  uploaded files)
 * --------------------------------------------------------- */
const IMAGE_EXT = /\.(dcm|nii|nii\.gz|png|jpe?g|mhd|raw|tiff?)$/i;

const stripExt = (n) => {
  const low = (n || "").toLowerCase();
  if (low.endsWith(".nii.gz")) return n.slice(0, -7);
  const dot = n.lastIndexOf(".");
  return dot > 0 ? n.slice(0, dot) : n;
};

/**
 * For each excel row (which has a `file_name` key such as "case-1" or "case-1.nii"),
 * pick the matching files out of `uploadedFiles`.
 * Matching rules, in order:
 *   1. Exact basename match            case-1.nii  == case-1.nii
 *   2. Folder/parent-folder match      case-1/*.dcm,  ".../case-1/**"
 *   3. Basename prefix match           case-1-1.dcm, case-1_2.dcm, case-10.dcm? NO (stops at non-separator)
 */
function matchExcelToFiles(rows, files) {
  // index files for quick lookup
  const byPath = files.map((f) => {
    const rel = f.webkitRelativePath || f.name;
    const parts = rel.split("/");
    return {
      file: f,
      rel,
      base: parts[parts.length - 1],
      parents: parts.slice(0, -1),   // folders
    };
  });

  const out = [];
  for (const row of rows) {
    if (!row.file_name) {
      out.push({ ...row, matched_files: [], _matchedFileObjs: [] });
      continue;
    }
    const raw = String(row.file_name).trim();
    const key = stripExt(raw).trim();
    const keyLow = key.toLowerCase();
    const rawLow = raw.toLowerCase();

    const matched = byPath.filter((x) => {
      const baseLow = x.base.toLowerCase();
      // 1. exact filename
      if (baseLow === rawLow) return true;
      // 2. inside a folder named exactly <key>
      if (x.parents.some((p) => p.toLowerCase() === keyLow)) return true;
      // 3. filename starts with <key> followed by a separator, then anything
      if (baseLow.startsWith(keyLow)) {
        const next = baseLow.charAt(keyLow.length);
        if (next === "" || next === "-" || next === "_" || next === ".") return true;
      }
      return false;
    })
    // only keep actual image files
    .filter((x) => IMAGE_EXT.test(x.base));

    out.push({
      ...row,
      matched_files: matched.map((m) => m.base),
      _matchedFileObjs: matched.map((m) => m.file),
    });
  }
  return out;
}

/* -----------------------------------------------------------
 * Excel parsing
 * --------------------------------------------------------- */
const HEADER_ALIASES = {
  subject_id:     ["subject_id", "subjectid", "subject id", "subject", "case_id", "caseid", "case id", "case"],
  priority:       ["priority", "priority_type"],
  patient_name:   ["patient_name", "patient name", "name"],
  age:            ["age"],
  gender:         ["gender", "sex"],
  modality:       ["modality", "modality_type"],
  study_type:     ["study_type", "study type", "modality_study_type"],
  study_date:     ["study_date", "study date", "date"],
  file_name:      ["image_file_name", "image file name", "file_name", "file name", "filename", "image"],
};

const canonKey = (k) => {
  const lk = String(k).trim().toLowerCase();
  for (const [canon, alts] of Object.entries(HEADER_ALIASES)) {
    if (alts.includes(lk)) return canon;
  }
  return null;
};

async function parseExcel(file) {
  const buf = await file.arrayBuffer();
  const wb  = XLSX.read(buf, { type: "array", cellDates: true });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });

  return raw.map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) {
      const canon = canonKey(k);
      if (canon) o[canon] = typeof v === "string" ? v.trim() : v;
    }
    if (o.study_date) {
      if (o.study_date instanceof Date) {
        // cellDates:true gave us a real Date object — use local parts to avoid UTC shift
        const d = o.study_date;
        o.study_date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      } else if (typeof o.study_date === 'string') {
        const s = o.study_date.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          // already ISO — keep as-is
        } else {
          // Handle M/D/YY, M/D/YYYY, DD-MM-YYYY etc.
          const slash = s.split('/');
          const dash  = s.split('-');
          const parts = slash.length === 3 ? slash : dash.length === 3 ? dash : null;
          if (parts) {
            let [a, b, c] = parts;
            // Determine if it's M/D/YY(YY) or DD-MM-YYYY
            if (c.length <= 2) c = '20' + c;   // "26" → "2026"
            if (c.length === 4) {
              // M/D/YYYY or D-M-YYYY → store as YYYY-MM-DD
              o.study_date = `${c}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`;
            }
          }
        }
      }
    }
    return o;
  }).filter((r) => r.subject_id);   // drop rows with no Subject_ID
}

/* -----------------------------------------------------------
 * Small UI helpers
 * --------------------------------------------------------- */
const SUPPORTED = ".dcm, .nii, .nii.gz, .png, .jpg, .mhd, .raw";

const statCardTone = { "Total Images": "accent", "Successful": "success", "Failed": "error" };

const prettyPriority = (p) => (p ? p.toString() : "-");
const prettyModality = (m) => (m ? m.toString().toUpperCase() : "-");

/* ==========================================================
 *                         MAIN
 * ========================================================== */
export default function Upload() {
  const navigate = useNavigate();
  const [guideOpen, setGuideOpen]   = useState(false);
  const [activeTab, setActiveTab]   = useState("records");
  const [uploadMode, setUploadMode] = useState("bulk");

  /* -------- Inline success/error banner (replaces alert popups) -------- */
  const [banner, setBanner] = useState(null);   // { type: "success"|"error", message: string }
  const showBanner = useCallback((type, message, ms = 6000) => {
    setBanner({ type, message });
    if (ms) setTimeout(() => setBanner(null), ms);
  }, []);

  /* -------- DB-backed patient records (right table) ------- */
  const [records, setRecords]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [search,  setSearch]        = useState("");

  /* -------- Returned cases (cases QC rejected) ------- */
  const [returnedCases, setReturnedCases] = useState([]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api("/organization/uploads");
      setRecords(d.items || []);
    } catch (e) {
      console.error("Failed to load uploads:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReturned = useCallback(async () => {
    try {
      const d = await api("/organization/returned-cases");
      setReturnedCases(d.items || []);
    } catch (e) {
      console.error("Failed to load returned cases:", e);
    }
  }, []);

  useEffect(() => { loadRecords(); loadReturned(); }, [loadRecords, loadReturned]);

  // Poll for QC updates while any case is still pending — keeps the status
  // badges fresh without the user hitting Refresh. Stops polling once no
  // rows are pending.
  useEffect(() => {
    const anyPending = records.some((r) => r.qc_status === "pending");
    if (!anyPending) return;
    const tid = setInterval(() => {
      loadRecords();
      loadReturned();
    }, 4000);
    return () => clearInterval(tid);
  }, [records, loadRecords, loadReturned]);

  /* -------- Single-patient form -------- */
  const [sp, setSp] = useState({
    subject_id: "", patient_name: "", age: "", gender: "",
    priority: "Routine", modality: "CT", study_type: "", study_date: "",
  });
  const [spFiles, setSpFiles] = useState([]);
  const [spSubmitting, setSpSubmitting] = useState(false);
  const spFilesInputRef  = useRef(null);
  const spFolderInputRef = useRef(null);

  const handleSpChange = (e) => setSp((s) => ({ ...s, [e.target.name]: e.target.value }));

  const applySpFiles = (picked) => {
    const result = picked.filter((f) => IMAGE_EXT.test(f.name));
    if (result.length === 0 && picked.length > 0) {
      showBanner("error", "No supported image files found. Accepted: " + SUPPORTED);
      return;
    }
    setSpFiles(result);
  };

  const handleSpFiles = (e) => applySpFiles(Array.from(e.target.files || []));

  const handleSpDrop = async (e) => {
    e.preventDefault();
    const items = Array.from(e.dataTransfer.items || []);
    let dropped = [];
    if (items.length && items[0].webkitGetAsEntry) {
      const entryResults = await Promise.all(
        items.filter((i) => i.kind === "file").map((i) => {
          const entry = i.webkitGetAsEntry?.();
          return entry ? readEntry(entry) : Promise.resolve([]);
        })
      );
      dropped = entryResults.flat();
    } else {
      dropped = Array.from(e.dataTransfer.files || []);
    }
    applySpFiles(dropped);
  };

  const handleSpSubmit = (e) => {
    e.preventDefault();
    if (!sp.subject_id.trim()) return showBanner("error", "Subject ID is required");

    // Build a preview row in the SAME shape as bulk rows, so the existing
    // handleBulkSubmit can batch it to /uploads/bulk-submit along with any
    // other pending rows. This unifies the flow: Single and Bulk both drop
    // into Patient Records, then user clicks Submit to push all to the DB.
    const matchedNames = spFiles.map((f) => f.name);
    const newRow = {
      subject_id:   sp.subject_id.trim(),
      patient_name: sp.patient_name || null,
      age:          sp.age ? Number(sp.age) : null,
      gender:       sp.gender || null,
      priority:     sp.priority || null,
      modality:     sp.modality || null,
      study_type:   sp.study_type || null,
      study_date:   sp.study_date || null,
      file_name:    matchedNames[0] || null,
      matched_files:    matchedNames,
      _matchedFileObjs: spFiles,   // File objects — required by handleBulkSubmit
    };

    // Dedup by subject_id — if user re-adds the same ID, replace the earlier entry
    setPreview((rows) => {
      const without = rows.filter((r) => r.subject_id !== newRow.subject_id);
      return [...without, newRow];
    });

    // Clear the form so user can add another one
    setSp({ subject_id: "", patient_name: "", age: "", gender: "",
            priority: "Routine", modality: "CT", study_type: "", study_date: "" });
    setSpFiles([]);
    setActiveTab("records");
    showBanner("success",
      `✓ Added ${newRow.subject_id} to Patient Records. Click Submit on the Patient Records tab to save to the database.`);
  };

  /* -------- Bulk upload preview state (NOT yet stored) -------- */
  const [excelFile, setExcelFile]   = useState(null);
  const [imageFiles, setImageFiles] = useState([]);   // array of File
  const [previewRows, setPreview]   = useState([]);   // matched rows ready to submit
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [uploadProgress, setProgress] = useState(0);

  // Duplicate detection — populated by an effect below whenever preview changes
  const [duplicateIds, setDuplicateIds] = useState(new Set());

  // Preview-row modal (view/edit a case BEFORE it's submitted)
  const [previewModal, setPreviewModal] = useState(null);   // { mode, row }

  const excelInputRef  = useRef(null);
  const folderInputRef = useRef(null);
  const filesInputRef  = useRef(null);

  // Case IDs are now server-generated (GENRAD-SUB-XXXXXX) so there is nothing
  // to pre-check for duplicates on the frontend. duplicateIds stays empty.

  // Mutate a single preview row in place (used by the Edit-preview modal)
  const updatePreviewRow = useCallback((subjectId, updates) => {
    setPreview((rows) =>
      rows.map((r) => (r.subject_id === subjectId ? { ...r, ...updates } : r))
    );
  }, []);

  const refreshPreview = useCallback((rows, files) => {
    if (!rows || rows.length === 0) { setPreview([]); return; }
    const matched = matchExcelToFiles(rows, files || []);
    setPreview(matched);
  }, []);

  const handleExcelPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setExcelFile(f);
    try {
      const rows = await parseExcel(f);
      if (rows.length === 0) {
        showBanner("error", "No usable rows found. Required column: Subject_ID");
        return;
      }
      refreshPreview(rows, imageFiles);
    } catch (err) {
      showBanner("error", "Failed to parse Excel: " + err.message);
    }
  };

  const handleFolderPick = (e) => {
    const picked = Array.from(e.target.files || []);
    setImageFiles(picked);
    if (excelFile) {
      parseExcel(excelFile).then((rows) => refreshPreview(rows, picked));
    }
  };

  const extractZipFiles = async (zipFile) => {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(zipFile);
    const promises = [];
    zip.forEach((relativePath, entry) => {
      if (entry.dir) return;
      const fileName = relativePath.split("/").pop();
      if (!IMAGE_EXT.test(fileName)) return;
      promises.push(
        entry.async("blob").then((blob) => {
          const file = new File([blob], fileName, { type: blob.type });
          try {
            Object.defineProperty(file, "webkitRelativePath", { value: relativePath, configurable: true });
          } catch (_) {}
          return file;
        })
      );
    });
    return Promise.all(promises);
  };

  const applyImageFiles = (files) => {
    setImageFiles(files);
    if (excelFile) {
      parseExcel(excelFile).then((rows) => refreshPreview(rows, files));
    }
  };

  const handleFilesPick = async (e) => {
    const picked = Array.from(e.target.files || []);
    const result = [];
    for (const f of picked) {
      if (f.name.toLowerCase().endsWith(".zip")) {
        try {
          const extracted = await extractZipFiles(f);
          if (extracted.length === 0) showBanner("error", `No supported image files found inside ${f.name}.`);
          result.push(...extracted);
        } catch (err) {
          showBanner("error", `Failed to extract ${f.name}: ${err.message}`);
        }
      } else if (IMAGE_EXT.test(f.name)) {
        result.push(f);
      }
    }
    if (result.length === 0 && picked.length > 0) {
      showBanner("error", "No supported image files selected. Accepted: .dcm, .nii, .nii.gz, .png, .jpg, .mhd, .raw, .zip");
      return;
    }
    applyImageFiles(result);
  };

  const readEntry = (entry) =>
    new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((f) => resolve([f]));
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const all = [];
        const readBatch = () => {
          reader.readEntries(async (batch) => {
            if (!batch.length) {
              const nested = await Promise.all(all.map(readEntry));
              resolve(nested.flat());
            } else {
              all.push(...batch);
              readBatch();
            }
          });
        };
        readBatch();
      } else {
        resolve([]);
      }
    });

  const handleImagesDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleImagesDrop = async (e) => {
    e.preventDefault();
    const items = Array.from(e.dataTransfer.items || []);
    let dropped = [];
    if (items.length && items[0].webkitGetAsEntry) {
      const entryResults = await Promise.all(
        items.filter((i) => i.kind === "file").map((i) => {
          const entry = i.webkitGetAsEntry?.();
          return entry ? readEntry(entry) : Promise.resolve([]);
        })
      );
      dropped = entryResults.flat();
    } else {
      dropped = Array.from(e.dataTransfer.files || []);
    }
    const result = [];
    for (const f of dropped) {
      if (f.name.toLowerCase().endsWith(".zip")) {
        try {
          const extracted = await extractZipFiles(f);
          result.push(...extracted);
        } catch (err) {
          showBanner("error", `Failed to extract ${f.name}: ${err.message}`);
        }
      } else {
        result.push(f);
      }
    }
    if (result.length === 0) {
      showBanner("error", "No supported image files found in the dropped items.");
      return;
    }
    applyImageFiles(result);
  };

  const resetBulk = () => {
    setExcelFile(null);
    setImageFiles([]);
    setPreview([]);
    setProgress(0);
    if (excelInputRef.current)  excelInputRef.current.value  = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
    if (filesInputRef.current)  filesInputRef.current.value  = "";
  };

  const handleBulkSubmit = async () => {
    if (previewRows.length === 0) return showBanner("error", "Nothing to submit. Load an Excel + image folder in the Bulk Upload panel first.");

    // Duplicate guard — mirrors the backend check but fails fast with a clear message
    if (duplicateIds.size > 0) {
      const list = Array.from(duplicateIds).join(", ");
      return showBanner(
        "error",
        `Cannot submit — Case ID(s) already exist: ${list}. Remove them or change the Case ID before submitting.`,
        10000
      );
    }

    setBulkSubmitting(true);
    setProgress(10);

    // Flatten all uniquely matched files across cases (one file may belong to only one case).
    const uniqueFiles = new Map();
    previewRows.forEach((r) => (r._matchedFileObjs || []).forEach((f) => {
      if (!uniqueFiles.has(f.name)) uniqueFiles.set(f.name, f);
    }));

    // JSON payload the backend expects
    const cases = previewRows.map((r) => ({
      subject_id:    r.subject_id,
      patient_name:  r.patient_name || null,
      age:           r.age ? Number(r.age) : null,
      gender:        r.gender || null,
      priority:      r.priority || null,
      modality:      r.modality || null,
      study_type:    r.study_type || null,
      study_date:    r.study_date || null,
      file_name:     r.file_name || null,
      matched_files: r.matched_files || [],
    }));

    try {
      const fd = new FormData();
      fd.append("cases", JSON.stringify(cases));
      if (excelFile) fd.append("excel", excelFile, excelFile.name);
      for (const f of uniqueFiles.values()) fd.append("files", f, f.name);

      setProgress(45);
      const d = await api("/organization/uploads/bulk-submit", { method: "POST", body: fd });
      setProgress(100);
      showBanner("success", `✓ Successfully submitted ${d.inserted} patient record${d.inserted === 1 ? "" : "s"} to the database.`);
      resetBulk();
      await loadRecords();
      setActiveTab("history");   // jump to History so user sees what was just saved
    } catch (err) {
      // Pull the backend's detail message out of the Error if it's a 409
      const msg = String(err.message || "");
      if (msg.includes("409")) {
        // Strip the "409 Conflict " prefix and parse the JSON body
        let nice = msg;
        const m = msg.match(/\{.*\}/);
        if (m) {
          try {
            const body = JSON.parse(m[0]);
            if (body.detail) nice = body.detail;
          } catch {}
        }
        showBanner("error", nice, 10000);
      } else {
        showBanner("error", "Bulk submit failed: " + msg);
      }
      setProgress(0);
    } finally {
      setBulkSubmitting(false);
    }
  };

  /* -------- Modal state (View / Edit) -------- */
  const [modal, setModal] = useState(null);     // { mode: "view"|"edit", row }

  const openView = (row) => setModal({ mode: "view", row });
  const openEdit = (row) => setModal({ mode: "edit", row });
  const closeModal = () => setModal(null);

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete case ${row.case_id}? This also removes its files.`)) return;
    try {
      await api(`/organization/uploads/${row.id}`, { method: "DELETE" });
      await loadRecords();
    } catch (err) {
      showBanner("error", "Delete failed: " + err.message);
    }
  };

  /* -------- Filtered preview rows (for Patient Records tab) -------- */
  const filteredPreview = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return previewRows;
    return previewRows.filter(
      (r) =>
        (r.subject_id || "").toLowerCase().includes(q) ||
        (r.patient_name || "").toLowerCase().includes(q)
    );
  }, [previewRows, search]);

  const removePreviewRow = (subjectId) => {
    setPreview((rows) => rows.filter((r) => r.subject_id !== subjectId));
  };

  /* -------- Filtered DB records (for search if we ever want it) -------- */
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        (r.case_id || "").toLowerCase().includes(q) ||
        (r.patient_name || "").toLowerCase().includes(q)
    );
  }, [records, search]);

  /* -------- Stat cards --------
   * After the v2 changes, failed cases are deleted from bulk_uploads and live
   * only in returnedCases. So accurate QC-based stats need both arrays.
   *   Successful  = rows with qc_status='pass'
   *   Pending     = rows with qc_status='pending' (QC still running)
   *   Warn        = rows with qc_status='warn' (some files erred, not all)
   *   Failed      = items in returnedCases (rejected + removed)
   * Total Patients / Total Images span both live and returned. */
  const stats = useMemo(() => {
    // After v11: failed cases stay in bulk_uploads (qc_status='error') AND
    // also get a row in returned_cases, so they appear in BOTH `records` and
    // `returnedCases`.  We dedupe by case_id so Total Patients / Total Images
    // count each case only once.
    const returnedIds = new Set(returnedCases.map((r) => r.case_id));
    const uniqueRecords = records.filter((r) => !returnedIds.has(r.case_id));

    const livePatients     = uniqueRecords.length;
    const returnedPatients = returnedCases.length;
    const totalPatients    = livePatients + returnedPatients;

    const liveImages     = uniqueRecords.reduce((s, r) => s + (r.image_file_names?.length || 0), 0);
    const returnedImages = returnedCases.reduce((s, r) => s + (r.image_file_names?.length || 0), 0);
    const totalImages    = liveImages + returnedImages;

    const passed  = records.filter((r) => r.qc_status === "pass").length;
    const warned  = records.filter((r) => r.qc_status === "warn").length;
    const failed  = returnedPatients;

    return [
      { label: "Total Patients", value: String(totalPatients) },
      { label: "Total Images",   value: totalImages.toLocaleString(), tone: "accent" },
      { label: "Successful",     value: String(passed),                tone: "success" },
      { label: "Rejected",       value: String(failed),                tone: "error" },
      ...(warned > 0
        ? [{ label: "Warnings",   value: String(warned),  tone: "warn" }]
        : []),
    ];
  }, [records, returnedCases]);

  /* ===================================================
   *                 RENDER
   * =================================================== */
  return (
    <div className="org-upload-page">

      {/* ── FLOATING TOAST (always visible, auto-dismisses) ── */}
      {banner && (
        <div className={`org-toast ${banner.type}`} role="status">
          <span className="org-toast-icon">
            {banner.type === "success" ? "✓" : "!"}
          </span>
          <span className="org-toast-message">{banner.message}</span>
          <button type="button" className="org-toast-close"
                  onClick={() => setBanner(null)} aria-label="Close">×</button>
        </div>
      )}

      {/* ── TOP SECTION ── */}
      <div className="org-upload-top">

        {/* LEFT */}
        <div className="org-upload-left">
          <section className="org-upload-card org-upload-card--bulk">

            <div className="org-upload-card-header org-upload-stack">
              <div className="org-upload-title-row">
                <span className="org-upload-title-icon">☁</span>
                <div>
                  <h2>Upload Patients</h2>
                  <p>Add individual patients or bulk-upload from a single workspace.</p>
                </div>
              </div>
              <button type="button" className="org-upload-link-btn"
                      onClick={() => setGuideOpen(true)}>! open docs</button>
            </div>

            {/* Mode tabs */}
            <div className="org-upload-mode-tabs">
              <button type="button"
                className={`org-upload-mode-tab ${uploadMode === "single" ? "active" : ""}`}
                onClick={() => setUploadMode("single")}>+ Single Patient</button>
              <button type="button"
                className={`org-upload-mode-tab ${uploadMode === "bulk" ? "active" : ""}`}
                onClick={() => setUploadMode("bulk")}>Bulk Upload</button>
            </div>

            {/* -------- SINGLE -------- */}
            {uploadMode === "single" && (
              <div className="org-upload-card-body">
                <form className="org-sp-form" onSubmit={handleSpSubmit}>
                  <div className="org-sp-row">
                    <div className="org-upload-form-group">
                      <label>Subject ID <span style={{ color: "#dc2626" }}>*</span></label>
                      <input className="org-upload-input" name="subject_id"
                             value={sp.subject_id} onChange={handleSpChange}
                             placeholder="e.g. SUB001" required />
                    </div>
                    <div className="org-upload-form-group">
                      <label>Patient Name</label>
                      <input className="org-upload-input" name="patient_name"
                             value={sp.patient_name} onChange={handleSpChange}
                             placeholder="Full name" />
                    </div>
                  </div>

                  <div className="org-sp-row">
                    <div className="org-upload-form-group">
                      <label>Age</label>
                      <input className="org-upload-input" name="age" type="number"
                             min="0" max="150" value={sp.age} onChange={handleSpChange} />
                    </div>
                    <div className="org-upload-form-group">
                      <label>Gender</label>
                      <select className="org-upload-input" name="gender"
                              value={sp.gender} onChange={handleSpChange}>
                        <option value="">-- Select --</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="org-sp-row">
                    <div className="org-upload-form-group">
                      <label>Priority</label>
                      <select className="org-upload-input" name="priority"
                              value={sp.priority} onChange={handleSpChange}>
                        <option value="Routine">Routine</option>
                        <option value="Urgent">Urgent</option>
                        <option value="STAT">STAT</option>
                      </select>
                    </div>
                    <div className="org-upload-form-group">
                      <label>Modality</label>
                      <select className="org-upload-input" name="modality"
                              value={sp.modality} onChange={handleSpChange}>
                        <option value="CT">CT</option>
                        <option value="MRI">MRI</option>
                        <option value="XRAY">XRAY</option>
                        <option value="US">US</option>
                        <option value="PET">PET</option>
                      </select>
                    </div>
                  </div>

                  <div className="org-sp-row">
                    <div className="org-upload-form-group">
                      <label>Study Type</label>
                      <input className="org-upload-input" name="study_type"
                             value={sp.study_type} onChange={handleSpChange}
                             placeholder="e.g. Head w/o Contrast" />
                    </div>
                    <div className="org-upload-form-group">
                      <label>Study Date</label>
                      <input className="org-upload-input" name="study_date" type="date"
                             value={sp.study_date} onChange={handleSpChange} />
                    </div>
                  </div>

                  <div className="org-upload-form-group">
                    <label>Image Files <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional)</span></label>
                    <input ref={spFilesInputRef} type="file" multiple
                           accept=".dcm,.nii,.nii.gz,.png,.jpg,.jpeg,.mhd,.raw"
                           style={{ display: "none" }}
                           onChange={handleSpFiles} />
                    <input ref={spFolderInputRef} type="file" multiple
                           /* @ts-ignore */ webkitdirectory="true" directory=""
                           style={{ display: "none" }}
                           onChange={handleSpFiles} />
                    <div className="org-sp-dropzone"
                         style={{ cursor: "pointer" }}
                         onClick={() => spFilesInputRef.current?.click()}
                         onDragOver={handleImagesDragOver}
                         onDrop={handleSpDrop}>
                      {spFiles.length > 0 ? (
                        <span className="org-sp-drop-selected">✓ {spFiles.length} file{spFiles.length > 1 ? "s" : ""} selected</span>
                      ) : (
                        <>
                          <span className="org-upload-drop-title" style={{ fontSize: 14 }}>Drop images here or click to browse</span>
                          <span className="org-upload-drop-hint">{SUPPORTED}</span>
                        </>
                      )}
                      <span className="org-upload-secondary-btn"
                            style={{ marginTop: 8 }}
                            onClick={(e) => { e.stopPropagation(); spFolderInputRef.current?.click(); }}>
                        Browse Folder
                      </span>
                    </div>
                  </div>

                  <button type="submit" className="org-upload-primary-btn">
                    + Add to Patient Records
                  </button>
                </form>
              </div>
            )}

            {/* -------- BULK -------- */}
            {uploadMode === "bulk" && (
              <div className="org-upload-card-body">
                <div className="org-upload-dropzone-grid">

                  {/* Excel dropzone */}
                  <div className="org-upload-form-group">
                    <label>1. Upload Metadata File (Excel)</label>
                    <label className="org-upload-dropzone org-drop-gradient-zone" style={{ cursor: "pointer" }}>
                      <input ref={excelInputRef} type="file" accept=".xlsx,.xls"
                             style={{ display: "none" }} onChange={handleExcelPick} />
                      <div className="org-upload-drop-icon">📊</div>
                      {excelFile ? (
                        <>
                          <div className="org-upload-drop-title">✓ {excelFile.name}</div>
                          <div className="org-upload-drop-hint">{previewRows.length} case(s) parsed</div>
                        </>
                      ) : (
                        <>
                          <div className="org-upload-drop-title">Drop Excel file here</div>
                          <div className="org-upload-drop-hint">.xlsx or .xls with patient metadata columns</div>
                        </>
                      )}
                      <span className="org-upload-secondary-btn" style={{ marginTop: 8 }}>Browse File</span>
                    </label>
                  </div>

                  {/* Folder/files dropzone */}
                  <div className="org-upload-form-group">
                    <label>2. Upload Images / ZIP</label>
                    {/* Inputs outside any label — only triggered by explicit clicks */}
                    <input ref={filesInputRef} type="file" multiple
                           style={{ display: "none" }} onChange={handleFilesPick} />
                    <input ref={folderInputRef} type="file" multiple
                           /* @ts-ignore */ webkitdirectory="true" directory=""
                           style={{ display: "none" }} onChange={handleFolderPick} />
                    <div
                      className="org-upload-dropzone org-drop-gradient-zone"
                      style={{ cursor: "pointer" }}
                      onClick={() => filesInputRef.current?.click()}
                      onDragOver={handleImagesDragOver}
                      onDrop={handleImagesDrop}
                    >
                      <div className="org-upload-drop-icon">📦</div>
                      {imageFiles.length > 0 ? (
                        <>
                          <div className="org-upload-drop-title">✓ {imageFiles.length} file(s) selected</div>
                          <div className="org-upload-drop-hint">Matched across {previewRows.filter(r => r.matched_files.length).length} case(s)</div>
                        </>
                      ) : (
                        <>
                          <div className="org-upload-drop-title">Click to select files or a ZIP archive</div>
                          <div className="org-upload-drop-hint">.zip · {SUPPORTED}</div>
                        </>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <span className="org-upload-secondary-btn">Browse Files / ZIP</span>
                        <span
                          className="org-upload-secondary-btn"
                          onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}>
                          Browse Folder
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview of matched cases (before submit) */}
                {previewRows.length > 0 && (
                  <div className="org-preview-box">
                    <div className="org-preview-head">
                      Preview — {previewRows.length} case(s) ready
                      <button type="button" className="org-upload-secondary-btn tiny"
                              onClick={resetBulk}>Clear</button>
                    </div>
                    <div className="org-preview-list">
                      {previewRows.map((r, i) => (
                        <div key={i} className={`org-preview-row ${r.matched_files.length === 0 ? "warn" : ""}`}>
                          <span className="org-upload-badge blue">{r.subject_id}</span>
                          <span className="org-preview-name">{r.patient_name || "—"}</span>
                          <span className="org-preview-meta">{prettyModality(r.modality)} · {prettyPriority(r.priority)}</span>
                          <span className="org-preview-files">
                            {r.matched_files.length > 0
                              ? `${r.matched_files.length} file(s)`
                              : "⚠ no files matched"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="org-upload-intro-panel">
                  <div className="org-upload-intro-label">Workspace Status</div>
                  <div className="org-upload-intro-title">Dataset intake console</div>
                  <p>Prepare metadata, verify folder structure, and review patient records from one clean upload workflow.</p>
                </div>

                <div className="org-upload-progress">
                  <div className="org-upload-progress-row">
                    <span>{bulkSubmitting ? "Uploading…" : "Ready to upload"}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="org-upload-progress-track">
                    <div className="org-upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>

                <button type="button" className="org-upload-primary-btn"
                        disabled={bulkSubmitting || previewRows.length === 0}
                        onClick={handleBulkSubmit}>
                  {bulkSubmitting ? "Submitting…" : "Upload Dataset"}
                </button>
              </div>
            )}
          </section>
        </div>

        {/* RIGHT — stat cards + patient table */}
        <div className="org-upload-right">
          <div className="org-upload-stats">
            {stats.map((card) => (
              <div key={card.label} className={`org-upload-stat ${card.tone || ""}`.trim()}>
                <div className="org-upload-stat-label">{card.label}</div>
                <div className="org-upload-stat-value">{card.value}</div>
              </div>
            ))}
          </div>

          <section className="org-upload-card org-upload-card--list">
            <div className="org-upload-tabs">
              <button type="button"
                      className={`org-upload-tab ${activeTab === "records" ? "active" : ""}`}
                      onClick={() => setActiveTab("records")}>Patient Records</button>
              <button type="button"
                      className={`org-upload-tab ${activeTab === "history" ? "active" : ""}`}
                      onClick={() => setActiveTab("history")}>History</button>
              <button type="button"
                      className={`org-upload-tab ${activeTab === "returned" ? "active" : ""}`}
                      onClick={() => setActiveTab("returned")}>
                Rejected
                {returnedCases.length > 0 && (
                  <span className="org-tab-badge">{returnedCases.length}</span>
                )}
              </button>
              <button type="button"
                      className={`org-upload-tab ${activeTab === "about" ? "active" : ""}`}
                      onClick={() => setActiveTab("about")}>About</button>
            </div>

            <div className="org-upload-card-body">
              {/* Prominent "ready to submit" bar — only appears when a preview is loaded */}
              {activeTab === "records" && previewRows.length > 0 && (
                <div className={`org-ready-bar ${duplicateIds.size > 0 ? "has-errors" : ""}`}>
                  <div className="org-ready-info">
                    <span className="org-ready-dot" />
                    {duplicateIds.size > 0 ? (
                      <span>
                        <strong style={{ color: "#991b1b" }}>
                          {duplicateIds.size} duplicate Case ID{duplicateIds.size === 1 ? "" : "s"}
                        </strong>
                        {" — "}
                        remove or rename: {Array.from(duplicateIds).join(", ")}
                      </span>
                    ) : (
                      <span>
                        <strong>{previewRows.length} patient record{previewRows.length === 1 ? "" : "s"}</strong>{" "}
                        ready to submit to the database
                      </span>
                    )}
                  </div>
                  <div className="org-ready-actions">
                    <button type="button" className="org-upload-secondary-btn small"
                            onClick={resetBulk} disabled={bulkSubmitting}>
                      Cancel
                    </button>
                    <button type="button" className="org-upload-primary-btn small"
                            onClick={handleBulkSubmit}
                            disabled={bulkSubmitting || duplicateIds.size > 0}
                            title={duplicateIds.size > 0
                              ? `Fix ${duplicateIds.size} duplicate Case ID(s) before submitting`
                              : undefined}>
                      {bulkSubmitting ? "Submitting…" : `Submit ${previewRows.length} record${previewRows.length === 1 ? "" : "s"}`}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "records" ? (
                <>
                  <div className="org-upload-toolbar">
                    <input className="org-upload-input" type="text"
                           placeholder="Search by Case ID or Name..."
                           value={search} onChange={(e) => setSearch(e.target.value)} />
                    <div className="org-upload-toolbar-actions">
                      <button type="button" className="org-upload-primary-btn small"
                              onClick={() => setUploadMode("single")}>+ Add Patient</button>
                      <button type="button" className="org-upload-secondary-btn small"
                              onClick={resetBulk}
                              disabled={previewRows.length === 0}
                              title="Clear the preview without saving">
                        Clear preview
                      </button>
                    </div>
                  </div>

                  {previewRows.length === 0 ? (
                    <div style={{ padding: "48px 24px", textAlign: "center", color: "#64748b" }}>
                      <div style={{ fontSize: 42, opacity: 0.4, marginBottom: 8 }}>📋</div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>No cases loaded yet</div>
                      <div style={{ fontSize: 12 }}>
                        Load an Excel file and image folder in the Bulk Upload panel.<br />
                        Parsed cases will appear here for review before you click Submit.<br />
                        Past uploads live in the <strong>History</strong> tab.
                      </div>
                    </div>
                  ) : (
                    <div className="org-upload-table-wrap org-upload-table-wrap--scroll">
                      <table className="org-upload-table">
                        <thead>
                          <tr>
                            <th>#</th><th>Subject ID</th><th>Patient Name</th>
                            <th>Age</th><th>Gender</th><th>Priority</th>
                            <th>Modality</th><th>Study Type</th>
                            <th>Study Date</th><th>Files</th><th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPreview.map((p, idx) => {
                            const fileCount = p.matched_files?.length || 0;
                            const warn      = fileCount === 0;
                            const duplicate = duplicateIds.has(p.subject_id);
                            const rowStyle = duplicate
                              ? { background: "#fef2f2", borderLeft: "3px solid #ef4444" }
                              : warn ? { background: "#fff7ed" } : undefined;
                            return (
                              <tr key={p.subject_id} style={rowStyle}>
                                <td className="org-upload-idx">{idx + 1}</td>
                                <td>
                                  <span className="org-upload-badge blue">{p.subject_id}</span>
                                  {duplicate && (
                                    <div style={{ fontSize: 10, color: "#991b1b", marginTop: 2, fontWeight: 600 }}>
                                      ⚠ Duplicate
                                    </div>
                                  )}
                                </td>
                                <td>{p.patient_name || "—"}</td>
                                <td>{p.age ?? "—"}</td>
                                <td>{p.gender || "—"}</td>
                                <td>{prettyPriority(p.priority)}</td>
                                <td>{prettyModality(p.modality)}</td>
                                <td>{p.study_type || "—"}</td>
                                <td>{p.study_date || "—"}</td>
                                <td>
                                  <span className={`org-upload-badge ${warn ? "" : "green"}`}
                                        style={warn ? { background: "#fed7aa", color: "#9a3412" } : undefined}>
                                    {warn ? "⚠ 0" : fileCount}
                                  </span>
                                </td>
                                <td>
                                  <div className="org-upload-action-row">
                                    <button type="button" className="org-upload-secondary-btn tiny"
                                            onClick={() => setPreviewModal({ mode: "view", row: p })}>
                                      View
                                    </button>
                                    <button type="button" className="org-upload-secondary-btn tiny"
                                            onClick={() => setPreviewModal({ mode: "edit", row: p })}>
                                      Edit
                                    </button>
                                    <button type="button" className="org-upload-danger-btn tiny"
                                            onClick={() => removePreviewRow(p.subject_id)}
                                            title="Remove from preview (does not touch DB)">
                                      Remove
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : activeTab === "history" ? (
                <HistoryContent
                  records={records}
                  loading={loading}
                  onView={(row) => navigate(`/organization/scan-view/${row.case_id}`)}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onRefresh={loadRecords}
                />
              ) : activeTab === "returned" ? (
                <ReturnedContent
                  items={returnedCases}
                  onAcknowledge={async (rid) => {
                    try {
                      await api(`/organization/returned-cases/${rid}/acknowledge`,
                                { method: "POST" });
                      await loadReturned();
                      showBanner("success", "Case marked as acknowledged.");
                    } catch (e) {
                      showBanner("error", "Acknowledge failed: " + e.message);
                    }
                  }}
                  onRefresh={loadReturned}
                />
              ) : (
                <AboutContent />
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ── GUIDE MODAL (unchanged) ── */}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}

      {/* ── VIEW / EDIT MODAL (saved DB rows) ── */}
      {modal && (
        <CaseModal
          row={modal.row}
          mode={modal.mode}
          onClose={closeModal}
          onSaved={async () => { await loadRecords(); closeModal(); }}
        />
      )}

      {/* ── PREVIEW CASE MODAL (unsaved rows) ── */}
      {previewModal && (
        <PreviewCaseModal
          row={previewModal.row}
          mode={previewModal.mode}
          onClose={() => setPreviewModal(null)}
          onSave={updatePreviewRow}
        />
      )}
    </div>
  );
}


/* ==========================================================
 *                 VIEW / EDIT MODAL
 * ========================================================== */
function CaseModal({ row, mode, onClose, onSaved }) {
  // History-side modal is view-only now (Edit was removed per v9 request).
  const navigate = useNavigate();
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState({
    case_id:      row.case_id      || "",
    patient_name: row.patient_name || "",
    age:          row.age ?? "",
    gender:       row.gender       || "",
    priority:     row.priority_type|| "",
    modality:     row.modality_type|| "",
    study_type:   row.modality_study_type || "",
    study_date:   row.study_date   || "",
  });
  const [fileList, setFileList] = useState(row.image_file_names || []);
  const [removed,  setRemoved]  = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(row.image_file_names?.[0] || null);
  const [saving, setSaving] = useState(false);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const fileUrl = (name) =>
    `${API_BASE}/organization/uploads/${row.id}/files/${encodeURIComponent(name)}`;

  const isImageFile = (name) => /\.(png|jpe?g)$/i.test(name || "");

  const removeFile = (name) => {
    setFileList((ls) => ls.filter((n) => n !== name));
    setRemoved((r) => [...r, name]);
    if (activeFile === name) {
      setActiveFile((av) => {
        const remaining = fileList.filter((n) => n !== name);
        return remaining[0] || null;
      });
    }
  };

  const addNewFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    setNewFiles((fs) => [...fs, ...picked]);
    setFileList((ls) => [...ls, ...picked.map((f) => f.name)]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Patch metadata + record removed files
      await api(`/organization/uploads/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({
          case_id:      form.case_id,
          patient_name: form.patient_name,
          age:          form.age ? Number(form.age) : null,
          gender:       form.gender,
          priority:     form.priority,
          modality:     form.modality,
          study_type:   form.study_type,
          study_date:   form.study_date,
          removed_files: removed,
        }),
      });
      // 2. Upload brand-new files (if any)
      if (newFiles.length > 0) {
        const fd = new FormData();
        newFiles.forEach((f) => fd.append("files", f, f.name));
        await api(`/organization/uploads/${row.id}/files`, { method: "POST", body: fd });
      }
      await onSaved();
    } catch (err) {
      alert("Save failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="org-modal-overlay" onClick={onClose}>
      <div className="org-modal" onClick={(e) => e.stopPropagation()}>
        <div className="org-modal-head">
          <div>
            <div className="org-upload-kicker">Case</div>
            <div className="org-modal-title">{row.case_id} — {row.patient_name || "Unnamed"}</div>
          </div>
          <div className="org-modal-head-actions">
            <button type="button" className="org-modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="org-modal-body">

          {/* LEFT: viewer */}
          <div className="org-modal-viewer">
            <div className="org-modal-filebar">
              {fileList.length === 0 && <em style={{ color: "#94a3b8" }}>No files.</em>}
              {fileList.map((name) => (
                <button key={name} type="button"
                        className={`org-modal-filechip ${activeFile === name ? "active" : ""}`}
                        onClick={() => setActiveFile(name)}
                        title={name}>
                  <span className="org-modal-filechip-name">{name}</span>
                  {isEdit && (
                    <span className="org-modal-filechip-x"
                          onClick={(e) => { e.stopPropagation(); removeFile(name); }}>×</span>
                  )}
                </button>
              ))}
            </div>

            <div className="org-modal-stage">
              {activeFile ? (
                isImageFile(activeFile) ? (
                  <img src={fileUrl(activeFile)} alt={activeFile}
                       className="org-modal-img" />
                ) : (
                  <div className="org-modal-dicom-placeholder">
                    <div style={{ fontSize: 42, opacity: 0.5 }}>🩻</div>
                    <div className="org-modal-dicom-name">{activeFile}</div>
                    <div className="org-modal-dicom-hint">
                      DICOM/NIfTI file — click below to open in ONIX viewer
                    </div>
                    <button
                      type="button"
                      className="org-upload-primary-btn small"
                      onClick={() => { onClose(); navigate(`/organization/scan-view/${row.case_id}`); }}
                      style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                           strokeLinejoin="round">
                        <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                      View in Scan Viewer
                    </button>
                  </div>
                )
              ) : (
                <div className="org-modal-dicom-placeholder">
                  <div style={{ opacity: 0.4 }}>No file selected</div>
                </div>
              )}
            </div>

            {isEdit && (
              <label className="org-modal-addfiles">
                <input type="file" multiple
                       accept=".dcm,.nii,.nii.gz,.png,.jpg,.jpeg,.mhd,.raw"
                       style={{ display: "none" }}
                       onChange={addNewFiles} />
                + Add more files
              </label>
            )}
          </div>

          {/* RIGHT: details */}
          <div className="org-modal-details">
            <div className="org-modal-detail-title">Patient & Case Details</div>

            {!isEdit ? (
              <dl className="org-modal-dl">
                <dt>Case ID</dt>      <dd>{row.case_id}</dd>
                <dt>Patient Name</dt> <dd>{row.patient_name || "—"}</dd>
                <dt>Age</dt>          <dd>{row.age ?? "—"}</dd>
                <dt>Gender</dt>       <dd>{row.gender || "—"}</dd>
                <dt>Priority</dt>     <dd>{row.priority_type || "—"} {row.priority_type_id ? `(#${row.priority_type_id})` : ""}</dd>
                <dt>Modality</dt>     <dd>{row.modality_type || "—"} {row.modality_type_id ? `(#${row.modality_type_id})` : ""}</dd>
                <dt>Study Type</dt>   <dd>{row.modality_study_type || "—"} {row.modality_study_type_id ? `(#${row.modality_study_type_id})` : ""}</dd>
                <dt>Study Date</dt>   <dd>{row.study_date || "—"}</dd>
                <dt>Uploaded</dt>     <dd>{row.uploaded_at || "—"}</dd>
                <dt>Images Path</dt>  <dd style={{ fontSize: 11, color: "#64748b", wordBreak: "break-all" }}>{row.uploaded_images_path || "—"}</dd>
                <dt>Subject ID</dt>   <dd style={{ fontSize: 11, color: "#64748b" }}>{row.subject_id || "—"}</dd>
              </dl>
            ) : (
              <div className="org-modal-editform">
                <EditField label="Case ID"      name="case_id"      value={form.case_id}      onChange={onChange} />
                <EditField label="Patient Name" name="patient_name" value={form.patient_name} onChange={onChange} />
                <EditField label="Age"          name="age"          value={form.age}          onChange={onChange} type="number" />
                <EditSelect label="Gender"      name="gender"       value={form.gender}       onChange={onChange}
                            options={["", "Male", "Female", "Other"]} />
                <EditSelect label="Priority"    name="priority"     value={form.priority}     onChange={onChange}
                            options={["", "Routine", "Urgent", "STAT"]} />
                <EditSelect label="Modality"    name="modality"     value={form.modality}     onChange={onChange}
                            options={["", "CT", "MRI", "XRAY", "US", "PET"]} />
                <EditField label="Study Type"   name="study_type"   value={form.study_type}   onChange={onChange}
                           placeholder="e.g. Head w/o Contrast" />
                <EditField label="Study Date"   name="study_date"   value={form.study_date}   onChange={onChange} type="date" />
              </div>
            )}

            {isEdit && (
              <div className="org-modal-footer">
                <button type="button" className="org-upload-secondary-btn small" onClick={onClose}>Cancel</button>
                <button type="button" className="org-upload-primary-btn small"
                        onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Finish"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const EditField = ({ label, name, value, onChange, type="text", placeholder }) => (
  <div className="org-upload-form-group">
    <label>{label}</label>
    <input className="org-upload-input" name={name} type={type}
           value={value ?? ""} onChange={onChange} placeholder={placeholder} />
  </div>
);

const EditSelect = ({ label, name, value, onChange, options }) => (
  <div className="org-upload-form-group">
    <label>{label}</label>
    <select className="org-upload-input" name={name} value={value || ""} onChange={onChange}>
      {options.map((o) => <option key={o} value={o}>{o || "-- Select --"}</option>)}
    </select>
  </div>
);


/* ==========================================================
 *                 GUIDE MODAL (same as before)
 * ========================================================== */
function GuideModal({ onClose }) {
  return (
    <div className="org-upload-guide-overlay" onClick={onClose}>
      <div className="org-upload-guide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="org-upload-guide-banner">
          <div>
            <div className="org-upload-kicker">Upload Guide</div>
            <div className="org-upload-guide-title">Bulk Upload Form Help</div>
          </div>
          <button type="button" className="org-upload-guide-close" onClick={onClose}>×</button>
        </div>
        <div className="org-upload-guide-content">
          <div className="org-guide-section-title">Form Fields</div>
          <ul className="org-upload-guide-list">
            <li><strong>Upload Metadata File (Excel):</strong> one <code>.xlsx</code> or <code>.xls</code> with patient metadata.</li>
            <li><strong>Upload Image Folder:</strong> an uncompressed folder with case-wise image files.</li>
            <li><strong>Supported files:</strong> <code>.dcm, .nii, .nii.gz, .png, .jpg, .mhd, .raw</code></li>
          </ul>

          <div className="org-guide-section-title">Matching rules</div>
          <p className="org-guide-hint">
            Each Excel row's <code>Image_File_Name</code> becomes the match key.
            Files match if they are: (1) the same filename, (2) inside a folder with that exact name,
            or (3) a filename that starts with the key followed by <code>-</code>, <code>_</code>, or <code>.</code>
          </p>
          <pre className="org-upload-code-block">{`Excel: file_name = "case-1"
Matches: case-1.nii, case-1.dcm,
         case-1/slice-001.dcm,
         case-1-1.dcm, case-1-2.dcm, …`}</pre>

          <div className="org-guide-section-title">Excel columns</div>
          <div className="org-guide-chips">
            {["Subject_ID","Priority","Patient_Name","Age","Gender","Modality","Study_Type","Study_Date","Image_File_Name"].map(c => (
              <span key={c} className="org-guide-chip">{c}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutContent() {
  return (
    <div className="org-upload-about">
      <div className="org-upload-about-section">
        <h3>📦 About This Module</h3>
        <p>The Bulk Upload module imports large patient datasets — structured metadata from Excel
           combined with medical image folders (DICOM, NIfTI, PNG, etc.) in one workflow.</p>
      </div>
      <div className="org-upload-about-grid">
        <div className="org-upload-about-item"><div className="org-upload-about-item-label">Module Version</div><div className="org-upload-about-item-value">v2.5.0</div></div>
        <div className="org-upload-about-item"><div className="org-upload-about-item-label">Last Updated</div><div className="org-upload-about-item-value">Apr 2026</div></div>
        <div className="org-upload-about-item"><div className="org-upload-about-item-label">Max File Size</div><div className="org-upload-about-item-value">10 GB</div></div>
        <div className="org-upload-about-item"><div className="org-upload-about-item-label">Batch Limit</div><div className="org-upload-about-item-value">5,000 rows</div></div>
      </div>
      <div className="org-upload-about-section">
        <h3>🗂 Supported Formats</h3>
        <div className="org-upload-about-chips">
          {[".dcm", ".nii", ".nii.gz", ".png", ".jpg", ".mhd", ".raw", ".xlsx", ".xls"].map((f) => (
            <span key={f} className="org-upload-chip">{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ==========================================================
 *                    HISTORY TAB
 *   Groups saved DB rows by upload_id into collapsible batches.
 *   Each batch shows: when it was uploaded, how many cases,
 *   whether it came from an Excel, and a per-case summary with
 *   View / Edit / Delete actions.
 * ========================================================== */
function HistoryContent({ records, loading, onView, onEdit, onDelete, onRefresh }) {
  const batches = useMemo(() => {
    const map = new Map();
    for (const r of records) {
      const key = r.upload_id || `single-${r.id}`;
      if (!map.has(key)) {
        map.set(key, {
          upload_id:   r.upload_id,
          uploaded_at: r.uploaded_at,
          excel_path:  r.uploaded_excel_file_path,
          cases:       [],
        });
      }
      map.get(key).cases.push(r);
    }
    return Array.from(map.values()).sort(
      (a, b) => (b.uploaded_at || "").localeCompare(a.uploaded_at || "")
    );
  }, [records]);

  const fmtDate = (s) => {
    if (!s) return "—";
    try { return new Date(s).toLocaleString(); } catch { return s; }
  };

  const totalCases = records.length;
  const totalImages = records.reduce((s, r) => s + (r.image_file_names?.length || 0), 0);

  return (
    <>
      <div className="org-upload-toolbar">
        <div style={{ color: "#475569", fontSize: 13 }}>
          {totalCases > 0
            ? <>📚 {batches.length} upload batch{batches.length === 1 ? "" : "es"} · {totalCases} case{totalCases === 1 ? "" : "s"} · {totalImages} image{totalImages === 1 ? "" : "s"}</>
            : "No uploads yet"}
        </div>
        <div className="org-upload-toolbar-actions">
          <button type="button" className="org-upload-secondary-btn small"
                  onClick={onRefresh} disabled={loading}>
            {loading ? "..." : "Refresh"}
          </button>
        </div>
      </div>

      {loading && batches.length === 0 ? (
        <div style={{ padding: 24, color: "#64748b" }}>Loading history…</div>
      ) : batches.length === 0 ? (
        <div style={{ padding: "48px 24px", textAlign: "center", color: "#64748b" }}>
          <div style={{ fontSize: 42, opacity: 0.4, marginBottom: 8 }}>🗂️</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No upload history yet</div>
          <div style={{ fontSize: 12 }}>
            Submit a bulk upload or add a single patient to populate this view.
          </div>
        </div>
      ) : (
        <div className="org-history">
          {batches.map((b, idx) => {
            const excelName = b.excel_path ? b.excel_path.split("/").pop() : null;
            return (
              <details key={b.upload_id || idx} className="org-history-batch" open={idx === 0}>
                <summary className="org-history-summary">
                  <span className="org-history-badge">
                    {excelName ? "BULK" : "SINGLE"}
                  </span>
                  <span className="org-history-date">{fmtDate(b.uploaded_at)}</span>
                  <span className="org-history-count">{b.cases.length} case(s)</span>
                  {excelName && (
                    <span className="org-history-excel" title={b.excel_path}>
                      📄 {excelName}
                    </span>
                  )}
                </summary>

                <div className="org-history-table-wrap">
                <table className="org-upload-table org-history-table">
                  <thead>
                    <tr>
                      <th>Case ID</th>
                      <th>Patient</th>
                      <th>Modality</th>
                      <th>Study Type</th>
                      <th>Images</th>
                      <th>QC</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.cases.map((c) => (
                      <tr key={c.id}>
                        <td><span className="org-upload-badge blue">{c.case_id}</span></td>
                        <td>{c.patient_name || "—"}</td>
                        <td>{(c.modality_type || "—").toUpperCase()}</td>
                        <td>{c.modality_study_type || "—"}</td>
                        <td><span className="org-upload-badge green">{c.image_file_names?.length || 0}</span></td>
                        <td>
                          <QcBadge status={c.qc_status} summary={c.qc_summary} />
                        </td>
                        <td>
                          <div className="org-upload-action-row">
                            <button type="button" className="org-upload-secondary-btn tiny"
                                    onClick={() => onView(c)}>View</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ==========================================================
 *                    QC STATUS BADGE
 * ========================================================== */
function QcBadge({ status, summary }) {
  const cfg = {
    pending: { label: "⋯ Running",  className: "org-qc-badge qc-pending" },
    pass:    { label: "✓ Pass",     className: "org-qc-badge qc-pass" },
    warn:    { label: "! Warning",  className: "org-qc-badge qc-warn" },
    error:   { label: "✗ Failed",   className: "org-qc-badge qc-error" },
  };
  const c = cfg[status] || cfg.pending;
  return <span className={c.className} title={summary || ""}>{c.label}</span>;
}


/* ==========================================================
 *                    RETURNED CASES TAB
 *   Cases that failed QC and were returned to this org.
 * ========================================================== */
function ReturnedContent({ items, onAcknowledge, onRefresh }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: "#64748b" }}>
        <div style={{ fontSize: 42, opacity: 0.4, marginBottom: 8 }}>✅</div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>No rejected cases</div>
        <div style={{ fontSize: 12 }}>
          Cases that fail QC appear here so you can re-upload corrected files.
        </div>
      </div>
    );
  }

  const fmtDate = (s) => {
    if (!s) return "—";
    try { return new Date(s).toLocaleString(); } catch { return s; }
  };

  return (
    <div className="org-returned">
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          <strong style={{ color: "#991b1b" }}>{items.length}</strong> case(s) rejected by QC —
          review the reason and re-upload corrected files.
        </div>
        <button type="button" className="org-upload-secondary-btn small" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {items.map((it) => (
        <div key={it.returned_id}
             className={`org-returned-card ${it.status === "acknowledged" ? "ack" : ""}`}>
          <div className="org-returned-head">
            <div className="org-returned-title-row">
              <span className="org-upload-badge blue">{it.case_id}</span>
              <strong>{it.patient_name || "Unnamed"}</strong>
              <span className="org-returned-modality">
                {(it.modality_type || "").toUpperCase()} · {it.modality_study_type || "—"}
              </span>
            </div>
            <div className="org-returned-meta">
              Returned {fmtDate(it.returned_at)}
              {it.status === "acknowledged" && <span className="org-returned-ack"> · acknowledged</span>}
            </div>
          </div>

          <div className="org-returned-reason">
            <div className="org-returned-reason-label">Reason</div>
            <div className="org-returned-reason-text">{it.reason || "No reason recorded."}</div>
          </div>

          <div className="org-returned-files">
            <div className="org-returned-reason-label">Files ({it.image_file_names?.length || 0})</div>
            <div className="org-returned-filechips">
              {(it.image_file_names || []).slice(0, 6).map((fn) => (
                <span key={fn} className="org-returned-filechip">{fn}</span>
              ))}
              {(it.image_file_names || []).length > 6 && (
                <span className="org-returned-filechip">+{it.image_file_names.length - 6} more</span>
              )}
            </div>
          </div>

          {it.status !== "acknowledged" && (
            <div className="org-returned-actions">
              <button type="button" className="org-ack-btn"
                      onClick={() => onAcknowledge(it.returned_id)}>
                Acknowledge
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


/* ==========================================================
 *       PREVIEW CASE MODAL (for rows not yet in DB)
 *   Lightweight view/edit dialog for rows that have been
 *   parsed from Excel but not yet submitted. Unlike CaseModal,
 *   edits mutate local preview state, not the database.
 * ========================================================== */
function PreviewCaseModal({ row, mode, onClose, onSave }) {
  const [isEdit, setIsEdit] = useState(mode === "edit");
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [form, setForm] = useState({
    subject_id:   row.subject_id   || "",
    patient_name: row.patient_name || "",
    age:          row.age ?? "",
    gender:       row.gender       || "",
    priority:     row.priority     || "Routine",
    modality:     row.modality     || "CT",
    study_type:   row.study_type   || "",
    study_date:   row.study_date   || "",
  });
  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSave = () => {
    const patch = {
      ...form,
      age: form.age === "" || form.age == null ? null : Number(form.age),
    };
    onSave(row.subject_id, patch);
    onClose();
  };

  // Matched files — names only at preview stage (no blobs on disk yet)
  const matched = row.matched_files || [];
  const activeFile = matched[activeFileIdx] || null;

  return (
    <div className="org-modal-overlay" onClick={onClose}>
      <div className="org-modal" onClick={(e) => e.stopPropagation()}>
        <div className="org-modal-head">
          <div>
            <div className="org-upload-kicker">Preview {isEdit ? "— Editing" : ""}</div>
            <div className="org-modal-title">{row.subject_id} — {row.patient_name || "Unnamed"}</div>
          </div>
          <div className="org-modal-head-actions">
            {!isEdit && (
              <button type="button" className="org-upload-secondary-btn small"
                      onClick={() => setIsEdit(true)}>Edit</button>
            )}
            <button type="button" className="org-modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="org-modal-body">

          {/* LEFT: file list + placeholder viewer */}
          <div className="org-modal-viewer">
            <div className="org-modal-filebar">
              {matched.length === 0 ? (
                <div style={{ color: "#f87171", fontSize: 11, padding: "6px 4px" }}>
                  ⚠ No files matched
                </div>
              ) : matched.map((name, idx) => (
                <button key={name}
                        type="button"
                        className={`org-modal-filechip ${idx === activeFileIdx ? "active" : ""}`}
                        onClick={() => setActiveFileIdx(idx)}
                        title={name}>
                  <span className="org-modal-filechip-name">{name}</span>
                </button>
              ))}
            </div>

            <div className="org-modal-stage">
              {activeFile ? (
                <div className="org-modal-dicom-placeholder">
                  <div style={{ fontSize: 48, opacity: 0.6 }}>🫁</div>
                  <div className="org-modal-dicom-name">{activeFile}</div>
                  <div className="org-modal-dicom-hint">
                    File will be uploaded when you click Submit.
                    <br />
                    Preview &amp; QC happens after submission.
                  </div>
                </div>
              ) : (
                <div className="org-modal-dicom-placeholder">
                  <div style={{ fontSize: 42, opacity: 0.4 }}>📄</div>
                  <div className="org-modal-dicom-hint">
                    No matched files for this case.
                    <br />
                    Check the Excel <code>file_name</code> column and the image folder.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: details / edit form */}
          <div className="org-modal-details">
            <div className="org-modal-detail-title">Patient &amp; Case Details</div>
            {!isEdit ? (
              <dl className="org-modal-dl">
                <dt>Subject ID</dt>   <dd>{row.subject_id}</dd>
                <dt>Patient Name</dt> <dd>{row.patient_name || "—"}</dd>
                <dt>Age</dt>          <dd>{row.age ?? "—"}</dd>
                <dt>Gender</dt>       <dd>{row.gender || "—"}</dd>
                <dt>Priority</dt>     <dd>{row.priority || "—"}</dd>
                <dt>Modality</dt>     <dd>{(row.modality || "").toUpperCase() || "—"}</dd>
                <dt>Study Type</dt>   <dd>{row.study_type || "—"}</dd>
                <dt>Study Date</dt>   <dd>{row.study_date || "—"}</dd>
                <dt>File key</dt>     <dd style={{ fontFamily: "monospace" }}>{row.file_name || "—"}</dd>
                <dt>Matched files</dt><dd>{matched.length === 0
                                            ? <em style={{ color: "#c2410c" }}>⚠ no files matched</em>
                                            : `${matched.length} file${matched.length === 1 ? "" : "s"}`}</dd>
              </dl>
            ) : (
              <div className="org-modal-editform">
                <EditField  label="Subject ID"   name="subject_id"   value={form.subject_id}   onChange={onChange} />
                <EditField  label="Patient Name" name="patient_name" value={form.patient_name} onChange={onChange} />
                <EditField  label="Age"          name="age"          value={form.age}          onChange={onChange} type="number" />
                <EditSelect label="Gender"       name="gender"       value={form.gender}       onChange={onChange}
                            options={["", "Male", "Female", "Other"]} />
                <EditSelect label="Priority"     name="priority"     value={form.priority}     onChange={onChange}
                            options={["Routine", "Urgent", "STAT"]} />
                <EditSelect label="Modality"     name="modality"     value={form.modality}     onChange={onChange}
                            options={["CT", "MRI", "XRAY", "US", "PET"]} />
                <EditField  label="Study Type"   name="study_type"   value={form.study_type}   onChange={onChange}
                            placeholder="e.g. Head w/o Contrast" />
                <EditField  label="Study Date"   name="study_date"   value={form.study_date}   onChange={onChange} type="date" />
              </div>
            )}

            {isEdit ? (
              <div className="org-modal-footer">
                <button type="button" className="org-upload-secondary-btn small" onClick={onClose}>Cancel</button>
                <button type="button" className="org-upload-primary-btn small"
                        onClick={handleSave}>
                  Save changes
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: "auto", paddingTop: 10 }}>
                💡 Edits here only affect the preview — they go to the database when you click Submit.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
