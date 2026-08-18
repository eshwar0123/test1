import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './repository_1.css';
import { storeFile } from './fileStore';
import { generateThumbnail } from './thumbnailGenerator';

/* ─── Generate case ID ────────────────────────────────────────── */
const generateCaseId = () => {
  const d = new Date();
  const ds = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `CASE-${ds}-${rand}`;
};

/* Avatar color palette */
const AVATAR_COLORS = ['#ef4444','#6366f1','#f59e0b','#8b5cf6','#0ea5e9','#10b981','#f43f5e','#3b82f6','#a78bfa','#ec4899'];

const DATASET_ASSETS = import.meta.glob('../dataset/**/*', { eager: true, query: '?url', import: 'default' });

const toFrontendAssetUrl = (value) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (typeof window !== 'undefined') {
    return new URL(value, window.location.origin).toString();
  }
  return value;
};

const getDatasetAssetUrl = (suffix) => {
  const entry = Object.entries(DATASET_ASSETS).find(([path]) => path.endsWith(suffix));
  return entry ? toFrontendAssetUrl(entry[1]) : null;
};

const getDatasetSeriesUrls = (folderName) =>
  Object.entries(DATASET_ASSETS)
    .filter(([path]) => path.includes(`/${folderName}/`) && path.toLowerCase().endsWith('.dcm'))
    .map(([, url]) => toFrontendAssetUrl(url))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

/* ─── Sample worklist data (covers every filter) ──────────────── */
const INITIAL_CASES = [
  // STAT
  { id: 'CASE-20260326-1001', patientName: 'Amara Johnson',   initials: 'AJ', age: 67, sex: 'F', modality: 'CT',  study: 'Head CT – Rule out haemorrhage',      priority: 'stat',    status: 'pending',   waitMins: 135, referredBy: 'Dr. P. Menon',    location: 'ED Bay 2',    avatarBg: '#ef4444', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1002', patientName: 'David Chen',      initials: 'DC', age: 52, sex: 'M', modality: 'MR',  study: 'MRI Brain with Gadolinium',            priority: 'stat',    status: 'reading',   waitMins: 210, referredBy: 'Dr. S. Rao',      location: 'Neuro ICU',   avatarBg: '#6366f1', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1003', patientName: 'Linda Okafor',    initials: 'LO', age: 55, sex: 'F', modality: 'CT',  study: 'CT Chest – PE Protocol',               priority: 'stat',    status: 'pending',   waitMins: 62,  referredBy: 'Dr. V. Kumar',    location: 'ED Bay 5',    avatarBg: '#f43f5e', fileUrl: null, filename: null },
  // URGENT
  { id: 'CASE-20260326-1004', patientName: 'Sarah Williams',  initials: 'SW', age: 34, sex: 'F', modality: 'XR',  study: 'Chest X-Ray PA & Lateral',             priority: 'urgent',  status: 'pending',   waitMins: 45,  referredBy: 'Dr. K. Patel',    location: 'Ward 4B',     avatarBg: '#f59e0b', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1005', patientName: 'Robert Martinez', initials: 'RM', age: 78, sex: 'M', modality: 'CT',  study: 'CT Abdomen & Pelvis with Contrast',    priority: 'urgent',  status: 'review',    waitMins: 88,  referredBy: 'Dr. L. Sharma',   location: 'Gen Surgery', avatarBg: '#8b5cf6', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1006', patientName: 'Thomas Brown',    initials: 'TB', age: 72, sex: 'M', modality: 'CT',  study: 'CT Head – Follow-up',                  priority: 'urgent',  status: 'reading',   waitMins: 95,  referredBy: 'Dr. P. Iyer',     location: 'Neurology',   avatarBg: '#ec4899', fileUrl: null, filename: null },
  // ROUTINE – Pending
  { id: 'CASE-20260326-1007', patientName: 'Emily Thompson',  initials: 'ET', age: 29, sex: 'F', modality: 'MR',  study: 'MRI Lumbar Spine',                     priority: 'routine', status: 'pending',   waitMins: 22,  referredBy: 'Dr. A. Singh',    location: 'Outpatient',  avatarBg: '#0ea5e9', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1008', patientName: 'Michael Nguyen',  initials: 'MN', age: 44, sex: 'M', modality: 'MR',  study: 'MRI Shoulder',                         priority: 'routine', status: 'pending',   waitMins: 10,  referredBy: 'Dr. R. Shah',     location: 'Orthopaedic', avatarBg: '#3b82f6', fileUrl: null, filename: null },
  // ROUTINE – In Review
  { id: 'CASE-20260326-1009', patientName: 'Priya Kapoor',    initials: 'PK', age: 41, sex: 'F', modality: 'CT',  study: 'CT Chest with Contrast',               priority: 'routine', status: 'reading',   waitMins: 30,  referredBy: 'Dr. N. Reddy',    location: 'Pulmonology', avatarBg: '#a78bfa', fileUrl: null, filename: null },
  // ROUTINE – Completed
  { id: 'CASE-20260326-1010', patientName: 'James Park',      initials: 'JP', age: 61, sex: 'M', modality: 'US',  study: 'Abdominal Ultrasound',                 priority: 'routine', status: 'completed', waitMins: 0,   referredBy: 'Dr. M. Nair',     location: 'Radiology',   avatarBg: '#10b981', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1011', patientName: 'Grace Lee',       initials: 'GL', age: 38, sex: 'F', modality: 'XR',  study: 'Knee X-Ray AP/Lateral',                priority: 'routine', status: 'completed', waitMins: 0,   referredBy: 'Dr. T. Gupta',    location: 'Orthopaedic', avatarBg: '#a78bfa', fileUrl: null, filename: null },
  // Extra modalities
  { id: 'CASE-20260326-1012', patientName: 'Arun Deshmukh',   initials: 'AD', age: 58, sex: 'M', modality: 'US',  study: 'Renal Doppler Ultrasound',             priority: 'routine', status: 'pending',   waitMins: 15,  referredBy: 'Dr. S. Joshi',    location: 'Nephrology',  avatarBg: '#14b8a6', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1013', patientName: 'Fatima Al-Rashid',initials: 'FA', age: 46, sex: 'F', modality: 'MR',  study: 'MRI Knee – Meniscal tear query',       priority: 'urgent',  status: 'pending',   waitMins: 50,  referredBy: 'Dr. B. Verma',    location: 'Sports Med',  avatarBg: '#f97316', fileUrl: null, filename: null },
  { id: 'CASE-20260326-1014', patientName: 'Carlos Rivera',   initials: 'CR', age: 33, sex: 'M', modality: 'XR',  study: 'Wrist X-Ray – Fracture query',         priority: 'routine', status: 'review',    waitMins: 40,  referredBy: 'Dr. H. Das',      location: 'Orthopaedic', avatarBg: '#64748b', fileUrl: null, filename: null },
];

const REAL_CASES = [
  { id: 'CASE-REAL-2001', clientId: 'CLIENT-001', patientName: 'Aarav Menon', initials: 'AM', age: 58, sex: 'M', modality: 'CT', study: 'Head CT Trauma Series', priority: 'stat', status: 'pending', waitMins: 26, referredBy: 'Dr. Shreya Nair', location: 'Emergency Unit', avatarBg: AVATAR_COLORS[0], fileUrl: 'local-dicom-series-head-ct', filename: 'Head_CT_dicom', seriesFiles: getDatasetSeriesUrls('Head_CT_dicom') },

  { id: 'CASE-REAL-2002', clientId: 'CLIENT-004', patientName: 'Nisha Varghese', initials: 'NV', age: 44, sex: 'F', modality: 'MRI', study: 'MRI Brain Contrast Review', priority: 'stat', status: 'reading', waitMins: 74, referredBy: 'Dr. Karthik Rao', location: 'Neuro Imaging', avatarBg: AVATAR_COLORS[1], fileUrl: getDatasetAssetUrl('/MRI_Brain_nifti.nii'), filename: 'MRI_Brain_nifti.nii' },

  { id: 'CASE-REAL-2003', clientId: 'CLIENT-002', patientName: 'Rahul Iyer', initials: 'RI', age: 63, sex: 'M', modality: 'CT', study: 'Pelvic CT Follow-up Series', priority: 'urgent', status: 'review', waitMins: 91, referredBy: 'Dr. Meera Joseph', location: 'Trauma Ward', avatarBg: AVATAR_COLORS[2], fileUrl: 'local-dicom-series-pelvic-ct', filename: 'pelvic_CT_dicom', seriesFiles: getDatasetSeriesUrls('pelvic_CT_dicom') },

  { id: 'CASE-REAL-2004', clientId: 'CLIENT-006', patientName: 'Sana Ali', initials: 'SA', age: 37, sex: 'F', modality: 'CT', study: 'CT Abdomen NIfTI Reconstruction', priority: 'urgent', status: 'pending', waitMins: 43, referredBy: 'Dr. Vivek Sharma', location: 'Abdominal Imaging', avatarBg: AVATAR_COLORS[3], fileUrl: getDatasetAssetUrl('/CT_Abdo_nifti.nii'), filename: 'CT_Abdo_nifti.nii' },

  { id: 'CASE-REAL-2005', clientId: 'CLIENT-003', patientName: 'Dhanush Prabhu', initials: 'DP', age: 49, sex: 'M', modality: 'CT', study: 'CT Brain NIfTI Review', priority: 'routine', status: 'completed', waitMins: 0, referredBy: 'Dr. Anita Kapoor', location: 'Radiology Core', avatarBg: AVATAR_COLORS[4], fileUrl: getDatasetAssetUrl('/CT_Brain_nifti.nii'), filename: 'CT_Brain_nifti.nii' },

  { id: 'CASE-REAL-2006', clientId: 'CLIENT-005', patientName: 'Megha Thomas', initials: 'MT', age: 31, sex: 'F', modality: 'MRI', study: 'MRI Head NIfTI Follow-up', priority: 'routine', status: 'pending', waitMins: 18, referredBy: 'Dr. Harish Patel', location: 'Outpatient Imaging', avatarBg: AVATAR_COLORS[5], fileUrl: getDatasetAssetUrl('/MRI_Head_nifti.nii'), filename: 'MRI_Head_nifti.nii' },
];

const CASE_ID_DISPLAY_MAP = {
  'CASE-REAL-2001': 'GENRAD-SUB-54634582',
  'CASE-REAL-2002': 'GENRAD-SUB-78291364',
  'CASE-REAL-2003': 'GENRAD-SUB-62847193',
  'CASE-REAL-2004': 'GENRAD-SUB-93745128',
  'CASE-REAL-2005': 'GENRAD-SUB-41826597',
  'CASE-REAL-2006': 'GENRAD-SUB-85317624',
};
const displayCaseId = (id) => CASE_ID_DISPLAY_MAP[id] || id;

const CLIENT_ID_DISPLAY_MAP = {
  'CLIENT-001': 'GENRAD-ORG-46425629',
  'CLIENT-002': 'GENRAD-ORG-71938425',
  'CLIENT-003': 'GENRAD-ORG-83629471',
  'CLIENT-004': 'GENRAD-ORG-52487136',
  'CLIENT-005': 'GENRAD-ORG-94725183',
  'CLIENT-006': 'GENRAD-ORG-37162859',
};
const displayClientId = (id) => CLIENT_ID_DISPLAY_MAP[id] || id;

const fmtWait = (mins) => {
  if (mins <= 0) return '—';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const toBackendScanType = (value) => {
  const v = String(value || '').toUpperCase().trim();
  if (v === 'MR') return 'MRI';
  if (v === 'XR') return 'XRAY';
  if (v === 'US') return 'ULTRASOUND';
  return v;
};

const normalizeModality = (value) => {
  const v = String(value || '').toUpperCase().trim();
  if (v === 'MR' || v === 'MRI') return 'MRI';
  if (v === 'CT') return 'CT';
  if (v === 'XR' || v === 'XRAY' || v === 'X-RAY') return 'X-Ray';
  return v;
};

const getCurrentUserId = () => {
  try {
    const auth = JSON.parse(localStorage.getItem('auth') || 'null');
    if (auth?.userId || auth?.user_id || auth?.id) {
      return auth.userId || auth.user_id || auth.id;
    }
  } catch {}

  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user?.userId || user?.user_id || user?.id) {
      return user.userId || user.user_id || user.id;
    }
  } catch {}

  return localStorage.getItem('user_id') || localStorage.getItem('userId') || null;
};

const statusLabel = (s) => {
  if (s === 'reading') return 'In Review';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/* ─── Group label ────────────────────────────────────────────── */
function GroupLabel({ label, color, count }) {
  return (
    <div className="r1-group-label" style={{ color }}>
      <span>{label} ({count})</span>
      <div className="r1-pg-line" />
    </div>
  );
}

/* ─── Generate a procedural scan-like thumbnail for sample cases ── */
const sampleThumbCache = {};
function getSampleThumb(caseId, modality) {
  if (sampleThumbCache[caseId]) return sampleThumbCache[caseId];
  const S = 80;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  // Seed from caseId for variety
  let seed = 0;
  for (let i = 0; i < caseId.length; i++) seed = ((seed << 5) - seed + caseId.charCodeAt(i)) | 0;
  const rng = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed & 0x7fffffff) / 0x7fffffff; };

  // Dark background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);

  if (modality === 'CT' || modality === 'MR' || modality === 'MRI') {
    // Simulate axial brain/body slice
    const cx = S / 2, cy = S / 2;
    // Outer body ellipse
    const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 34);
    grad.addColorStop(0, modality === 'CT' ? '#a0a0a0' : '#c0c0c0');
    grad.addColorStop(0.6, modality === 'CT' ? '#606060' : '#808080');
    grad.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 30 + rng() * 4, 26 + rng() * 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Inner structures
    for (let i = 0; i < 4; i++) {
      const r = 6 + rng() * 8;
      const a = rng() * Math.PI * 2;
      const d = 8 + rng() * 10;
      ctx.fillStyle = `rgba(${140 + rng() * 80},${140 + rng() * 80},${140 + rng() * 80},0.5)`;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, r * (0.6 + rng() * 0.4), rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (modality === 'XR') {
    // Simulate chest X-ray
    const cx = S / 2, cy = S / 2;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, S, S);
    // Body outline
    const grad = ctx.createRadialGradient(cx, cy - 4, 2, cx, cy, 36);
    grad.addColorStop(0, '#505050');
    grad.addColorStop(0.5, '#383838');
    grad.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 28, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    // Lung fields (dark areas)
    ctx.fillStyle = '#141414';
    ctx.beginPath(); ctx.ellipse(cx - 10, cy - 2, 9, 14, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 10, cy - 2, 9, 14, -0.1, 0, Math.PI * 2); ctx.fill();
    // Spine
    ctx.fillStyle = '#606060';
    ctx.fillRect(cx - 2, cy - 20, 4, 36);
  } else {
    // US — simulate ultrasound fan
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    const cx = S / 2, cy = 6;
    for (let a = -0.7; a < 0.7; a += 0.02) {
      for (let r = 10; r < 70; r += 1) {
        const v = (rng() * 40 + 10) * (1 - r / 80);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        const x = cx + Math.sin(a) * r;
        const y = cy + Math.cos(a) * r;
        if (x >= 0 && x < S && y >= 0 && y < S) {
          ctx.fillRect(x, y, 1.5, 1.5);
        }
      }
    }
  }

  sampleThumbCache[caseId] = canvas.toDataURL('image/png');
  return sampleThumbCache[caseId];
}

/* ─── Case card ──────────────────────────────────────────────── */
function CaseCard({ item, selected, onSelect }) {
  let cls = 'r1-case-card';
  if (item.priority === 'stat')    cls += ' r1-stat-card';
  if (item.priority === 'urgent')  cls += ' r1-urgent-card';
  if (item.priority === 'routine') cls += ' r1-routine-card';
  if (item.status   === 'reading') cls += ' r1-reading-card';
  if (selected)                    cls += ' r1-selected';

  const thumb = item.thumbnail || getSampleThumb(item.id, item.modality);

  return (
    <div className={cls} onClick={() => onSelect(item)}>
      <div className="r1-pt-avatar" style={{ background: '#000' }}>
        <img src={thumb} alt="" className="r1-avatar-thumb" />
      </div>
      <div className="r1-case-main">
        <div className="r1-case-id">{displayCaseId(item.id)}</div>
        <div className="r1-case-meta">
          <span>{item.age}y {item.sex}</span>
          <span className="r1-mod-badge">{item.modality}</span>
          <span>{item.study}</span>
        </div>
      </div>
      <div className="r1-case-right">
        <span className={`r1-pri-badge r1-pri-${item.priority}`}>{item.priority.toUpperCase()}</span>
        <span className={`r1-status-pill r1-status-${item.status}`}>{statusLabel(item.status)}</span>
        <span className="r1-case-wait">&#x23F1; {fmtWait(item.waitMins)}</span>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function Repository1() {
  const navigate = useNavigate();
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalityFilter, setModalityFilter] = useState('all');
  const [selectedCase, setSelectedCase]  = useState(null);
  const [reportOpen, setReportOpen] = useState(false);

  /* ─── Mark case as completed ─── */
  const markComplete = (caseId) => {
    setCases(prev => {
      const updated = prev.map(c => c.id === caseId ? { ...c, status: 'completed', waitMins: 0 } : c);
      // Persist uploaded cases
      const initialIds = new Set(REAL_CASES.map(c => c.id));
      const uploaded = updated.filter(c => !initialIds.has(c.id));
      try { sessionStorage.setItem('r1-uploaded-cases', JSON.stringify(uploaded)); } catch {}
      return updated;
    });
    setSelectedCase(prev => prev && prev.id === caseId ? { ...prev, status: 'completed', waitMins: 0 } : prev);
  };

  /* ─── Upload state ─── */
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);

  const [cases, setCases] = useState(() => [...REAL_CASES]);

  /* ─── Generate real thumbnails from dataset files on mount ─── */
  useEffect(() => {
    let cancelled = false;

    async function genThumbs() {
      const updates = {};

      for (const c of REAL_CASES) {
        if (c.thumbnail) continue; // already has one

        try {
          // DICOM series — use the middle .dcm file
          if (Array.isArray(c.seriesFiles) && c.seriesFiles.length > 0) {
            const midIdx = Math.floor(c.seriesFiles.length / 2);
            const url = c.seriesFiles[midIdx];
            if (url) {
              const res = await fetch(url);
              const blob = await res.blob();
              const file = new File([blob], 'slice.dcm');
              const thumb = await generateThumbnail(file);
              if (thumb) updates[c.id] = thumb;
            }
            continue;
          }

          // NIfTI — fetch the file URL
          const fileUrl = c.fileUrl;
          if (fileUrl && !fileUrl.startsWith('local-')) {
            const res = await fetch(fileUrl);
            const blob = await res.blob();
            const file = new File([blob], c.filename || 'scan.nii');
            const thumb = await generateThumbnail(file);
            if (thumb) updates[c.id] = thumb;
          }
        } catch (e) {
          console.warn(`Thumbnail gen failed for ${c.id}:`, e);
        }
      }

      if (!cancelled && Object.keys(updates).length > 0) {
        setCases(prev => prev.map(c => updates[c.id] ? { ...c, thumbnail: updates[c.id] } : c));
      }
    }

    genThumbs();
    return () => { cancelled = true; };
  }, []);

  const [uploadForm, setUploadForm] = useState({
    caseId: generateCaseId(),
    patientName: '', patientSex: '', patientAge: '',
    scanType: 'CT',
    priority: 'routine',
    study: '',
    referredBy: '',
    location: '',
    file: null,        // NIfTI
    dicomFile: null,   // Single DICOM
    folderFiles: null, // DICOM folder
  });
  const fileInputRef = useRef(null);
  const dicomInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const resetUploadForm = () => {
    setUploadForm({
      caseId: generateCaseId(),
      patientName: '', patientSex: '', patientAge: '',
      scanType: 'CT', priority: 'routine', study: '', referredBy: '', location: '',
      file: null, dicomFile: null, folderFiles: null,
    });
    if (fileInputRef.current)   fileInputRef.current.value = '';
    if (dicomInputRef.current)  dicomInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  /* ─── Handle upload — works locally (blob URL) + tries backend ─── */
  const handleUpload = useCallback(async () => {
    const hasNifti  = !!uploadForm.file;
    const hasDicom  = !!uploadForm.dicomFile;
    const hasFolder = uploadForm.folderFiles && uploadForm.folderFiles.length > 0;

    if (!uploadForm.patientName || !uploadForm.patientSex || !uploadForm.patientAge) {
      alert('Please provide Patient Name, Sex, and Age.');
      return;
    }
    if (!hasNifti && !hasDicom && !hasFolder) {
      alert('Please select a file (NIfTI, DICOM, or DICOM folder).');
      return;
    }

    setUploadLoading(true);

    // Determine the chosen file
    let chosenFile = null;
    let fname = '';
    if (hasNifti) {
      chosenFile = uploadForm.file;
      fname = chosenFile.name;
    } else if (hasDicom) {
      chosenFile = uploadForm.dicomFile;
      fname = chosenFile.name;
    } else if (hasFolder) {
      fname = 'DICOM Series';
    }

    // Store file in module-level store for the viewer to retrieve
    const localFileKey = `local-file-${uploadForm.caseId}`;
    if (chosenFile) {
      await storeFile(localFileKey, chosenFile);
    }

    // Generate a real scan-slice thumbnail from the file
    let thumbnail = null;
    if (chosenFile) {
      try { thumbnail = await generateThumbnail(chosenFile); } catch { /* ignore */ }
    }

    // Try backend upload (non-blocking — viewer works even if backend is down)
    let backendFileUrl = null;
    try {
      const userId = getCurrentUserId();

      const formData = new FormData();
      if (hasFolder) {
        Array.from(uploadForm.folderFiles).forEach(f => formData.append('files', f));
      } else if (hasDicom) {
        formData.append('file', uploadForm.dicomFile);
      } else {
        formData.append('file', uploadForm.file);
      }
      formData.append('case_id', uploadForm.caseId);
      formData.append('scan_type', toBackendScanType(uploadForm.scanType));
      formData.append('patient_name', uploadForm.patientName);
      formData.append('patient_sex', uploadForm.patientSex);
      formData.append('patient_age', uploadForm.patientAge);
      if (userId) {
        formData.append('user_id', userId);
      } else {
        console.warn('Upload API skipped user_id append: no current user id found in localStorage.');
      }

      const res = await fetch('http://localhost:8000/radiology/scans/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        backendFileUrl = data.file_url || data.fileUrl || null;
      } else {
        let detail = `Upload API failed (${res.status})`;
        try {
          const err = await res.json();
          detail = err?.detail ? `${detail}: ${JSON.stringify(err.detail)}` : detail;
        } catch {}
        console.warn(detail);
      }
    } catch {
      // Backend not available — that's OK, we'll use the local file store
    }

    const fileUrl = backendFileUrl || localFileKey;
    const initials = uploadForm.patientName.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();

    const newCase = {
      id: uploadForm.caseId,
      patientName: uploadForm.patientName,
      initials,
      age: parseInt(uploadForm.patientAge) || 0,
      sex: uploadForm.patientSex,
      modality: uploadForm.scanType,
      study: uploadForm.study || fname,
      priority: uploadForm.priority,
      status: 'pending',
      waitMins: 0,
      referredBy: uploadForm.referredBy || '—',
      location: uploadForm.location || '—',
      avatarBg: AVATAR_COLORS[cases.length % AVATAR_COLORS.length],
      fileUrl,
      filename: fname,
      thumbnail,
    };

    setCases(prev => {
      const updated = [newCase, ...prev];
      // Persist uploaded cases (those not in INITIAL_CASES) to sessionStorage
      const initialIds = new Set(REAL_CASES.map(c => c.id));
      const uploaded = updated.filter(c => !initialIds.has(c.id));
      try { sessionStorage.setItem('r1-uploaded-cases', JSON.stringify(uploaded)); } catch {}
      return updated;
    });
    setUploadOpen(false);
    resetUploadForm();
    setUploadLoading(false);
  }, [uploadForm, cases.length]);

  /* Open viewer — navigates to the DicomViewer route */
  const openViewer = (item) => {
    const fileUrl  = item.fileUrl  || null;
    const filename = item.filename || null;
    const isSeries = (Array.isArray(item.seriesFiles) && item.seriesFiles.length > 0) || (fileUrl || '').toLowerCase().includes('/dicom-series/');
    const isNifti  =
      (fileUrl  || '').toLowerCase().endsWith('.nii') ||
      (fileUrl  || '').toLowerCase().endsWith('.nii.gz') ||
      (filename || '').toLowerCase().endsWith('.nii') ||
      (filename || '').toLowerCase().endsWith('.nii.gz');

    const route = isSeries && !isNifti ? '/radiologist/dcmviewer-cpu' : '/radiologist/dcmviewer';

    navigate(route, {
      state: {
        fileUrl:     fileUrl,
        filename:    filename,
        seriesFiles: item.seriesFiles || null,
        patientName: item.patientName,
        patientAge:  item.age,
        patientSex:  item.sex,
        caseId:      item.id,
         clientId: item.clientId,
      // Clinical/workflow details
        priority:    item.priority,
        status:      item.status,
        study:       item.study,
        modality:    item.modality,
        referredBy:  item.referredBy,
        location:    item.location,
        waitMins:    item.waitMins,
      },
    });
  };

  /* Filtered list */
  const filtered = useMemo(() => {
    let next = cases;

    if (priorityFilter !== 'all') {
      next = next.filter(c => c.priority === priorityFilter);
    }

    if (statusFilter !== 'all') {
      next = next.filter(c => c.status === statusFilter);
    }

    if (modalityFilter !== 'all') {
      next = next.filter(c => normalizeModality(c.modality) === modalityFilter);
    }

    return next;
  }, [priorityFilter, statusFilter, modalityFilter, cases]);

  /* Grouped by priority */
  const grouped = useMemo(() => ({
    stat:    filtered.filter(c => c.priority === 'stat'),
    urgent:  filtered.filter(c => c.priority === 'urgent'),
    routine: filtered.filter(c => c.priority === 'routine'),
  }), [filtered]);

  const priorityOptions = [
    { value: 'all', label: 'All' },
    { value: 'stat', label: 'STAT' },
    { value: 'urgent', label: 'Urgent' },
    { value: 'routine', label: 'Routine' },
  ];
  const statusOptions = [
    { value: 'all', label: 'All' },
    { value: 'reading', label: 'In Review' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
  ];
  const modalityOptions = ['CT', 'MRI', 'X-Ray'];
  const isAllFilters =
    priorityFilter === 'all' &&
    statusFilter === 'all' &&
    modalityFilter === 'all';

  return (
    <div className="r1-shell">

      {/* ════════════════════════════════════════
          MAIN WORKLIST
      ════════════════════════════════════════ */}
      <main className="r1-worklist">
        <div className="r1-wl-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <div className="r1-wl-title">Case Worklist</div>
              <div className="r1-wl-sub">{filtered.length} case{filtered.length !== 1 ? 's' : ''} shown</div>
            </div>
          </div>
          <div className="r1-filter-bar">
            <button
              className={`r1-chip${isAllFilters ? ' r1-chip-active' : ''}`}
              onClick={() => {
                setPriorityFilter('all');
                setStatusFilter('all');
                setModalityFilter('all');
              }}
            >
              All
            </button>
            <div className="r1-chip-divider" />
            <div className={`r1-select-filter${priorityFilter !== 'all' ? ' r1-chip-active' : ''}`}>
              <span className="r1-select-filter-label">Priority</span>
              <select
                className="r1-select-filter-control"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                aria-label="Filter by priority"
              >
                {priorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={`r1-select-filter${statusFilter !== 'all' ? ' r1-chip-active' : ''}`}>
              <span className="r1-select-filter-label">Status</span>
              <select
                className="r1-select-filter-control"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={`r1-select-filter${modalityFilter !== 'all' ? ' r1-chip-active' : ''}`}>
              <span className="r1-select-filter-label">Modality</span>
              <select
                className="r1-select-filter-control"
                value={modalityFilter}
                onChange={(e) => setModalityFilter(e.target.value)}
                aria-label="Filter by modality"
              >
                <option value="all">All</option>
                {modalityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="r1-wl-body">
          {grouped.stat.length > 0 && (
            <>
              <GroupLabel label="STAT" color="var(--r1-error)" count={grouped.stat.length} />
              {grouped.stat.map(c => (
                <CaseCard key={c.id} item={c} selected={selectedCase?.id === c.id} onSelect={setSelectedCase} />
              ))}
            </>
          )}
          {grouped.urgent.length > 0 && (
            <>
              <GroupLabel label="URGENT" color="var(--r1-warning)" count={grouped.urgent.length} />
              {grouped.urgent.map(c => (
                <CaseCard key={c.id} item={c} selected={selectedCase?.id === c.id} onSelect={setSelectedCase} />
              ))}
            </>
          )}
          {grouped.routine.length > 0 && (
            <>
              <GroupLabel label="ROUTINE" color="var(--r1-text-muted)" count={grouped.routine.length} />
              {grouped.routine.map(c => (
                <CaseCard key={c.id} item={c} selected={selectedCase?.id === c.id} onSelect={setSelectedCase} />
              ))}
            </>
          )}
          {filtered.length === 0 && (
            <div className="r1-empty">
              {cases.length === 0
                ? 'No cases available.'
                : 'No cases match the selected filter.'}
            </div>
          )}
        </div>
      </main>

      {/* ════════════════════════════════════════
          RIGHT DETAIL PANEL
      ════════════════════════════════════════ */}
      <aside className="r1-detail">
        {!selectedCase ? (
          <div className="r1-detail-empty">
            <div className="r1-de-icon">&#x1F5C2;</div>
            <div className="r1-de-title">No case selected</div>
            <div className="r1-de-sub">Click a case in the worklist to view details and take action.</div>
          </div>
        ) : (
          <div className="r1-detail-content">
            {/* Header */}
            <div className="r1-detail-header">
              <div className="r1-dh-id">{displayCaseId(selectedCase.id)}</div>
              <div className="r1-dh-badges">
                <span className={`r1-pri-badge r1-pri-${selectedCase.priority}`}>{selectedCase.priority.toUpperCase()}</span>
                <span className={`r1-status-pill r1-status-${selectedCase.status}`}>{statusLabel(selectedCase.status)}</span>
                <span className="r1-mod-badge">{selectedCase.modality}</span>
              </div>
            </div>

            {/* Patient info */}
            <div className="r1-detail-section">
              <div className="r1-ds-label">Case Information</div>
              {[
        ['Client ID',     selectedCase.clientId ? displayClientId(selectedCase.clientId) : '—'],
                ['Age',          `${selectedCase.age} years`],
                ['Sex',          selectedCase.sex === 'M' ? 'Male' : 'Female'],
                ['Study',        selectedCase.study],
                ['Wait time',    fmtWait(selectedCase.waitMins)],
              ].map(([l, v]) => (
                <div key={l} className="r1-detail-row">
                  <span className="r1-dl">{l}</span>
                  <span className="r1-dv">{v}</span>
                </div>
              ))}
            </div>

            {/* Scan Preview */}
            <div className="r1-detail-section">
              <div className="r1-ds-label">Scan Preview</div>
              <div className="r1-scan-preview">
                <img src={selectedCase.thumbnail || getSampleThumb(selectedCase.id, selectedCase.modality)} alt="Scan preview" />
              </div>
            </div>

            {/* Actions */}
            <div className="r1-detail-actions">
              <button className="r1-btn-primary" onClick={() => openViewer(selectedCase)}>&#x25B6; Open Viewer</button>
              {selectedCase.status !== 'completed' ? (
                <button className="r1-btn-secondary r1-btn-complete" onClick={() => markComplete(selectedCase.id)}>&#x2713; Mark Complete</button>
              ) : (
                <div className="r1-completed-badge">&#x2705; Completed</div>
              )}
              <button className="r1-btn-secondary" onClick={() => setReportOpen(true)}>&#x1F4C4; View Report</button>
              <button className="r1-btn-secondary" onClick={() => setSelectedCase(null)}>&#x2715; Close</button>
            </div>
          </div>
        )}
      </aside>

      {/* ════════════════════════════════════════
          REPORT MODAL
      ════════════════════════════════════════ */}
      {reportOpen && selectedCase && (
        <div className="r1-modal-overlay" onClick={() => setReportOpen(false)}>
          <div className="r1-modal r1-report-modal" onClick={e => e.stopPropagation()}>
            <div className="r1-modal-header">
              <span className="r1-modal-title">Radiology Report</span>
              <button className="r1-modal-close" onClick={() => setReportOpen(false)}>&#x2715;</button>
            </div>
            <div className="r1-modal-body r1-report-body">
              {/* Report Header */}
              <div className="r1-rpt-header">
                <div className="r1-rpt-logo">ONIX AI</div>
                <div className="r1-rpt-facility">Department of Radiology</div>
              </div>
              <div className="r1-rpt-divider" />

              {/* Patient & Study Info */}
              <div className="r1-rpt-section">
                <div className="r1-rpt-row"><span className="r1-rpt-label">Patient Name</span><span className="r1-rpt-value">{selectedCase.patientName}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Case ID</span><span className="r1-rpt-value">{displayCaseId(selectedCase.id)}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Age / Sex</span><span className="r1-rpt-value">{selectedCase.age}Y / {selectedCase.sex === 'M' ? 'Male' : selectedCase.sex === 'F' ? 'Female' : 'Other'}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Modality</span><span className="r1-rpt-value">{selectedCase.modality}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Study</span><span className="r1-rpt-value">{selectedCase.study}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Referred By</span><span className="r1-rpt-value">{selectedCase.referredBy}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Location</span><span className="r1-rpt-value">{selectedCase.location}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Priority</span><span className="r1-rpt-value">{selectedCase.priority.toUpperCase()}</span></div>
                <div className="r1-rpt-row"><span className="r1-rpt-label">Status</span><span className="r1-rpt-value">{statusLabel(selectedCase.status)}</span></div>
              </div>
              <div className="r1-rpt-divider" />

              {/* Clinical History */}
              <div className="r1-rpt-section">
                <div className="r1-rpt-section-title">Clinical History</div>
                <div className="r1-rpt-text">Patient referred for {selectedCase.study}. Clinical correlation advised.</div>
              </div>
              <div className="r1-rpt-divider" />

              {/* Findings */}
              <div className="r1-rpt-section">
                <div className="r1-rpt-section-title">Findings</div>
                <div className="r1-rpt-text r1-rpt-placeholder">
                  No findings have been recorded yet. Open the viewer to analyze the scan and generate findings.
                </div>
              </div>
              <div className="r1-rpt-divider" />

              {/* Impression */}
              <div className="r1-rpt-section">
                <div className="r1-rpt-section-title">Impression</div>
                <div className="r1-rpt-text r1-rpt-placeholder">
                  Pending radiologist review.
                </div>
              </div>
              <div className="r1-rpt-divider" />

              {/* Signature */}
              <div className="r1-rpt-signature">
                <div className="r1-rpt-sig-line" />
                <div className="r1-rpt-sig-name">Reporting Radiologist</div>
                <div className="r1-rpt-sig-date">Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          UPLOAD MODAL
      ════════════════════════════════════════ */}
      {uploadOpen && (
        <div className="r1-modal-overlay" onClick={() => setUploadOpen(false)}>
          <div className="r1-modal" onClick={e => e.stopPropagation()}>
            <div className="r1-modal-header">
              <span className="r1-modal-title">Upload Radiology Scan</span>
              <button className="r1-modal-close" onClick={() => setUploadOpen(false)}>&#x2715;</button>
            </div>
            <div className="r1-modal-body">
              {/* Case ID */}
              <div className="r1-form-group">
                <label className="r1-form-label">Case ID</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="r1-form-input" type="text" value={uploadForm.caseId} readOnly />
                  <button className="r1-btn-secondary" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                    onClick={() => setUploadForm(prev => ({ ...prev, caseId: generateCaseId() }))}>
                    Regenerate
                  </button>
                </div>
              </div>

              {/* Patient Name */}
              <div className="r1-form-group">
                <label className="r1-form-label">Patient Name</label>
                <input className="r1-form-input" type="text" placeholder="e.g. John Doe"
                  value={uploadForm.patientName}
                  onChange={e => setUploadForm({ ...uploadForm, patientName: e.target.value })} />
              </div>

              {/* Sex */}
              <div className="r1-form-group">
                <label className="r1-form-label">Sex</label>
                <select className="r1-form-input" value={uploadForm.patientSex}
                  onChange={e => setUploadForm({ ...uploadForm, patientSex: e.target.value })}>
                  <option value="">Select</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
              </div>

              {/* Age */}
              <div className="r1-form-group">
                <label className="r1-form-label">Age</label>
                <input className="r1-form-input" type="number" min="0" max="120" placeholder="e.g. 45"
                  value={uploadForm.patientAge}
                  onChange={e => setUploadForm({ ...uploadForm, patientAge: e.target.value })} />
              </div>

              {/* Scan Type + Priority row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="r1-form-group">
                  <label className="r1-form-label">Modality</label>
                  <select className="r1-form-input" value={uploadForm.scanType}
                    onChange={e => setUploadForm({ ...uploadForm, scanType: e.target.value })}>
                    <option value="CT">CT</option>
                    <option value="MR">MR</option>
                    <option value="MRI">MRI</option>
                    <option value="XR">X-Ray</option>
                    <option value="US">Ultrasound</option>
                  </select>
                </div>
                <div className="r1-form-group">
                  <label className="r1-form-label">Priority</label>
                  <select className="r1-form-input" value={uploadForm.priority}
                    onChange={e => setUploadForm({ ...uploadForm, priority: e.target.value })}>
                    <option value="stat">STAT</option>
                    <option value="urgent">Urgent</option>
                    <option value="routine">Routine</option>
                  </select>
                </div>
              </div>

              {/* Study Description */}
              <div className="r1-form-group">
                <label className="r1-form-label">Study Description</label>
                <input className="r1-form-input" type="text" placeholder="e.g. CT Head – Rule out haemorrhage"
                  value={uploadForm.study}
                  onChange={e => setUploadForm({ ...uploadForm, study: e.target.value })} />
              </div>

              {/* Referred By + Location row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="r1-form-group">
                  <label className="r1-form-label">Referred By</label>
                  <input className="r1-form-input" type="text" placeholder="e.g. Dr. P. Menon"
                    value={uploadForm.referredBy}
                    onChange={e => setUploadForm({ ...uploadForm, referredBy: e.target.value })} />
                </div>
                <div className="r1-form-group">
                  <label className="r1-form-label">Location</label>
                  <input className="r1-form-input" type="text" placeholder="e.g. ED Bay 2"
                    value={uploadForm.location}
                    onChange={e => setUploadForm({ ...uploadForm, location: e.target.value })} />
                </div>
              </div>

              {/* NIfTI File */}
              <div className="r1-form-group">
                <label className="r1-form-label">NIfTI File (.nii / .nii.gz)</label>
                <input className="r1-form-input" ref={fileInputRef} type="file" accept=".nii,.nii.gz"
                  onChange={e => setUploadForm({ ...uploadForm, file: e.target.files[0], dicomFile: null, folderFiles: null })} />
              </div>

              {/* Single DICOM */}
              <div className="r1-form-group">
                <label className="r1-form-label">DICOM Single File (.dcm)</label>
                <input className="r1-form-input" ref={dicomInputRef} type="file" accept=".dcm"
                  onChange={e => setUploadForm({ ...uploadForm, dicomFile: e.target.files[0], file: null, folderFiles: null })} />
              </div>

              {/* DICOM Folder */}
              <div className="r1-form-group">
                <label className="r1-form-label">DICOM Folder (CT/MR Series)</label>
                <input className="r1-form-input" ref={folderInputRef} type="file" multiple
                  webkitdirectory="true" directory="true"
                  onChange={e => setUploadForm({ ...uploadForm, folderFiles: e.target.files, file: null, dicomFile: null })} />
                <span className="r1-form-hint">Chrome/Edge only. For other browsers, upload a .zip.</span>
              </div>
            </div>

            <div className="r1-modal-footer">
              <button className="r1-btn-secondary" style={{ width: 'auto', padding: '8px 18px' }}
                onClick={() => { setUploadOpen(false); resetUploadForm(); }}>
                Cancel
              </button>
              <button className="r1-btn-primary" style={{ width: 'auto', padding: '8px 22px' }}
                onClick={handleUpload} disabled={uploadLoading}>
                {uploadLoading ? 'Uploading…' : 'Upload Scan'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
