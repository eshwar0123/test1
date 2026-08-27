'use strict';

// ── Config ───────────────────────────────────────────────────────────────────
// Use relative URLs on Vercel/production; point to local server only when using Live Server (port 5500)
const API = window.location.port === '5500' ? 'http://localhost:8000' : '';


// ── State ────────────────────────────────────────────────────────────────────
let selectedExcel = null;
let selectedImages = [];
let patientPage = 0;
const PAGE_SIZE = 20;
let allPatients = [];
let searchQuery = '';

// ── DOM Refs ──────────────────────────────────────────────────────────────────
const uploadForm      = document.getElementById('upload-form');
const excelInput      = document.getElementById('excel-input');
const imagesInput     = document.getElementById('images-input');
const excelSelected   = document.getElementById('excel-selected');
const imagesSelected  = document.getElementById('images-selected');
const filePreviewList = document.getElementById('file-preview-list');
const progressWrap    = document.getElementById('progress-wrap');
const progressBar     = document.getElementById('progress-bar');
const progressText    = document.getElementById('progress-text');
const progressPct     = document.getElementById('progress-pct');
const uploadBtn       = document.getElementById('upload-btn');
const resultArea      = document.getElementById('result-area');
const patientTbody    = document.getElementById('patient-tbody');
const patientSearch   = document.getElementById('patient-search');

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024, units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

function fileIcon(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.dcm')) return '🩻';
  if (n.endsWith('.nii') || n.endsWith('.nii.gz')) return '🧠';
  if (n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg')) return '🖼️';
  return '📄';
}

function toast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Tab System ────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${target}`).classList.add('active');
  });
});

// ── Drop Zone: Excel ─────────────────────────────────────────────────────────
excelInput.addEventListener('change', () => {
  const f = excelInput.files[0];
  if (!f) return;
  selectedExcel = f;
  excelSelected.textContent = `✓ ${f.name} (${formatBytes(f.size)})`;
});

const excelDrop = document.getElementById('excel-drop');
excelDrop.addEventListener('dragover', e => { e.preventDefault(); excelDrop.classList.add('drag-over'); });
excelDrop.addEventListener('dragleave', () => excelDrop.classList.remove('drag-over'));
excelDrop.addEventListener('drop', e => {
  e.preventDefault();
  excelDrop.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.name.match(/\.xlsx?$/i));
  if (!files.length) { toast('Please drop an Excel (.xlsx) file', 'error'); return; }
  selectedExcel = files[0];
  excelSelected.textContent = `✓ ${selectedExcel.name} (${formatBytes(selectedExcel.size)})`;
});

// ── Drop Zone: Images ─────────────────────────────────────────────────────────
imagesInput.addEventListener('change', () => {
  const files = Array.from(imagesInput.files);
  if (!files.length) return;
  selectedImages = files;
  imagesSelected.textContent = `✓ ${files.length} file(s) selected`;
  renderFilePreview(files);
});

function renderFilePreview(files) {
  if (!files.length) { filePreviewList.style.display = 'none'; return; }
  filePreviewList.style.display = 'block';
  const showing = files.slice(0, 50);
  filePreviewList.innerHTML = showing.map(f => `
    <div class="fpl-item">
      <span class="fpl-icon">${fileIcon(f.name)}</span>
      <span class="fpl-name" title="${escHtml(f.webkitRelativePath || f.name)}">${escHtml(f.webkitRelativePath || f.name)}</span>
      <span class="fpl-size">${formatBytes(f.size)}</span>
    </div>
  `).join('') + (files.length > 50 ? `<div class="fpl-item" style="color:var(--text-muted); justify-content:center;">… and ${files.length - 50} more</div>` : '');
}

// ── Upload Form ───────────────────────────────────────────────────────────────
uploadForm.addEventListener('submit', async e => {
  e.preventDefault();

  if (!selectedExcel) { toast('Please select an Excel metadata file.', 'error'); return; }
  if (!selectedImages.length) { toast('Please select an image folder.', 'error'); return; }

  setUploading(true);
  resultArea.style.display = 'none';
  resultArea.innerHTML = '';

  // ── Phase 1: ask server to parse Excel + generate signed upload URLs ─────
  setProgress(5, '', 'Preparing upload…');

  const prepareForm = new FormData();
  prepareForm.append('metadata_file', selectedExcel);
  prepareForm.append('filenames', JSON.stringify(
    selectedImages.map(f => f.webkitRelativePath || f.name)
  ));

  let prepareData;
  try {
    const prepResp = await fetch(`${API}/api/prepare-bulk-upload`, {
      method: 'POST',
      body: prepareForm,
    });
    const prepText = await prepResp.text();
    let prepJson = {};
    try { prepJson = prepText ? JSON.parse(prepText) : {}; } catch (_) {}

    if (!prepResp.ok) {
      const detail = prepJson.detail;
      const msg = typeof detail === 'string' ? detail
        : Array.isArray(detail?.validation_errors) ? detail.validation_errors.join('; ')
        : prepText.slice(0, 300);
      toast(`Error: ${msg}`, 'error', 10000);
      renderErrorSummary(prepJson);
      setUploading(false);
      return;
    }
    prepareData = prepJson;
  } catch (err) {
    toast(`Prepare request failed: ${err.message}`, 'error');
    setUploading(false);
    return;
  }

  // ── Fallback: server has no Supabase storage — use legacy single-request path
  if (!prepareData.use_direct_upload) {
    await _legacyBulkUpload();
    return;
  }

  // ── Phase 2: upload each file directly to Supabase via the signed URLs ───
  const signedUrls = prepareData.signed_urls || [];
  const fileMap = {};
  selectedImages.forEach(f => { fileMap[f.webkitRelativePath || f.name] = f; });

  const completedUploads = [];
  const failedUploads = [];
  const MIME = { dcm: 'application/dicom', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

  for (let i = 0; i < signedUrls.length; i++) {
    const { filename, real_name, storage_path, upload_url, case_id } = signedUrls[i];
    const file = fileMap[filename];
    if (!file) {
      failedUploads.push(`${real_name}: file not found in selection`);
      continue;
    }
    const pct = 10 + (i / Math.max(signedUrls.length, 1)) * 80;
    setProgress(pct, '', `Uploading ${i + 1}/${signedUrls.length}: ${real_name}…`);

    const ext = real_name.toLowerCase().split('.').pop();
    const mime = MIME[ext] || 'application/octet-stream';
    try {
      const upResp = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: file,
      });
      if (!upResp.ok) {
        if (upResp.status === 409) {
          // File already exists in storage — treat as success
          completedUploads.push({
            case_id,
            real_name,
            storage_path,
            size_kb: Math.round(file.size / 1024 * 10) / 10,
          });
          continue;
        }
        const errText = await upResp.text();
        failedUploads.push(`${real_name}: storage ${upResp.status} — ${errText.slice(0, 120)}`);
        continue;
      }
      completedUploads.push({
        case_id,
        real_name,
        storage_path,
        size_kb: Math.round(file.size / 1024 * 10) / 10,
      });
    } catch (err) {
      failedUploads.push(`${real_name}: ${err.message}`);
    }
  }

  // ── Phase 3: tell server which uploads succeeded so it can record them ───
  setProgress(93, '', 'Finalizing…');
  try {
    const finalResp = await fetch(`${API}/api/finalize-bulk-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploads: completedUploads,
        validation_errors: prepareData.validation_errors || [],
        missing_images: prepareData.missing_images || [],
        patients_created: prepareData.patients_created || 0,
        total_excel_rows: prepareData.total_excel_rows || 0,
      }),
    });
    setProgress(100, finalResp.ok ? '' : 'error');
    const finalText = await finalResp.text();
    let finalData = {};
    try { finalData = finalText ? JSON.parse(finalText) : {}; } catch (_) {}

    if (!finalResp.ok) {
      toast(`Error: ${finalData.detail || `HTTP ${finalResp.status}`}`, 'error', 10000);
    } else {
      if (failedUploads.length) {
        finalData.upload_errors = [...(finalData.upload_errors || []), ...failedUploads];
        if (finalData.summary) finalData.summary.errors = (finalData.summary.errors || 0) + failedUploads.length;
      }
      toast('Upload completed!', 'success');
      renderSummary(finalData);
      loadPatients();
      loadStats();
    }
  } catch (err) {
    setProgress(0, 'error');
    toast(`Finalize request failed: ${err.message}`, 'error');
  } finally {
    setUploading(false);
  }
});

// Legacy path: send everything in one multipart request (local dev without Supabase)
async function _legacyBulkUpload() {
  const formData = new FormData();
  formData.append('metadata_file', selectedExcel);
  selectedImages.forEach(f => formData.append('images', f, f.webkitRelativePath || f.name));

  let fakeProgress = 0;
  const fakeInterval = setInterval(() => {
    fakeProgress = fakeProgress < 80
      ? fakeProgress + Math.random() * 8
      : Math.min(fakeProgress + 0.4, 90);
    setProgress(fakeProgress, '', fakeProgress < 82 ? 'Uploading…' : 'Processing on server…');
  }, 300);

  try {
    const resp = await fetch(`${API}/api/bulk-upload`, { method: 'POST', body: formData });
    clearInterval(fakeInterval);
    setProgress(100, resp.ok ? '' : 'error');

    const text = await resp.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {
      toast(`Server returned unexpected response (${resp.status}): ${text.slice(0, 200)}`, 'error', 8000);
      return;
    }

    if (!resp.ok) {
      const detail = data.detail;
      const msg = Array.isArray(detail?.validation_errors) ? detail.validation_errors.join('; ')
        : typeof detail === 'string' ? detail
        : Array.isArray(detail) ? detail.map(e => `${e.loc?.slice(-1)[0] ?? ''}: ${e.msg}`).join('; ')
        : text ? `${resp.status} — ${text.slice(0, 300)}` : `HTTP ${resp.status}`;
      toast(`Error: ${msg}`, 'error', 10000);
      renderErrorSummary(data);
    } else {
      toast('Upload completed successfully!', 'success');
      renderSummary(data);
      loadPatients();
      loadStats();
    }
  } catch (err) {
    clearInterval(fakeInterval);
    setProgress(0, 'error');
    toast(`Request failed: ${err.message}`, 'error');
  } finally {
    setUploading(false);
  }
}

function setUploading(active) {
  uploadBtn.disabled = active;
  uploadBtn.innerHTML = active
    ? '<span class="spinner"></span> Uploading…'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg> Upload Dataset';
  if (!active) progressWrap.style.display = 'none';
}

function setProgress(pct, cls = '', label = '') {
  progressWrap.style.display = 'block';
  const p = Math.round(Math.min(100, Math.max(0, pct)));
  progressBar.style.width = `${p}%`;
  progressBar.className = `progress-bar-inner${cls ? ' ' + cls : ''}`;
  progressPct.textContent = `${p}%`;
  if (label)               progressText.textContent = label;
  else if (p === 100 && !cls) progressText.textContent = 'Done!';
  else if (cls === 'error')   progressText.textContent = 'Upload failed';
  else                        progressText.textContent = 'Uploading…';
}

function renderSummary(data) {
  const s = data.summary;
  resultArea.style.display = 'block';
  const hasIssues = s.missing_images > 0 || s.errors > 0 || (data.validation_errors || []).length > 0;

  let issuesHtml = '';
  if ((data.missing_images || []).length) {
    issuesHtml += `<div class="issue-list"><div class="issue-list-header warn">⚠️ Missing Images (${data.missing_images.length})</div><ul>${data.missing_images.map(m => `<li class="warn">${escHtml(m)}</li>`).join('')}</ul></div>`;
  }
  if ((data.upload_errors || []).length) {
    issuesHtml += `<div class="issue-list"><div class="issue-list-header err">❌ Upload Errors (${data.upload_errors.length})</div><ul>${data.upload_errors.map(e => `<li class="err">${escHtml(e)}</li>`).join('')}</ul></div>`;
  }
  if ((data.validation_errors || []).length) {
    issuesHtml += `<div class="issue-list"><div class="issue-list-header err">⚠️ Validation Warnings (${data.validation_errors.length})</div><ul>${data.validation_errors.map(e => `<li class="warn">${escHtml(e)}</li>`).join('')}</ul></div>`;
  }

  resultArea.innerHTML = `
    <div class="summary-box ${hasIssues ? 'error' : 'success'}">
      <div class="summary-header">${hasIssues ? '⚠️ Upload Complete with Issues' : '✅ Upload Successful'}</div>
      <div class="summary-body">
        <div class="summary-grid">
          <div class="summary-item"><span class="si-label">Total Excel Rows</span><span class="si-value">${s.total_excel_rows}</span></div>
          <div class="summary-item"><span class="si-label">Patients Created</span><span class="si-value s">${s.patients_created}</span></div>
          <div class="summary-item"><span class="si-label">Images Uploaded</span><span class="si-value s">${s.images_uploaded}</span></div>
          <div class="summary-item"><span class="si-label">Missing Images</span><span class="si-value ${s.missing_images ? 'w' : ''}">${s.missing_images}</span></div>
          <div class="summary-item"><span class="si-label">Errors</span><span class="si-value ${s.errors ? 'e' : ''}">${s.errors}</span></div>
        </div>
        ${issuesHtml}
      </div>
    </div>`;
}

function renderErrorSummary(data) {
  const detail = data.detail;
  resultArea.style.display = 'block';
  let errList = [];
  if (typeof detail === 'string') errList = [detail];
  else if (detail?.validation_errors) errList = detail.validation_errors;
  else if (Array.isArray(detail)) errList = detail.map(d => `${d.loc?.join('.')}: ${d.msg}`);

  resultArea.innerHTML = `
    <div class="summary-box error">
      <div class="summary-header">❌ Upload Failed</div>
      <div class="summary-body">
        <div class="issue-list"><div class="issue-list-header err">Errors</div><ul>${errList.map(e => `<li class="err">${escHtml(e)}</li>`).join('')}</ul></div>
      </div>
    </div>`;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const resp = await fetch(`${API}/api/stats`);
    const text = await resp.text();
    const data = text ? JSON.parse(text) : {};
    document.getElementById('stat-patients').textContent = data.total_patients ?? '—';
    document.getElementById('stat-images').textContent = data.total_images ?? '—';
    document.getElementById('stat-success').textContent = data.successful_uploads ?? '—';
    document.getElementById('stat-failed').textContent = data.failed_uploads ?? '—';
  } catch (_) {}
}

// ── Patient Table ─────────────────────────────────────────────────────────────
async function loadPatients() {
  try {
    const resp = await fetch(`${API}/api/patients?limit=500`);
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      toast(`/api/patients returned HTML — is the server running at http://localhost:8000?`, 'error', 8000);
      return;
    }
    allPatients = await resp.json();
    renderPatients();
  } catch (err) {
    toast(`Could not load patients: ${err.message}`, 'error');
  }
}

function renderPatients() {
  const q = searchQuery.toLowerCase();
  const filtered = allPatients.filter(p =>
    p.case_id.toLowerCase().includes(q) ||
    (p.patient_name || '').toLowerCase().includes(q)
  );
  const start = patientPage * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);

  if (!page.length) {
    patientTbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="es-icon">👥</div><p>${q ? 'No patients match your search.' : 'No patients yet. Upload a dataset to get started.'}</p></div></td></tr>`;
    renderPagination(0, 0);
    return;
  }

  patientTbody.innerHTML = page.map((p, i) => `
    <tr>
      <td style="color:var(--text-muted);font-size:12px;">${start + i + 1}</td>
      <td><span class="badge badge-blue">${escHtml(p.case_id)}</span></td>
      <td>${escHtml(p.patient_name || '—')}</td>
      <td>${p.age ?? '—'}</td>
      <td>${escHtml(p.gender || '—')}</td>
      <td>${escHtml(p.study_date || '—')}</td>
      <td><span class="badge-images">${p.image_count}</span></td>
      <td style="text-align:center;">
        <div style="display:inline-flex; gap:6px;">
          <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px;" onclick="viewPatient('${escHtml(p.case_id)}')">&#x1F441; View</button>
          <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px;color:var(--accent);border-color:var(--accent);" onclick="openEditModal('${escHtml(p.case_id)}')">&#x270F;&#xFE0F; Edit</button>
          <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px;color:var(--error);border-color:var(--error);" onclick="openDeleteModal('${escHtml(p.case_id)}','${escHtml(p.patient_name||p.case_id)}')">&#x1F5D1; Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  renderPagination(filtered.length, PAGE_SIZE);
}

function renderPagination(total, pageSize) {
  const pages = Math.ceil(total / pageSize);
  const container = document.getElementById('patient-pagination');
  if (pages <= 1) { container.innerHTML = ''; return; }
  let html = '';
  for (let i = 0; i < pages; i++) {
    html += `<button class="btn ${i === patientPage ? 'btn-primary' : 'btn-secondary'}" style="padding:5px 12px;font-size:12px;" onclick="goPage(${i})">${i + 1}</button>`;
  }
  container.innerHTML = html;
}

function goPage(n) {
  patientPage = n;
  renderPatients();
}

patientSearch.addEventListener('input', () => {
  searchQuery = patientSearch.value;
  patientPage = 0;
  renderPatients();
});

// ── Patient Detail ────────────────────────────────────────────────────────────
async function viewPatient(caseId) {
  try {
    const resp = await fetch(`${API}/api/patients/${encodeURIComponent(caseId)}`);
    if (!resp.ok) { toast('Patient not found', 'error'); return; }
    const p = await resp.json();

    const card = document.getElementById('patient-detail-card');
    const body = document.getElementById('detail-body');
    document.getElementById('detail-title').textContent = `${p.case_id} — ${p.patient_name || 'Unknown'}`;

    const infoHtml = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:12px;align-items:center;margin-bottom:16px;">
        <div class="summary-item"><span class="si-label">Age</span><span style="font-size:15px;font-weight:600;">${p.age ?? '—'}</span></div>
        <div class="summary-item"><span class="si-label">Gender</span><span style="font-size:15px;font-weight:600;">${escHtml(p.gender || '—')}</span></div>
        <div class="summary-item"><span class="si-label">Study Date</span><span style="font-size:15px;font-weight:600;">${escHtml(p.study_date || '—')}</span></div>
        <div class="summary-item"><span class="si-label">Images</span><span style="font-size:15px;font-weight:600;">${p.images.length}</span></div>
        <button class="btn" onclick="deleteAllImages('${escHtml(p.case_id)}')" style="padding:6px 14px;font-size:13px;background:var(--error);color:#fff;border-color:var(--error);white-space:nowrap;">&#x1F5D1; Delete All Files</button>
      </div>`;

    const imgRows = p.images.map(img => `
      <tr id="img-row-${escHtml(img.image_name)}">
        <td>${fileIcon(img.image_name)} ${escHtml(img.image_name)}</td>
        <td><span class="badge badge-gray">${escHtml(img.file_type || '—')}</span></td>
        <td>${img.file_size_kb != null ? img.file_size_kb + ' KB' : '—'}</td>
        <td>${escHtml(img.modality || '—')}</td>
        <td>${escHtml(img.image_shape || '—')}</td>
        <td><span class="badge ${img.upload_status === 'success' ? 'badge-green' : 'badge-gray'}">${escHtml(img.upload_status)}</span></td>
        <td><button class="btn btn-secondary" style="padding:3px 8px;font-size:11px;color:var(--error);border-color:var(--error);"
            onclick="deleteImage('${escHtml(p.case_id)}','${escHtml(img.image_name)}')">&#x1F5D1; Delete</button></td>
      </tr>
    `).join('');

    body.innerHTML = infoHtml + `
      <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>Filename</th><th>Type</th><th>Size</th><th>Modality</th><th>Shape</th><th>Status</th><th></th></tr></thead>
          <tbody id="detail-img-tbody">${imgRows || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No images</td></tr>'}</tbody>
        </table>
      </div>`;

    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    toast('Error loading patient detail', 'error');
  }
}

// ── Docs toggle ───────────────────────────────────────────────────────────────
function toggleDocs() {
  const card  = document.getElementById('upload-docs-card');
  const arrow = document.getElementById('docs-arrow');
  const open  = card.style.display === 'none';
  card.style.display = open ? 'block' : 'none';
  arrow.textContent  = open ? '▼' : '▶';
}

function closeDetail() {
  document.getElementById('patient-detail-card').style.display = 'none';
}

function deleteCurrentPatient() {
  const title = document.getElementById('detail-title').textContent;
  // title format: "C004 — Anita Sharma"
  const caseId = title.split('—')[0].trim();
  const label  = title.split('—')[1]?.trim() || caseId;
  openDeleteModal(caseId, label);
}

async function deleteImage(caseId, imageName) {
  if (!confirm(`Delete image "${imageName}" from patient ${caseId}?`)) return;
  try {
    const resp = await fetch(
      `${API}/api/patients/${encodeURIComponent(caseId)}/images/${encodeURIComponent(imageName)}`,
      { method: 'DELETE' }
    );
    const text = await resp.text();
    const data = text ? JSON.parse(text) : {};
    if (!resp.ok) throw new Error(data.detail || `HTTP ${resp.status}`);
    // Remove the row from the table instantly
    const row = document.getElementById(`img-row-${imageName}`);
    if (row) row.remove();
    // Update image count in the patient info grid
    const tbody = document.getElementById('detail-img-tbody');
    if (tbody && !tbody.querySelector('tr[id^="img-row-"]')) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No images</td></tr>';
    }
    toast(`Image "${imageName}" deleted`, 'success');
    loadPatients();
    loadStats();
  } catch (err) {
    toast(`Failed to delete image: ${err.message}`, 'error');
  }
}

async function deleteAllImages(caseId) {
  if (!confirm(`Delete all files for patient ${caseId}? The patient record will be kept.`)) return;
  try {
    const resp = await fetch(`${API}/api/patients/${encodeURIComponent(caseId)}/images`, { method: 'DELETE' });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || `HTTP ${resp.status}`);
    toast(`All files deleted for ${caseId} (${data.deleted} removed)`, 'success');
    viewPatient(caseId);
    loadPatients();
    loadStats();
  } catch (err) {
    toast(`Failed to delete files: ${err.message}`, 'error');
  }
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function openEditModal(caseId) {
  const p = allPatients.find(x => x.case_id === caseId);
  if (!p) { toast('Patient data not found, try refreshing.', 'error'); return; }
  document.getElementById('edit-case-id').value         = p.case_id;
  document.getElementById('edit-case-id-display').value = p.case_id;
  document.getElementById('edit-name').value            = p.patient_name || '';
  document.getElementById('edit-age').value             = p.age ?? '';
  document.getElementById('edit-gender').value          = p.gender || '';
  document.getElementById('edit-study-date').value      = p.study_date || '';
  // Reset file picker
  document.getElementById('edit-images-input').value   = '';
  document.getElementById('edit-images-selected').textContent = '';
  document.getElementById('edit-file-preview').style.display = 'none';
  document.getElementById('edit-file-preview').innerHTML = '';
  document.getElementById('edit-modal-overlay').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('edit-modal-overlay').style.display = 'none';
}

// File picker inside edit modal
document.getElementById('edit-images-input').addEventListener('change', function () {
  const files = Array.from(this.files);
  if (!files.length) return;
  document.getElementById('edit-images-selected').textContent = `✓ ${files.length} file(s) selected`;
  const preview = document.getElementById('edit-file-preview');
  preview.style.display = 'block';
  preview.innerHTML = files.slice(0, 30).map(f => `
    <div class="fpl-item">
      <span class="fpl-icon">${fileIcon(f.name)}</span>
      <span class="fpl-name">${escHtml(f.name)}</span>
      <span class="fpl-size">${formatBytes(f.size)}</span>
    </div>`).join('') + (files.length > 30 ? `<div class="fpl-item" style="color:var(--text-muted);justify-content:center;">… and ${files.length - 30} more</div>` : '');
});

async function submitEdit(e) {
  e.preventDefault();
  const caseId = document.getElementById('edit-case-id').value;
  const btn = document.getElementById('edit-save-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  const form = new FormData();
  const name   = document.getElementById('edit-name').value.trim();
  const age    = document.getElementById('edit-age').value;
  const gender = document.getElementById('edit-gender').value;
  const date   = document.getElementById('edit-study-date').value.trim();
  if (name)   form.append('patient_name', name);
  if (age)    form.append('age', age);
  if (gender) form.append('gender', gender);
  if (date)   form.append('study_date', date);

  // Attach image files if selected
  const imageFiles = Array.from(document.getElementById('edit-images-input').files);
  imageFiles.forEach(f => form.append('images', f, f.name));

  try {
    const resp = await fetch(`${API}/api/patients/${encodeURIComponent(caseId)}`, {
      method: 'PUT', body: form,
    });
    const text = await resp.text();
    const data = text ? JSON.parse(text) : {};
    if (!resp.ok) throw new Error(data.detail || `HTTP ${resp.status}`);

    let msg = `Patient ${caseId} updated`;
    if (data.images_added)    msg += ` · ${data.images_added} image(s) added`;
    if (data.images_replaced) msg += ` · ${data.images_replaced} image(s) replaced`;
    toast(msg, 'success');
    closeEditModal();
    loadPatients();
    loadStats();
  } catch (err) {
    toast(`Update failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
}

// Click outside modal to close
document.getElementById('edit-modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeEditModal();
});

// ── Delete Modal ──────────────────────────────────────────────────────────────
let _pendingDeleteId = null;

function openDeleteModal(caseId, label) {
  _pendingDeleteId = caseId;
  document.getElementById('delete-patient-label').textContent = `${label} (${caseId})`;
  document.getElementById('delete-modal-overlay').style.display = 'flex';
}

function closeDeleteModal() {
  _pendingDeleteId = null;
  document.getElementById('delete-modal-overlay').style.display = 'none';
}

async function confirmDelete() {
  if (!_pendingDeleteId) return;
  const caseId = _pendingDeleteId;
  const btn = document.getElementById('confirm-delete-btn');
  btn.disabled = true;
  btn.textContent = 'Deleting…';

  try {
    const resp = await fetch(`${API}/api/patients/${encodeURIComponent(caseId)}`, {
      method: 'DELETE',
    });
    const text = await resp.text();
    const data = text ? JSON.parse(text) : {};
    if (!resp.ok) throw new Error(data.detail || `HTTP ${resp.status}`);
    toast(`Patient ${caseId} deleted`, 'success');
    closeDeleteModal();
    // Close detail panel if showing the deleted patient
    const detailTitle = document.getElementById('detail-title').textContent;
    if (detailTitle.startsWith(caseId)) closeDetail();
    loadPatients();
    loadStats();
  } catch (err) {
    toast(`Delete failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Delete';
  }
}

document.getElementById('delete-modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeDeleteModal();
});

// ── Add Patient Modal ─────────────────────────────────────────────────────────
function openAddModal() {
  document.getElementById('add-form').reset();
  document.getElementById('add-images-selected').textContent = '';
  document.getElementById('add-file-preview').style.display = 'none';
  document.getElementById('add-file-preview').innerHTML = '';
  document.getElementById('add-modal-overlay').style.display = 'flex';
}

function closeAddModal() {
  document.getElementById('add-modal-overlay').style.display = 'none';
}

document.getElementById('add-images-input').addEventListener('change', function () {
  const files = Array.from(this.files);
  if (!files.length) return;
  document.getElementById('add-images-selected').textContent = `✓ ${files.length} file(s) selected`;
  const preview = document.getElementById('add-file-preview');
  preview.style.display = 'block';
  preview.innerHTML = files.slice(0, 30).map(f => `
    <div class="fpl-item">
      <span class="fpl-icon">${fileIcon(f.name)}</span>
      <span class="fpl-name">${escHtml(f.name)}</span>
      <span class="fpl-size">${formatBytes(f.size)}</span>
    </div>`).join('') + (files.length > 30 ? `<div class="fpl-item" style="color:var(--text-muted);justify-content:center;">… and ${files.length - 30} more</div>` : '');
});

async function submitAdd(e) {
  e.preventDefault();
  const btn = document.getElementById('add-save-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  const form = new FormData();
  form.append('case_id', document.getElementById('add-case-id').value.trim());
  const name  = document.getElementById('add-name').value.trim();
  const age   = document.getElementById('add-age').value;
  const gender = document.getElementById('add-gender').value;
  const date  = document.getElementById('add-study-date').value;
  if (name)   form.append('patient_name', name);
  if (age)    form.append('age', age);
  if (gender) form.append('gender', gender);
  if (date)   form.append('study_date', date);

  Array.from(document.getElementById('add-images-input').files).forEach(f => form.append('images', f, f.name));

  try {
    const resp = await fetch(`${API}/api/patients`, { method: 'POST', body: form });
    const text = await resp.text();
    const data = text ? JSON.parse(text) : {};
    if (!resp.ok) throw new Error(data.detail || `HTTP ${resp.status}`);
    let msg = `Patient ${data.case_id} added`;
    if (data.images_added) msg += ` · ${data.images_added} image(s) uploaded`;
    toast(msg, 'success');
    closeAddModal();
    loadPatients();
    loadStats();
  } catch (err) {
    toast(`Failed to add patient: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add Patient';
  }
}

document.getElementById('add-modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeAddModal();
});

// ── Theme Toggle ──────────────────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcons(saved);
})();

function updateThemeIcons(theme) {
  const moon = document.getElementById('icon-moon');
  const sun  = document.getElementById('icon-sun');
  if (!moon || !sun) return;
  if (theme === 'dark') {
    moon.style.display = 'none';
    sun.style.display  = 'block';
  } else {
    moon.style.display = 'block';
    sun.style.display  = 'none';
  }
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcons(next);
});

// ── Notification Dropdown ─────────────────────────────────────────────────────
const notifToggle   = document.getElementById('notif-toggle');
const notifDropdown = document.getElementById('notif-dropdown');
const notifBadge    = document.getElementById('notif-badge');

notifToggle.addEventListener('click', e => {
  e.stopPropagation();
  const open = notifDropdown.style.display === 'block';
  closeAllDropdowns();
  if (!open) notifDropdown.style.display = 'block';
});

document.getElementById('notif-clear').addEventListener('click', () => {
  document.getElementById('notif-list').innerHTML =
    '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">No new notifications</div>';
  notifBadge.textContent = '';
  notifBadge.style.display = 'none';
  document.querySelectorAll('.notif-item').forEach(i => i.classList.remove('unread'));
});

// ── Avatar Dropdown ───────────────────────────────────────────────────────────
const avatarToggle   = document.getElementById('avatar-toggle');
const avatarDropdown = document.getElementById('avatar-dropdown');

avatarToggle.addEventListener('click', e => {
  e.stopPropagation();
  const open = avatarDropdown.style.display === 'block';
  closeAllDropdowns();
  if (!open) avatarDropdown.style.display = 'block';
});

function closeAllDropdowns() {
  notifDropdown.style.display  = 'none';
  avatarDropdown.style.display = 'none';
}

document.addEventListener('click', closeAllDropdowns);

// ── Upload Tabs (Single / Bulk) ───────────────────────────────────────────────
document.querySelectorAll('.upload-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.uploadTab;
    document.querySelectorAll('.upload-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.upload-tab-panel').forEach(p => {
      p.style.display = 'none';
      p.classList.remove('active');
    });
    btn.classList.add('active');
    const panel = document.getElementById(`upload-panel-${target}`);
    panel.style.display = 'block';
    panel.classList.add('active');
    // Hide ready-bar on single tab; show on bulk
    const readyBar = document.getElementById('ready-bar');
    if (readyBar) readyBar.style.display = target === 'bulk' ? 'block' : 'none';
  });
});

// ── Single Patient: Image Drop Zone ──────────────────────────────────────────
const spImagesInput  = document.getElementById('sp-images-input');
const spImagesSelected = document.getElementById('sp-images-selected');
const spFilePreview  = document.getElementById('sp-file-preview');
let spSelectedImages = [];

spImagesInput.addEventListener('change', () => {
  const files = Array.from(spImagesInput.files);
  if (!files.length) return;
  spSelectedImages = files;
  spImagesSelected.textContent = `✓ ${files.length} file(s) selected`;
  spFilePreview.style.display = 'block';
  spFilePreview.innerHTML = files.slice(0, 30).map(f => `
    <div class="fpl-item">
      <span class="fpl-icon">${fileIcon(f.name)}</span>
      <span class="fpl-name">${escHtml(f.name)}</span>
      <span class="fpl-size">${formatBytes(f.size)}</span>
    </div>`).join('') + (files.length > 30 ? `<div class="fpl-item" style="color:var(--text-muted);justify-content:center;">… and ${files.length - 30} more</div>` : '');
});

const spImagesDrop = document.getElementById('sp-images-drop');
spImagesDrop.addEventListener('dragover', e => { e.preventDefault(); spImagesDrop.classList.add('drag-over'); });
spImagesDrop.addEventListener('dragleave', () => spImagesDrop.classList.remove('drag-over'));
spImagesDrop.addEventListener('drop', e => {
  e.preventDefault();
  spImagesDrop.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  if (!files.length) return;
  spSelectedImages = files;
  spImagesSelected.textContent = `✓ ${files.length} file(s) selected`;
  spFilePreview.style.display = 'block';
  spFilePreview.innerHTML = files.slice(0, 30).map(f => `
    <div class="fpl-item">
      <span class="fpl-icon">${fileIcon(f.name)}</span>
      <span class="fpl-name">${escHtml(f.name)}</span>
      <span class="fpl-size">${formatBytes(f.size)}</span>
    </div>`).join('');
});

// ── Single Patient Form Submit ────────────────────────────────────────────────
document.getElementById('single-upload-form').addEventListener('submit', async e => {
  e.preventDefault();
  const caseId = document.getElementById('sp-case-id').value.trim();
  if (!caseId) { toast('Case ID is required', 'error'); return; }

  const btn = document.getElementById('sp-upload-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Uploading…';

  const spProgressWrap = document.getElementById('sp-progress-wrap');
  const spProgressBar  = document.getElementById('sp-progress-bar');
  const spProgressPct  = document.getElementById('sp-progress-pct');
  const spResultArea   = document.getElementById('sp-result-area');
  spProgressWrap.style.display = 'block';
  spProgressBar.style.width = '20%';
  spProgressPct.textContent = '20%';
  spResultArea.style.display = 'none';

  const form = new FormData();
  form.append('case_id', caseId);
  const name   = document.getElementById('sp-name').value.trim();
  const age    = document.getElementById('sp-age').value;
  const gender = document.getElementById('sp-gender').value;
  const date   = document.getElementById('sp-study-date').value;
  if (name)   form.append('patient_name', name);
  if (age)    form.append('age', age);
  if (gender) form.append('gender', gender);
  if (date)   form.append('study_date', date);
  spSelectedImages.forEach(f => form.append('images', f, f.name));

  spProgressBar.style.width = '60%';
  spProgressPct.textContent = '60%';

  try {
    const resp = await fetch(`${API}/api/patients`, { method: 'POST', body: form });
    const text = await resp.text();
    const data = text ? JSON.parse(text) : {};
    if (!resp.ok) throw new Error(data.detail || `HTTP ${resp.status}`);

    spProgressBar.style.width = '100%';
    spProgressPct.textContent = '100%';
    document.getElementById('sp-progress-text').textContent = 'Done!';

    let msg = `Patient ${data.case_id} added`;
    if (data.images_added) msg += ` · ${data.images_added} image(s) uploaded`;
    toast(msg, 'success');

    spResultArea.style.display = 'block';
    spResultArea.innerHTML = `
      <div class="summary-box success">
        <div class="summary-header">Patient Added Successfully</div>
        <div class="summary-body">
          <div class="summary-grid">
            <div class="summary-item"><span class="si-label">Case ID</span><span class="si-value s" style="font-size:15px;">${escHtml(data.case_id)}</span></div>
            <div class="summary-item"><span class="si-label">Images Uploaded</span><span class="si-value s">${data.images_added || 0}</span></div>
          </div>
        </div>
      </div>`;

    // Reset form
    document.getElementById('single-upload-form').reset();
    spSelectedImages = [];
    spImagesSelected.textContent = '';
    spFilePreview.style.display = 'none';
    spFilePreview.innerHTML = '';

    loadPatients();
    loadStats();
  } catch (err) {
    spProgressBar.style.width = '0%';
    spProgressPct.textContent = '0%';
    toast(`Failed to add patient: ${err.message}`, 'error');
    spResultArea.style.display = 'block';
    spResultArea.innerHTML = `<div class="summary-box error"><div class="summary-header">Failed to Add Patient</div><div class="summary-body"><p style="font-size:13px;color:var(--error)">${escHtml(err.message)}</p></div></div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg> Upload Patient';
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadStats();
loadPatients();
