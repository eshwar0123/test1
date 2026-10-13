import React, { useEffect, useMemo, useState } from 'react'

import {

  CButton,

  CCard,

  CCardBody,

  CCardHeader,

  CFormInput,

  CInputGroup,

  CInputGroupText,

  CModal,

  CModalHeader,

  CModalTitle,

  CModalBody,

  CModalFooter,

  CPagination,

  CPaginationItem,

  CBadge,

  CFormSelect,

  CFormLabel,

  CSpinner

} from '@coreui/react'

import { useNavigate } from 'react-router-dom'

import './ScanRepository.css'
 
/**

* ✅ Organisation logo URL resolver

* Backend should return org_logo_url as either:

*  - "/uploads/organisation/logo.png" (recommended)

*  - "logo.png" (we will convert)

*  - full http url

*/

const API_BASE = 'http://localhost:8000'
 
const resolveOrgLogoUrl = (logo) => {

  if (!logo) return null

  if (logo.startsWith('http://') || logo.startsWith('https://')) return logo

  if (logo.startsWith('/')) return `${API_BASE}${logo}`

  return `${API_BASE}/uploads/organisation/${logo}`

}
 
export default function ScanRepository({ fetchUrl }) {

  const navigate = useNavigate()
 
  /* ================= View & Data State ================= */

  const [scans, setScans] = useState([])

  const [loading, setLoading] = useState(false)
 
  /* ================= Filters & Pagination ================= */

  const [query, setQuery] = useState('')

  const [dateFrom, setDateFrom] = useState('')

  const [dateTo, setDateTo] = useState('')

  const [sortBy, setSortBy] = useState('date_desc')

  const [page, setPage] = useState(1)

  const PAGE_SIZE = 48
 
  /* ================= Upload State ================= */

  const [uploadVisible, setUploadVisible] = useState(false)

  const [uploadLoading, setUploadLoading] = useState(false)

  const [uploadForm, setUploadForm] = useState({

    caseId: '',

    scanType: 'MRI',

    file: null,

    patientName: '',

    patientSex: '',

    patientAge: '',

    folderFiles: null,

    dicomFile: null

  })

  const [caseSeed, setCaseSeed] = useState(0)
 
  const generateCaseId = () => {

    const now = new Date()

    const y = now.getFullYear()

    const m = String(now.getMonth() + 1).padStart(2, '0')

    const d = String(now.getDate()).padStart(2, '0')

    const r = Math.floor(1000 + Math.random() * 9000)

    return `CASE-${y}${m}${d}-${r}`

  }
 
  useEffect(() => {

    if (uploadVisible) {

      setUploadForm((prev) => ({

        ...prev,

        caseId: prev.caseId || generateCaseId()

      }))

    }

  }, [uploadVisible, caseSeed])
 
  /* ================= Fetch Function ================= */

  const loadScans = async () => {

    setLoading(true)

    try {

      const res = await fetch(fetchUrl)

      const json = await res.json()
 
      const mapped = (json.data || []).map((s) => ({

        id: s.scan_id,

        caseId: s.case_id,

        realFilename: s.filename || (s.file_path ? s.file_path.split('/').pop() : ''),

        url: s.thumbnail,

        fileUrl: s.file_url,

        scanDate: s.scan_date,

        scanType: s.scan_type,

        patientName: s.patient_name,

        patientSex: s.patient_sex,

        patientAge: s.patient_age,
 
        // ✅ S3 storage fields

        s3Key: s.s3_key || null,

        storageType: s.storage_type || 'local',
 
        // ✅ org fields

        refOrganisation: s.ref_organisation,

        idOrganisation: s.id_organisation,

        orgLogoUrl: resolveOrgLogoUrl(s.org_logo_url) // backend should supply this

      }))
 
      setScans(mapped)

    } catch (err) {

      console.error('Failed to fetch scans', err)

      setScans([])

    }

    setLoading(false)

  }
 
  useEffect(() => {

    if (fetchUrl) loadScans()

  }, [fetchUrl])
 
  /* ================= Handle Viewer ================= */

  const openViewer = async (item) => {

    let resolvedFileUrl = item.fileUrl
 
    // ── Resolve presigned URL for S3 files ──────────────────────────────

    if (item.storageType === 's3' && item.s3Key) {

      try {

        const authString = localStorage.getItem('auth')

        let token = null

        if (authString) {

          try { token = JSON.parse(authString)?.token } catch {}

        }

        const headers = token ? { Authorization: `Bearer ${token}` } : {}

        const res = await fetch(

          `/api/storage/download-url?s3_key=${encodeURIComponent(item.s3Key)}`,

          { headers }

        )

        const data = await res.json()

        if (data?.url) resolvedFileUrl = data.url

      } catch (e) {

        console.error('[ScanRepository] Failed to resolve S3 presigned URL', e)

      }

    }
 
    const lowerUrl  = (resolvedFileUrl || '').toLowerCase()

    const lowerName = (item.realFilename || '').toLowerCase()

    const isSeries  = lowerUrl.includes('/dicom-series/')

    const isNifti   =

      lowerUrl.endsWith('.nii') ||

      lowerUrl.endsWith('.nii.gz') ||

      lowerName.endsWith('.nii') ||

      lowerName.endsWith('.nii.gz')
 
    const route = isSeries && !isNifti ? '/radiologist/dcmviewer-cpu' : '/radiologist/dcmviewer'
 
    navigate(route, {

      state: {

        fileUrl: resolvedFileUrl,

        filename: item.realFilename,

        patientName: item.patientName,

        patientAge: item.patientAge,

        patientSex: item.patientSex,

        caseId: item.caseId

      }

    })

  }
 
  /* ================= Handle Upload ================= */

  const handleUpload = async () => {

    const hasFolder = uploadForm.folderFiles && uploadForm.folderFiles.length > 0

    const hasNifti = !!uploadForm.file

    const hasDicomFile = !!uploadForm.dicomFile

    if (!uploadForm.caseId || (!hasNifti && !hasFolder && !hasDicomFile)) {

      alert('Please provide a Case ID and a NIfTI file or DICOM file/folder.')

      return

    }

    if (!uploadForm.patientName || !uploadForm.patientSex || !uploadForm.patientAge) {

      alert('Please provide Patient Name, Sex, and Age.')

      return

    }
 
    const authString = localStorage.getItem('auth')

    let userId = null

    if (authString) {

      try {

        const authData = JSON.parse(authString)

        userId = authData.userId

      } catch (e) {

        console.error('Error parsing auth data', e)

      }

    }
 
    setUploadLoading(true)
 
    const formData = new FormData()

    if (hasFolder) {

      Array.from(uploadForm.folderFiles).forEach((f) => formData.append('files', f))

    } else if (hasDicomFile) {

      formData.append('file', uploadForm.dicomFile)

    } else {

      formData.append('file', uploadForm.file)

    }

    formData.append('case_id', uploadForm.caseId)

    formData.append('scan_type', uploadForm.scanType)

    formData.append('patient_name', uploadForm.patientName)

    formData.append('patient_sex', uploadForm.patientSex)

    formData.append('patient_age', uploadForm.patientAge)

    if (userId) {

      formData.append('user_id', userId)

    }
 
    try {

      const res = await fetch('http://localhost:8000/radiology/scans/upload', {

        method: 'POST',

        body: formData

      })
 
      if (res.ok) {

        setUploadVisible(false)

        setUploadForm({

          caseId: '',

          scanType: 'MRI',

          file: null,

          patientName: '',

          patientSex: '',

          patientAge: '',

          folderFiles: null,

          dicomFile: null

        })

        loadScans()

      } else {

        const err = await res.json()

        alert('Upload failed: ' + (err.detail || 'Unknown error'))

      }

    } catch (error) {

      console.error(error)

      alert('Network error during upload')

    }

    setUploadLoading(false)

  }
 
  /* ================= Filtering Logic ================= */

  const filtered = useMemo(() => {

    let arr = scans

    if (query.trim()) {

      const q = query.toLowerCase()

      arr = arr.filter((s) => (s.caseId || '').toLowerCase().includes(q))

    }

    if (dateFrom) arr = arr.filter((s) => new Date(s.scanDate) >= new Date(dateFrom))

    if (dateTo) arr = arr.filter((s) => new Date(s.scanDate) <= new Date(dateTo))
 
    arr = [...arr]

    if (sortBy === 'date_desc') arr.sort((a, b) => new Date(b.scanDate) - new Date(a.scanDate))

    if (sortBy === 'date_asc') arr.sort((a, b) => new Date(a.scanDate) - new Date(b.scanDate))

    if (sortBy === 'name_asc') arr.sort((a, b) => (a.caseId || '').localeCompare(b.caseId || ''))
 
    return arr

  }, [scans, query, dateFrom, dateTo, sortBy])
 
  /* ================= Pagination Logic ================= */

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
 
  useEffect(() => {

    if (page > totalPages) setPage(1)

  }, [totalPages, page])
 
  const fmtDate = (d) => new Date(d).toLocaleString()
 
  return (
<div className="scan-repo p-4">
<CCard className="repo-card">
 
        <CCardHeader className="header-row">
<div className="header-left">
<h3 className="m-0">Completed Scans</h3>
<CBadge color="info">{scans.length}</CBadge>
 
            <div

              onClick={() => setUploadVisible(true)}

              style={{

                cursor: 'pointer',

                marginLeft: '10px',

                display: 'inline-block',

                verticalAlign: 'middle'

              }}

              title="Upload New Scan"
>
<svg

                xmlns="http://www.w3.org/2000/svg"

                width="32"

                height="32"

                fill="currentColor"

                className="bi bi-plus"

                viewBox="0 0 16 16"
>
<path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4" />
</svg>
</div>
</div>
 
          <div className="header-right">
<CInputGroup className="search-group">
<CInputGroupText color="primary" >Search</CInputGroupText>
<CFormInput

                placeholder="Search case ID..."

                value={query}

                onChange={(e) => {

                  setQuery(e.target.value)

                  setPage(1)

                }}

              />
</CInputGroup>
</div>
</CCardHeader>
 
        <CCardBody className="repo-card-body">
 
          {loading ? (
<div className="loading">Loading...</div>

          ) : (
<div className="scan-table">
<div className="scan-row scan-header">
<div className="col preview">Preview</div>
<div className="col case">Case ID</div>
 
              {/* ✅ ORG COLUMNS */}

              {/* ✅ Combined Organisation */}
<div className="col organisation">Organisation</div>
 
 
              <div className="col patient">Patient Name</div>
<div className="col sex">Sex</div>
<div className="col age">Age</div>
<div className="col date">Scan Date</div>
<div className="col type">Type</div>
<div className="col actions">Viewer</div>
</div>
 
            {pageSlice.map((item) => {

              const scanDateValue = item.scanDate || item.scan_date;
 
              return (
<div key={item.id} className="scan-row">
 
                  {/* Preview */}
<div className="col preview">

                    {item.url ? (
<img src={item.url} className="preview-thumb" alt="" />

                    ) : (
<div className="preview-thumb placeholder">

                        {item.scanType || 'N/A'}
</div>

                    )}
</div>
 
                  {/* Case ID */}
<div className="col case">

                    {item.caseId || 'Unknown'}
</div>
 
                  {/* ✅ Combined Organisation (Logo + Name) */}
<div className="col organisation">
<div className="org-cell">

                      {item.orgLogoUrl ? (
<img

                          src={item.orgLogoUrl}

                          alt=""

                          className="org-logo-img"

                          onError={(e) => {

                            e.currentTarget.style.display = 'none'

                          }}

                        />

                      ) : (
<div className="org-logo-fallback">

                          {item.refOrganisation?.charAt(0) || '—'}
</div>

                      )}
 
                      <span className="org-name-text">

                        {item.refOrganisation || '-'}
</span>
</div>
</div>
 
                  {/* Patient */}
<div className="col patient">

                    {item.patientName || 'Unknown'}
</div>
 
                  <div className="col sex">

                    {item.patientSex || '-'}
</div>
 
                  <div className="col age">

                    {item.patientAge ?? '-'}
</div>
 
                  {/* ✅ Scan Date (Date top, Time bottom) */}
<div className="col date">

                    {scanDateValue ? (
<>
<div className="dateTop">

                          {new Date(scanDateValue).toLocaleDateString()}
</div>
<div className="dateBottom">

                          {new Date(scanDateValue).toLocaleTimeString([], {

                            hour: "2-digit",

                            minute: "2-digit",

                            second: "2-digit",

                          })}
</div>
</>

                    ) : (
<div className="dateTop">-</div>

                    )}
</div>
 
                  {/* Type */}
<div className="col type">

                    {item.scanType || '-'}
</div>
 
                  {/* Viewer */}
<div className="col actions">
<CButton

                      size="sm"

                      color="primary"

                      className="open-viewer-btn"

                      onClick={() => openViewer(item)}
>

                      Open Viewer
</CButton>
</div>
 
                </div>

              );

            })}
</div>
 
          )}
 
          {totalPages > 1 && (
<CPagination align="center" aria-label="Page navigation">
<CPaginationItem disabled={page === 1} onClick={() => setPage(page - 1)}>

                Prev
</CPaginationItem>

              {[...Array(totalPages)].map((_, i) => (
<CPaginationItem key={i} active={i + 1 === page} onClick={() => setPage(i + 1)}>

                  {i + 1}
</CPaginationItem>

              ))}
<CPaginationItem disabled={page === totalPages} onClick={() => setPage(page + 1)}>

                Next
</CPaginationItem>
</CPagination>

          )}
</CCardBody>
</CCard>
 
      <CModal

        visible={uploadVisible}

        onClose={() => setUploadVisible(false)}

        size="sm"

        className="upload-scan-modal"

        alignment="center"
>
 
        <CModalHeader>
<CModalTitle>Upload Radiology Scan</CModalTitle>
</CModalHeader>
<CModalBody>
<div className="mb-3">
<CFormLabel>Case ID</CFormLabel>
<div className="case-id-row">
<CFormInput type="text" value={uploadForm.caseId} readOnly />
<CButton

                color="secondary"

                variant="outline"

                onClick={() => {

                  setUploadForm((prev) => ({ ...prev, caseId: generateCaseId() }))

                  setCaseSeed((v) => v + 1)

                }}
>

                Regenerate
</CButton>
</div>
</div>
 
          <div className="mb-3">
<CFormLabel>Patient Name</CFormLabel>
<CFormInput

              type="text"

              placeholder="e.g. John Doe"

              value={uploadForm.patientName}

              onChange={(e) => setUploadForm({ ...uploadForm, patientName: e.target.value })}

            />
</div>
 
          <div className="mb-3">
<CFormLabel>Sex</CFormLabel>
<CFormSelect

              value={uploadForm.patientSex}

              onChange={(e) => setUploadForm({ ...uploadForm, patientSex: e.target.value })}
>
<option value="">Select</option>
<option value="M">Male</option>
<option value="F">Female</option>
<option value="O">Other</option>
</CFormSelect>
</div>
 
          <div className="mb-3">
<CFormLabel>Age</CFormLabel>
<CFormInput

              type="number"

              min="0"

              max="120"

              placeholder="e.g. 45"

              value={uploadForm.patientAge}

              onChange={(e) => setUploadForm({ ...uploadForm, patientAge: e.target.value })}

            />
</div>
 
          <div className="mb-3">
<CFormLabel>Scan Type</CFormLabel>
<CFormSelect

              value={uploadForm.scanType}

              onChange={(e) => setUploadForm({ ...uploadForm, scanType: e.target.value })}
>
<option value="MRI">MRI </option>
<option value="CT">CT </option>
<option value="XRAY">XRAY </option>
</CFormSelect>
</div>
 
          <div className="mb-3">
<CFormLabel>NIfTI File (.nii / .nii.gz)</CFormLabel>
<CFormInput

              type="file"

              accept=".nii,.nii.gz"

              onChange={(e) =>

                setUploadForm({

                  ...uploadForm,

                  file: e.target.files[0],

                  folderFiles: null,

                  dicomFile: null,

                  scanType: uploadForm.scanType

                })

              }

            />
</div>
 
          <div className="mb-3">
<CFormLabel>DICOM Single File (.dcm)</CFormLabel>
<CFormInput

              type="file"

              accept=".dcm"

              onChange={(e) =>

                setUploadForm({

                  ...uploadForm,

                  dicomFile: e.target.files[0],

                  folderFiles: null,

                  file: null,

                  scanType: uploadForm.scanType

                })

              }

            />
</div>
 
          <div className="mb-3">
<CFormLabel>DICOM Folder (CT/MR Series)</CFormLabel>
<CFormInput

              type="file"

              multiple

              webkitdirectory="true"

              directory="true"

              onChange={(e) =>

                setUploadForm({

                  ...uploadForm,

                  folderFiles: e.target.files,

                  file: null,

                  dicomFile: null,

                  scanType: uploadForm.scanType

                })

              }

            />
<div className="text-muted small mt-1">Chrome/Edge only. For other browsers, upload a .zip.</div>
</div>
</CModalBody>
<CModalFooter>
<CButton color="secondary" onClick={() => setUploadVisible(false)}>

            Cancel
</CButton>
<CButton className="theme-btn-sm" onClick={handleUpload} disabled={uploadLoading}>

            {uploadLoading ? <CSpinner size="sm" /> : 'Upload Scan'}
</CButton>
</CModalFooter>
</CModal>
</div>

  )

}
 
