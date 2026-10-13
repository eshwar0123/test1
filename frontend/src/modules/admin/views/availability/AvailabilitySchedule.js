import React, { useRef, useState } from 'react'
import { useTheme } from '../../layout/ThemeContext'
import {
  CAlert,
  CBadge,
  CButton,
  CButtonGroup,
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CForm,
  CFormInput,
  CFormLabel,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CFormTextarea,
  CRow,
} from '@coreui/react'
import {
  addAvailabilitySlot,
  loadAvailabilitySlots,
  removeAvailabilitySlot,
} from '../../../../shared/availabilityStore'

const readAuth = () => {
  try {
    return JSON.parse(localStorage.getItem('auth') || '{}')
  } catch {
    return {}
  }
}

const dateKeyLocal = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const monthKeyLocal = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

const startOfToday = () => dateKeyLocal(new Date())
const monthNow = () => monthKeyLocal(new Date())
const isPastDateKey = (yyyyMmDd) => yyyyMmDd < startOfToday()
const firstDayOfMonth = (yyyyMm) => `${yyyyMm}-01`

const shiftMonthKey = (yyyyMm, delta) => {
  const [yearStr, monthStr] = yyyyMm.split('-')
  const dt = new Date(Number(yearStr), Number(monthStr) - 1 + delta, 1)
  return monthKeyLocal(dt)
}

const DAY_START_MIN = 0
const DAY_END_MIN = 24 * 60
const DAY_RANGE_MIN = DAY_END_MIN - DAY_START_MIN
const ADMIN_HOUR_STEP = 1
const ADMIN_HOUR_COL_WIDTH = 72
const ADMIN_HOUR_LABELS = Array.from(
  { length: DAY_RANGE_MIN / (60 * ADMIN_HOUR_STEP) },
  (_, i) => String(i * ADMIN_HOUR_STEP),
)
const ADMIN_TIMELINE_WIDTH = ADMIN_HOUR_LABELS.length * ADMIN_HOUR_COL_WIDTH

const timeToMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

const blockPos = (start, end) => {
  const s = Math.max(DAY_START_MIN, timeToMin(start))
  const e = Math.min(DAY_END_MIN, timeToMin(end))
  const left = ((s - DAY_START_MIN) / DAY_RANGE_MIN) * 100
  const width = Math.max(6, ((e - s) / DAY_RANGE_MIN) * 100)
  return { left: `${left}%`, width: `${width}%` }
}

const shiftDateKey = (yyyyMmDd, deltaDays) => {
  const dt = new Date(`${yyyyMmDd}T00:00:00`)
  dt.setDate(dt.getDate() + deltaDays)
  return dateKeyLocal(dt)
}

const ADMIN_DOCTORS = [
  { id: 'd1', name: 'Dr. James Carter',   specialty: 'Neuroradiology',      status: 'Available', tint: 'success', cases: 0, completedCases: 148, accuracyPct: 97.8 },
  { id: 'd2', name: 'Dr. Sarah Mitchell', specialty: 'Interventional',      status: 'Assigned',  tint: 'primary', cases: 1, completedCases: 212, accuracyPct: 98.6 },
  { id: 'd3', name: 'Dr. Robert Hayes',   specialty: 'Musculoskeletal',     status: 'Assigned',  tint: 'danger',  cases: 1, completedCases: 96,  accuracyPct: 96.9 },
  { id: 'd4', name: 'Dr. Emily Brooks',   specialty: 'Chest & Thoracic',    status: 'Available', tint: 'success', cases: 0, completedCases: 173, accuracyPct: 98.1 },
]

const ADMIN_ROWS = [
  {
    doctorId: 'd1',
    blocks: [
      { label: 'Available', start: '08:00', end: '13:20', color: '#6cab78' },
      { label: 'Assigned a Case', start: '13:30', end: '16:30', color: '#ee4f59', type: 'case', patientName: 'Arun Prakash', modality: 'CT Brain', patientId: '1036' },
    ],
  },
  {
    doctorId: 'd2',
    blocks: [
      { label: 'Assigned a Case', start: '08:00', end: '11:00', color: '#ee4f59', type: 'case', patientName: 'Meena Devi', modality: 'CT Abdomen', patientId: '1124' },
      { label: 'Available', start: '13:20', end: '17:00', color: '#6cab78' },
    ],
  },
  {
    doctorId: 'd3',
    blocks: [
      { label: 'Assigned a Case', start: '08:00', end: '11:00', color: '#ee4f59', type: 'case', patientName: 'Karthik N', modality: 'MRI Spine', patientId: '1188' },
      { label: 'Available', start: '16:10', end: '18:10', color: '#6cab78' },
    ],
  },
  {
    doctorId: 'd4',
    blocks: [{ label: 'Available', start: '08:00', end: '12:20', color: '#6cab78' }],
  },
]

const sortByStart = (list) =>
  [...list].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

const keyFromDate = (date) => dateKeyLocal(date)

const getMonthDays = (value) => {
  const [yearStr, monthStr] = value.split('-')
  const year = Number(yearStr)
  const monthIdx = Number(monthStr) - 1
  const firstDay = new Date(year, monthIdx, 1)
  const lastDate = new Date(year, monthIdx + 1, 0).getDate()
  const startWeekday = firstDay.getDay()
  const cells = []
  for (let i = 0; i < startWeekday; i += 1) cells.push(null)
  for (let d = 1; d <= lastDate; d += 1) cells.push(new Date(year, monthIdx, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

const formatLongDate = (yyyyMmDd) => {
  const dt = new Date(`${yyyyMmDd}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return yyyyMmDd
  return dt.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

const formatMonthTitle = (yyyyMm) => {
  const dt = new Date(`${yyyyMm}-01T00:00:00`)
  if (Number.isNaN(dt.getTime())) return yyyyMm
  return dt.toLocaleDateString([], { month: 'long', year: 'numeric' })
}

const formatSlotSummary = (startIso, endIso) => {
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '-'
  const datePart = start.toLocaleDateString([], { month: 'long', day: 'numeric' })
  const startPart = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  const endPart = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${datePart}, ${startPart} to ${endPart}`
}

export default function AvailabilitySchedule({
  defaultView = 'admin',
  hideViewToggle = false,
}) {
  const { isDark } = useTheme()
  const T = isDark
    ? { bg: '#1e293b', page: '#0f172a', border: '#334155', text: '#e2e8f0', muted: '#94a3b8', row: '#273348', header: '#1a2234' }
    : { bg: '#fff',    page: '#f7f8fb', border: '#e7e9ef', text: '#24324a', muted: '#6b7280', row: '#f7f8fb',  header: '#f7f8fb' }

  const auth = readAuth()
  const userId = auth?.userId || 'anonymous-user'
  const name = [auth?.firstName, auth?.lastName].filter(Boolean).join(' ').trim() || 'Radiologist'

  const [date, setDate] = useState(startOfToday())
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState(defaultView)
  const [doctorSearch, setDoctorSearch] = useState('')
  const [month, setMonth] = useState(monthNow())
  const [selectedDate, setSelectedDate] = useState(startOfToday())
  const [adminDate, setAdminDate] = useState(startOfToday())
  const [showSlotModal, setShowSlotModal] = useState(false)
  const [slots, setSlots] = useState(() => sortByStart(loadAvailabilitySlots()))
  const adminDateInputRef = useRef(null)

  const mySlots = slots.filter((s) => s.userId === userId)
  const days = getMonthDays(month)
  const mySlotsByDay = mySlots.reduce((acc, slot) => {
    const key = keyFromDate(new Date(slot.start))
    if (!acc[key]) acc[key] = []
    acc[key].push(slot)
    return acc
  }, {})
  const selectedMySlots = sortByStart(mySlotsByDay[selectedDate] || [])
  const currentMonth = monthNow()
  const canGoPrevMonth = month > currentMonth
  const searchKey = doctorSearch.trim().toLowerCase()
  const filteredAdminDoctors = ADMIN_DOCTORS.filter((doc) => {
    if (!searchKey) return true
    return (
      doc.name.toLowerCase().includes(searchKey) ||
      doc.specialty.toLowerCase().includes(searchKey) ||
      doc.status.toLowerCase().includes(searchKey)
    )
  })
  const filteredDoctorIds = new Set(filteredAdminDoctors.map((d) => d.id))
  const isHistoryView = adminDate < startOfToday()
  const filteredAdminRows = ADMIN_ROWS
    .filter((row) => filteredDoctorIds.has(row.doctorId))
    .map((row) => ({
      ...row,
      blocks: isHistoryView ? row.blocks.filter((block) => block.type === 'case') : row.blocks,
    }))
    .filter((row) => row.blocks.length > 0)
  const adminAvailableBlocks = filteredAdminRows.flatMap((row) =>
    row.blocks.filter((block) => block.type !== 'case'),
  )
  const doctorsFreeCount = filteredAdminRows.filter((row) =>
    row.blocks.some((block) => block.type !== 'case'),
  ).length
  const morningSlotsCount = adminAvailableBlocks.filter((block) => {
    const t = timeToMin(block.start)
    return t >= 6 * 60 && t < 12 * 60
  }).length
  const afternoonSlotsCount = adminAvailableBlocks.filter((block) => {
    const t = timeToMin(block.start)
    return t >= 12 * 60 && t < 17 * 60
  }).length
  const eveningSlotsCount = adminAvailableBlocks.filter((block) => {
    const t = timeToMin(block.start)
    return t >= 18 * 60 && t < 21 * 60
  }).length

  const openAdminDatePicker = () => {
    const el = adminDateInputRef.current
    if (!el) return
    if (typeof el.showPicker === 'function') { el.showPicker(); return }
    el.click()
  }

  const submitSlot = () => {
    setError('')
    if (isPastDateKey(date)) { setError('Past dates are closed. Please select today or a future date.'); return }
    const start = new Date(`${date}T${startTime}:00`)
    const end = new Date(`${date}T${endTime}:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) { setError('Please choose a valid date and time.'); return }
    if (end <= start) { setError('End time must be after start time.'); return }
    const overlaps = mySlots.some((slot) => {
      const slotStart = new Date(slot.start).getTime()
      const slotEnd = new Date(slot.end).getTime()
      return start.getTime() < slotEnd && end.getTime() > slotStart
    })
    if (overlaps) { setError('This slot overlaps with your existing availability.'); return }
    const next = addAvailabilitySlot({
      id: `${userId}-${start.toISOString()}-${end.toISOString()}`,
      userId,
      radiologistName: name,
      start: start.toISOString(),
      end: end.toISOString(),
      note: note.trim(),
      createdAt: new Date().toISOString(),
    })
    setNote('')
    setSlots(sortByStart(next))
    setShowSlotModal(false)
  }

  const deleteSlot = (slotId) => {
    const next = removeAvailabilitySlot(slotId, userId)
    setSlots(sortByStart(next))
  }

  return (
    <div>
      <style>{`.avail-search::placeholder { color: ${isDark ? '#7a94b8' : '#94a3b8'}; opacity: 1; }`}</style>
      <h3 className="mb-3">Availability Schedule</h3>
      {!hideViewToggle ? (
        <div className="mb-3">
          <CButtonGroup>
          </CButtonGroup>
        </div>
      ) : null}

      {viewMode === 'radiologist' ? (
        <CRow className="g-3">
          <CCol md={9}>
            <CCard>
              <CCardHeader>
                <div className="d-flex justify-content-between align-items-center">
                  <span>Pick date from calendar</span>
                  <div className="d-flex align-items-center gap-2">
                    <CButton size="sm" color="secondary" variant="outline" disabled={!canGoPrevMonth} onClick={() => { if (!canGoPrevMonth) return; const p = shiftMonthKey(month, -1); setMonth(p); setSelectedDate(firstDayOfMonth(p)) }}>Prev</CButton>
                    <span className="fw-semibold" style={{ minWidth: '120px', textAlign: 'center' }}>{formatMonthTitle(month)}</span>
                    <CButton size="sm" color="secondary" variant="outline" onClick={() => { const n = shiftMonthKey(month, 1); setMonth(n); setSelectedDate(firstDayOfMonth(n)) }}>Next</CButton>
                  </div>
                </div>
              </CCardHeader>
              <CCardBody>
                {error ? <CAlert color="danger">{error}</CAlert> : null}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '10px' }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => (
                    <div key={w} className="fw-semibold text-center text-muted">{w}</div>
                  ))}
                  {days.map((day, idx) => {
                    const key = day ? keyFromDate(day) : `empty-r-${idx}`
                    const entries = day ? mySlotsByDay[key] || [] : []
                    const isSelected = day && key === selectedDate
                    const isPast = day ? isPastDateKey(key) : false
                    const isClickable = !!day && !isPast
                    return (
                      <div key={key} className="border rounded p-2" style={{ minHeight: '96px', opacity: !day ? 0.3 : isPast ? 0.55 : 1, cursor: isClickable ? 'pointer' : 'default', background: isSelected ? (isDark ? '#1e3a5f' : '#eff6ff') : T.bg, borderColor: isSelected ? '#6ea8fe' : T.border, filter: isPast ? 'grayscale(0.55)' : 'none' }}
                        onClick={() => { if (!isClickable) return; setSelectedDate(key); setDate(key); setError('') }}>
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="fw-semibold">{day ? day.getDate() : ''}</span>
                        </div>
                        {day ? (
                          <div className="d-flex justify-content-between align-items-center">
                            <div className="small text-muted">{entries.length} {entries.length === 1 ? 'case' : 'cases'}</div>
                            {isClickable ? (
                              <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedDate(key); setDate(key); setError(''); setShowSlotModal(true) }}
                                style={{ width: '22px', height: '22px', borderRadius: '50%', border: '1px solid #6ea8fe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, lineHeight: '18px', padding: 0, cursor: 'pointer' }}>+</button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </CCardBody>
            </CCard>
          </CCol>
          <CCol md={3}>
            <CCard>
              <CCardHeader>Availability - {formatLongDate(selectedDate)}</CCardHeader>
              <CCardBody>
                {selectedMySlots.length === 0 ? (
                  <CAlert color="info" className="mb-0">No availability added for this date.</CAlert>
                ) : (
                  selectedMySlots.map((slot) => (
                    <div key={slot.id} className="d-flex justify-content-between align-items-start border rounded p-3 mb-2">
                      <div>
                        <div className="fw-semibold">{formatSlotSummary(slot.start, slot.end)}</div>
                        {slot.note ? <div className="text-muted mt-1">{slot.note}</div> : null}
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <CBadge color="success">Available</CBadge>
                        <CButton color="danger" variant="outline" size="sm" onClick={() => deleteSlot(slot.id)}>Remove</CButton>
                      </div>
                    </div>
                  ))
                )}
              </CCardBody>
            </CCard>
          </CCol>
          <CModal visible={showSlotModal} alignment="center" onClose={() => setShowSlotModal(false)}>
            <CModalHeader><CModalTitle>Add availability - {formatLongDate(date)}</CModalTitle></CModalHeader>
            <CModalBody>
              {error ? <CAlert color="danger">{error}</CAlert> : null}
              <CForm onSubmit={(e) => { e.preventDefault(); submitSlot() }}>
                <div className="mb-3"><CFormLabel>Start time</CFormLabel><CFormInput type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required /></div>
                <div className="mb-3"><CFormLabel>End time</CFormLabel><CFormInput type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required /></div>
                <div className="mb-1"><CFormLabel>Notes (optional)</CFormLabel><CFormTextarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Example: Emergency reads only" /></div>
                <CModalFooter className="px-0 pb-0">
                  <CButton color="secondary" variant="outline" onClick={() => setShowSlotModal(false)}>Cancel</CButton>
                  <CButton type="submit" color="primary">Save</CButton>
                </CModalFooter>
              </CForm>
            </CModalBody>
          </CModal>
        </CRow>
      ) : (
        <div className="p-2" style={{ background: T.page, borderRadius: '12px' }}>
          <CRow className="g-3">
            <CCol lg={12}>
              <CCard className="border-0">
                <CCardBody>
                  <div className="mb-3 d-flex justify-content-between align-items-center gap-3 flex-wrap">
                    <div style={{ minWidth: '300px', maxWidth: '360px', width: '100%' }}>
                      <CFormInput
                        className="avail-search"
                        placeholder="Search doctor/specialty/status"
                        value={doctorSearch}
                        onChange={(e) => setDoctorSearch(e.target.value)}
                        style={{
                          background: isDark ? '#1e2d45' : '#ffffff',
                          border: `1px solid ${isDark ? '#3b5278' : '#d1d5db'}`,
                          color: isDark ? '#e2e8f0' : '#1e293b',
                          borderRadius: 8,
                          padding: '8px 14px',
                        }}
                      />
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <CButton size="sm" color="secondary" variant="outline" onClick={() => setAdminDate((d) => shiftDateKey(d, -1))}>{'<'}</CButton>
                      <CBadge color="dark" className="px-3 py-2" style={{ fontSize: '0.95rem', cursor: 'pointer' }} onClick={openAdminDatePicker}>{formatLongDate(adminDate)}</CBadge>
                      <CButton size="sm" color="secondary" variant="outline" onClick={() => setAdminDate((d) => shiftDateKey(d, 1))}>{'>'}</CButton>
                      <CButton size="sm" color="secondary" variant="outline" onClick={() => setAdminDate((d) => d)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </CButton>
                      <CFormInput ref={adminDateInputRef} type="date" value={adminDate} onChange={(e) => setAdminDate(e.target.value)} style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }} />
                    </div>
                  </div>
                  <CRow className="g-3 mb-3">
                    <CCol md={3}><CCard className="h-100"><CCardBody className="py-2"><div className="small text-muted">Doctors Free</div><div className="h4 mb-0">{doctorsFreeCount}</div></CCardBody></CCard></CCol>
                    <CCol md={3}><CCard className="h-100"><CCardBody className="py-2"><div className="small text-muted">Morning (06:00-12:00)</div><div className="h4 mb-0">{morningSlotsCount}</div></CCardBody></CCard></CCol>
                    <CCol md={3}><CCard className="h-100"><CCardBody className="py-2"><div className="small text-muted">Afternoon (12:00-17:00)</div><div className="h4 mb-0">{afternoonSlotsCount}</div></CCardBody></CCard></CCol>
                    <CCol md={3}><CCard className="h-100"><CCardBody className="py-2"><div className="small text-muted">Evening (18:00-21:00)</div><div className="h4 mb-0">{eveningSlotsCount}</div></CCardBody></CCard></CCol>
                  </CRow>
                  <div className="border rounded" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
                    <div style={{ minWidth: `${220 + ADMIN_TIMELINE_WIDTH}px` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: `220px repeat(${ADMIN_HOUR_LABELS.length}, ${ADMIN_HOUR_COL_WIDTH}px)`, background: T.header, borderBottom: `1px solid ${T.border}` }}>
                        <div className="p-2 fw-semibold text-muted" style={{ position: 'sticky', left: 0, zIndex: 6, background: T.header, borderRight: `1px solid ${T.border}`, color: T.muted }}>Doctor</div>
                        {ADMIN_HOUR_LABELS.map((tick) => (<div key={tick} className="p-2 small text-muted border-start">{tick}</div>))}
                      </div>
                      {filteredAdminRows.map((row) => {
                        const doc = ADMIN_DOCTORS.find((d) => d.id === row.doctorId)
                        return (
                          <div key={row.doctorId} style={{ display: 'grid', gridTemplateColumns: `220px ${ADMIN_TIMELINE_WIDTH}px`, minHeight: '76px', borderTop: '1px solid #eff1f6' }}>
                            <div className="p-2 border-end" style={{ position: 'sticky', left: 0, zIndex: 5, background: T.bg, borderColor: T.border }}>
                              <div className="position-relative admin-doctor-cell">
                                <div className="fw-semibold">{doc?.name}</div>
                                <div className="small text-muted">Specialty: {doc?.specialty}</div>
                                <div className="doctor-hover-card-in-table">
                                  <div className="d-flex align-items-center gap-2 mb-2">
                                    <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: isDark ? '#334155' : '#d7deea', display: 'grid', placeItems: 'center', fontWeight: 700, color: T.text, fontSize: '18px' }}>
                                      {doc?.name?.replace('Dr. ', '')?.split(' ')?.map((p) => p[0])?.join('')?.slice(0, 2)}
                                    </div>
                                    <div><div className="fw-semibold">{doc?.name}</div><div className="small text-muted">{doc?.specialty}</div></div>
                                  </div>
                                  <div className="small mb-1"><span className="fw-semibold">Cases Completed:</span> {doc?.completedCases}</div>
                                  <div className="small mb-1"><span className="fw-semibold">Current Queue:</span> {doc?.cases || 0}</div>
                                  <div className="small text-muted"><span className="fw-semibold">Accuracy:</span> {doc?.accuracyPct}%</div>
                                </div>
                              </div>
                            </div>
                            <div className="position-relative p-2">
                              <div style={{ position: 'absolute', inset: '0', backgroundImage: `repeating-linear-gradient(to right, ${T.border} 0, ${T.border} 1px, transparent 1px, transparent ${ADMIN_HOUR_COL_WIDTH}px)` }} />
                              {row.blocks.map((block, i) => {
                                const pos = blockPos(block.start, block.end)
                                const displayLabel = isHistoryView && block.type === 'case' ? 'Completed Task' : block.label
                                const displayColor = isHistoryView && block.type === 'case' ? '#4f7fd8' : block.color
                                return (
                                  <div key={`${row.doctorId}-${i}`} className={`text-white px-2 py-1 rounded ${block.type === 'case' ? 'admin-case-block' : ''}`}
                                    style={{ position: 'absolute', top: `${12 + i * 34}px`, left: pos.left, width: pos.width, background: displayColor, fontSize: '12px', overflow: block.type === 'case' ? 'visible' : 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', zIndex: 2 }}
                                    title={`${displayLabel} (${block.start}-${block.end})`}>
                                    {`${displayLabel} (${block.start}-${block.end})`}
                                    {block.type === 'case' ? (
                                      <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: '0', minWidth: '220px', background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '10px 12px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', display: 'none', zIndex: 999, whiteSpace: 'normal' }} className="case-hover-card">
                                        <div className="small mb-1"><span className="fw-semibold">Patient Name:</span> {block.patientName}</div>
                                        <div className="small mb-1"><span className="fw-semibold">Modality:</span> {block.modality}</div>
                                        <div className="small mb-1"><span className="fw-semibold">Patient ID:</span> {block.patientId}</div>
                                        {isHistoryView ? <div className="small mb-1 text-success"><span className="fw-semibold">Status:</span> Completed</div> : null}
                                        <div className="small text-muted"><span className="fw-semibold">Time:</span> {block.start} - {block.end}</div>
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                      {filteredAdminRows.length === 0 ? (
                        <div className="p-3"><CAlert color="warning" className="mb-0">No doctors matched your search.</CAlert></div>
                      ) : null}
                    </div>
                  </div>
                </CCardBody>
              </CCard>
            </CCol>
          </CRow>
        </div>
      )}
      <style>{`
        .case-hover-card { pointer-events: none; }
        .admin-case-block:hover > .case-hover-card { display: block; }
        .admin-doctor-cell { overflow: visible; }
        .doctor-hover-card-in-table {
          position: absolute; left: calc(100% + 12px); top: -8px; width: 250px;
          background: ${isDark ? '#1e293b' : 'linear-gradient(160deg, #e8eef8 0%, #dbe6f6 100%)'};
          border: 1px solid ${isDark ? '#334155' : '#bccbe3'}; border-radius: 10px; padding: 10px 12px;
          color: ${isDark ? '#e2e8f0' : '#24324a'};
          box-shadow: 0 10px 26px rgba(34,52,84,0.2); display: none; z-index: 40;
        }
        .admin-doctor-cell:hover > .doctor-hover-card-in-table { display: block; }
      `}</style>
    </div>
  )
}