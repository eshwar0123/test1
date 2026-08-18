import React, { useEffect, useState, useCallback } from 'react'
import { useTheme } from '../../layout/ThemeContext'
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CRow,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'

const API = 'http://localhost:8000'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const LEAVE_TYPES = ['leave', 'sick', 'holiday']

const DUMMY_RADIOLOGISTS = [
  {
    user_id: 'demo-rad-1',
    name: 'Dr. Priya Raman',
    email: 'priya.raman@onixai.demo',
    department: 'Neuroradiology',
    weekly_scans: 6,
  },
  {
    user_id: 'demo-rad-2',
    name: 'Dr. Arjun Mehta',
    email: 'arjun.mehta@onixai.demo',
    department: 'Musculoskeletal',
    weekly_scans: 11,
  },
  {
    user_id: 'demo-rad-3',
    name: 'Dr. Nisha Kapoor',
    email: 'nisha.kapoor@onixai.demo',
    department: 'Chest Imaging',
    weekly_scans: 4,
  },
]

const buildDummyPending = (baseNow = Date.now()) => [
  {
    scan_id: 2014,
    case_id: 'ONX-CT-2026-014',
    patient_name: 'Rohan V',
    scan_type: 'CT',
    radiologist_name: 'Dr. Priya Raman',
    radiologist_email: 'priya.raman@onixai.demo',
    attempt: 1,
    acceptance_deadline: new Date(baseNow + 125 * 1000).toISOString(),
  },
  {
    scan_id: 2017,
    case_id: 'ONX-MRI-2026-117',
    patient_name: 'Meena S',
    scan_type: 'MRI',
    radiologist_name: 'Dr. Arjun Mehta',
    radiologist_email: 'arjun.mehta@onixai.demo',
    attempt: 2,
    acceptance_deadline: new Date(baseNow + 55 * 1000).toISOString(),
  },
]

const buildDummyLog = (baseNow = Date.now()) => [
  {
    id: 'demo-log-1',
    scan_id: 1998,
    case_id: 'ONX-MRI-2026-098',
    patient_name: 'Lakshmi R',
    scan_type: 'MRI',
    radiologist_name: 'Dr. Nisha Kapoor',
    availability_score: 17,
    specialty_score: 22,
    total_score: 39,
    assigned_at: new Date(baseNow - 22 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-log-2',
    scan_id: 2001,
    case_id: 'ONX-CT-2026-101',
    patient_name: 'Karthik P',
    scan_type: 'CT',
    radiologist_name: 'Dr. Priya Raman',
    availability_score: 18,
    specialty_score: 20,
    total_score: 38,
    assigned_at: new Date(baseNow - 41 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-log-3',
    scan_id: 2008,
    case_id: 'ONX-XR-2026-108',
    patient_name: 'Asha M',
    scan_type: 'XRAY',
    radiologist_name: 'Dr. Arjun Mehta',
    availability_score: 15,
    specialty_score: 17,
    total_score: 32,
    assigned_at: new Date(baseNow - 67 * 60 * 1000).toISOString(),
  },
]

const pickLiveOrDummy = (rows, dummyRows) => (Array.isArray(rows) && rows.length > 0 ? rows : dummyRows)

function ScoreBadge({ score, max }) {
  const pct = max > 0 ? score / max : 0
  const color = pct >= 0.8 ? 'success' : pct >= 0.5 ? 'warning' : 'danger'
  return (
    <CBadge color={color} style={{ fontSize: '12px', padding: '4px 8px' }}>
      {score}/{max}
    </CBadge>
  )
}

// ── Radiologist Schedule Editor ─────────────────────────────────────────────
function ScheduleEditor({ radiologist, onClose, isDark }) {
  const DEFAULTS = DAY_NAMES.map((_, i) => ({
    day_of_week: i,
    is_working: i < 5,
    shift_start: '09:00',
    shift_end: '17:00',
    break_start: '13:00',
    break_end: '14:00',
    max_cases: 20,
  }))

  const [rows, setRows] = useState(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    fetch(`${API}/admin/schedules/${radiologist.user_id}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data.length > 0) {
          const merged = DEFAULTS.map((def) => {
            const saved = j.data.find((d) => d.day_of_week === def.day_of_week)
            return saved ? { ...def, ...saved } : def
          })
          setRows(merged)
        }
      })
      .catch(() => {})
  }, [radiologist.user_id])

  const update = (idx, field, val) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r)))

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`${API}/admin/schedules/${radiologist.user_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      })
      const j = await res.json()
      setMsg(j.success ? { type: 'success', text: 'Schedule saved.' } : { type: 'danger', text: 'Save failed.' })
    } catch {
      setMsg({ type: 'danger', text: 'Network error.' })
    } finally {
      setSaving(false)
    }
  }

  const cardBg    = isDark ? '#0f2744' : '#f8fafc'
  const headerBg  = isDark ? '#162035' : '#e9ecef'
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : '#e9ecef'
  const textCol   = isDark ? '#e2e8f0' : '#1e293b'
  const inputStyle = {
    border: `1px solid ${isDark ? '#3b5278' : '#ced4da'}`,
    borderRadius: 4,
    padding: '2px 6px',
    background: isDark ? '#1e2d45' : '#fff',
    color: textCol,
  }

  return (
    <div style={{ background: cardBg, borderRadius: 12, padding: 24, marginTop: 12, color: textCol }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong style={{ fontSize: 16 }}>Schedule — {radiologist.name}</strong>
        <CButton size="sm" color="secondary" onClick={onClose}>
          Close
        </CButton>
      </div>
      {msg && <CAlert color={msg.type}>{msg.text}</CAlert>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: headerBg }}>
              {['Day', 'Working', 'Shift Start', 'Shift End', 'Break Start', 'Break End', 'Max Cases'].map(
                (h) => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: textCol }}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${borderCol}` }}>
                <td style={{ padding: '6px 10px', fontWeight: 600, color: textCol }}>{DAY_NAMES[i]}</td>
                <td style={{ padding: '6px 10px' }}>
                  <input
                    type="checkbox"
                    checked={row.is_working}
                    onChange={(e) => update(i, 'is_working', e.target.checked)}
                  />
                </td>
                {['shift_start', 'shift_end', 'break_start', 'break_end'].map((f) => (
                  <td key={f} style={{ padding: '6px 10px' }}>
                    <input
                      type="time"
                      value={row[f] || ''}
                      disabled={!row.is_working}
                      onChange={(e) => update(i, f, e.target.value)}
                      style={inputStyle}
                    />
                  </td>
                ))}
                <td style={{ padding: '6px 10px' }}>
                  <input
                    type="number"
                    value={row.max_cases}
                    min={1}
                    max={99}
                    onChange={(e) => update(i, 'max_cases', parseInt(e.target.value) || 1)}
                    style={{ width: 60, ...inputStyle }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, textAlign: 'right' }}>
        <CButton color="primary" onClick={save} disabled={saving}>
          {saving ? <CSpinner size="sm" /> : 'Save Schedule'}
        </CButton>
      </div>
    </div>
  )
}

// ── Leave Manager ───────────────────────────────────────────────────────────
function LeaveManager({ radiologist, onClose, isDark }) {
  const [leaves, setLeaves] = useState([])
  const [newDate, setNewDate] = useState('')
  const [newType, setNewType] = useState('leave')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = useCallback(() => {
    fetch(`${API}/admin/leaves/${radiologist.user_id}`)
      .then((r) => r.json())
      .then((j) => j.success && setLeaves(j.data))
      .catch(() => {})
  }, [radiologist.user_id])

  useEffect(() => {
    load()
  }, [load])

  const addLeave = async () => {
    if (!newDate) return
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`${API}/admin/leaves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: radiologist.user_id, leave_date: newDate, leave_type: newType, reason }),
      })
      const j = await res.json()
      if (j.success) {
        setNewDate('')
        setReason('')
        load()
      } else {
        setMsg({ type: 'danger', text: 'Failed to add leave.' })
      }
    } catch {
      setMsg({ type: 'danger', text: 'Network error.' })
    } finally {
      setSaving(false)
    }
  }

  const deleteLeave = async (id) => {
    try {
      await fetch(`${API}/admin/leaves/${id}`, { method: 'DELETE' })
      load()
    } catch {}
  }

  const cardBg   = isDark ? '#0f2744' : '#f8fafc'
  const textCol  = isDark ? '#e2e8f0' : '#1e293b'
  const inputSt  = {
    border: `1px solid ${isDark ? '#3b5278' : '#ced4da'}`,
    borderRadius: 6,
    padding: '6px 10px',
    background: isDark ? '#1e2d45' : '#fff',
    color: textCol,
  }

  return (
    <div style={{ background: cardBg, borderRadius: 12, padding: 24, marginTop: 12, color: textCol }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong style={{ fontSize: 16 }}>Leaves — {radiologist.name}</strong>
        <CButton size="sm" color="secondary" onClick={onClose}>
          Close
        </CButton>
      </div>
      {msg && <CAlert color={msg.type}>{msg.text}</CAlert>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          style={inputSt}
        />
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          style={inputSt}
        >
          {LEAVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ ...inputSt, flex: 1, minWidth: 120 }}
        />
        <CButton color="primary" size="sm" onClick={addLeave} disabled={saving || !newDate}>
          {saving ? <CSpinner size="sm" /> : 'Add'}
        </CButton>
      </div>

      {leaves.length === 0 ? (
        <p style={{ color: isDark ? '#94a3b8' : '#6b7280', fontSize: 13 }}>No leaves recorded.</p>
      ) : (
        <CTable striped small>
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>Date</CTableHeaderCell>
              <CTableHeaderCell>Type</CTableHeaderCell>
              <CTableHeaderCell>Reason</CTableHeaderCell>
              <CTableHeaderCell></CTableHeaderCell>
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {leaves.map((l) => (
              <CTableRow key={l.id}>
                <CTableDataCell>{l.leave_date}</CTableDataCell>
                <CTableDataCell>
                  <CBadge color={l.leave_type === 'holiday' ? 'info' : l.leave_type === 'sick' ? 'danger' : 'warning'}>
                    {l.leave_type}
                  </CBadge>
                </CTableDataCell>
                <CTableDataCell>{l.reason || '—'}</CTableDataCell>
                <CTableDataCell>
                  <CButton size="sm" color="danger" variant="outline" onClick={() => deleteLeave(l.id)}>
                    Remove
                  </CButton>
                </CTableDataCell>
              </CTableRow>
            ))}
          </CTableBody>
        </CTable>
      )}
    </div>
  )
}

// ── Main AutoAssign page ────────────────────────────────────────────────────
export default function AutoAssign() {
  const { isDark } = useTheme()
  const [radiologists, setRadiologists] = useState(() => DUMMY_RADIOLOGISTS)
  const [log, setLog] = useState(() => buildDummyLog())
  const [pending, setPending] = useState(() => buildDummyPending())
  const [now, setNow] = useState(Date.now())
  const [loadingRad, setLoadingRad] = useState(false)
  const [loadingLog, setLoadingLog] = useState(false)
  const [loadingPending, setLoadingPending] = useState(false)
  const [editSchedule, setEditSchedule] = useState(null)
  const [editLeave, setEditLeave] = useState(null)
  // reassign modal state
  const [reassignTarget, setReassignTarget] = useState(null) // scan obj
  const [reassignUserId, setReassignUserId] = useState('')
  const [reassigning, setReassigning] = useState(false)
  const [reassignMsg, setReassignMsg] = useState(null)

  const loadRadiologists = useCallback(async () => {
    setLoadingRad(true)
    try {
      const r = await fetch(`${API}/admin/radiologists`)
      if (!r.ok) throw new Error('radiologists endpoint unavailable')
      const j = await r.json()
      setRadiologists(pickLiveOrDummy(j?.success ? j.data : [], DUMMY_RADIOLOGISTS))
    } catch {
      setRadiologists(DUMMY_RADIOLOGISTS)
    } finally {
      setLoadingRad(false)
    }
  }, [])

  const loadLog = useCallback(async () => {
    setLoadingLog(true)
    try {
      const r = await fetch(`${API}/admin/auto-assign/log?limit=20`)
      if (!r.ok) throw new Error('log endpoint unavailable')
      const j = await r.json()
      setLog(pickLiveOrDummy(j?.success ? j.data : [], buildDummyLog()))
    } catch {
      setLog(buildDummyLog())
    } finally {
      setLoadingLog(false)
    }
  }, [])

  const loadPending = useCallback(async () => {
    setLoadingPending(true)
    try {
      const r = await fetch(`${API}/admin/scans/pending`)
      if (!r.ok) throw new Error('pending endpoint unavailable')
      const j = await r.json()
      setPending(pickLiveOrDummy(j?.success ? j.data : [], buildDummyPending()))
    } catch {
      setPending(buildDummyPending())
    } finally {
      setLoadingPending(false)
    }
  }, [])

  useEffect(() => {
    loadRadiologists()
    loadLog()
    loadPending()
  }, [loadRadiologists, loadLog, loadPending])

  // Refresh pending every 15 s + tick countdown every second
  useEffect(() => {
    const poll = setInterval(loadPending, 15000)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearInterval(poll); clearInterval(tick) }
  }, [loadPending])

  const doReassign = async () => {
    if (!reassignTarget) return
    setReassigning(true)
    setReassignMsg(null)
    try {
      const url = reassignUserId
        ? `${API}/admin/scans/${reassignTarget.scan_id}/reassign?user_id=${reassignUserId}`
        : `${API}/admin/scans/${reassignTarget.scan_id}/reassign`
      const res = await fetch(url, { method: 'POST' })
      const j = await res.json()
      if (j.success) {
        setReassignMsg({ type: 'success', text: `Reassigned to ${j.data?.assigned_to?.name || 'next best'}` })
        loadPending(); loadLog()
        setTimeout(() => { setReassignTarget(null); setReassignMsg(null); setReassignUserId('') }, 1500)
      } else {
        setReassignMsg({ type: 'danger', text: j.detail || 'Reassign failed' })
      }
    } catch {
      setReassignMsg({ type: 'danger', text: 'Network error' })
    } finally {
      setReassigning(false)
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ fontWeight: 700, marginBottom: 4 }}>Auto-Assign Management</h2>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>
        Scans uploaded by organisations are assigned automatically. Use this panel to manage
        radiologist schedules, leaves, and reassignment.
      </p>

      {/* ── Pending assignments ─────────────────────────── */}
      <CCard className="mb-4" style={{ borderLeft: '4px solid #f59e0b' }}>
        <CCardHeader style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
          Pending Acceptance
          {pending.length > 0 && <CBadge color="warning">{pending.length}</CBadge>}
          <CButton size="sm" color="secondary" variant="outline" className="ms-auto" onClick={loadPending} disabled={loadingPending}>
            {loadingPending ? <CSpinner size="sm" /> : 'Refresh'}
          </CButton>
        </CCardHeader>
        <CCardBody>
          {pending.length === 0 ? (
            <p style={{ color: '#6b7280', margin: 0 }}>No scans awaiting acceptance.</p>
          ) : (
            <CTable striped hover small>
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell>Scan ID</CTableHeaderCell>
                  <CTableHeaderCell>Case ID</CTableHeaderCell>
                  <CTableHeaderCell>Patient</CTableHeaderCell>
                  <CTableHeaderCell>Type</CTableHeaderCell>
                  <CTableHeaderCell>Assigned To</CTableHeaderCell>
                  <CTableHeaderCell>Attempt</CTableHeaderCell>
                  <CTableHeaderCell>Time Left</CTableHeaderCell>
                  <CTableHeaderCell>Action</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {pending.map((s) => {
                  const deadline = new Date(s.acceptance_deadline).getTime()
                  const secsLeft = Math.max(0, Math.round((deadline - now) / 1000))
                  const expired = secsLeft === 0
                  const urgent = secsLeft <= 20
                  return (
                    <CTableRow key={s.scan_id}>
                      <CTableDataCell>{s.scan_id}</CTableDataCell>
                      <CTableDataCell style={{ fontSize: 12 }}>{s.case_id}</CTableDataCell>
                      <CTableDataCell>{s.patient_name || '—'}</CTableDataCell>
                      <CTableDataCell><CBadge color="info">{s.scan_type}</CBadge></CTableDataCell>
                      <CTableDataCell>
                        <div style={{ fontWeight: 600 }}>{s.radiologist_name}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{s.radiologist_email}</div>
                      </CTableDataCell>
                      <CTableDataCell>#{s.attempt}</CTableDataCell>
                      <CTableDataCell>
                        <span style={{ fontWeight: 700, color: expired ? '#9ca3af' : urgent ? '#f59e0b' : '#22c55e' }}>
                          {expired ? 'Expired' : `${secsLeft}s`}
                        </span>
                      </CTableDataCell>
                      <CTableDataCell>
                        <CButton size="sm" color="warning" onClick={() => { setReassignTarget(s); setReassignUserId(''); setReassignMsg(null) }}>
                          Reassign
                        </CButton>
                      </CTableDataCell>
                    </CTableRow>
                  )
                })}
              </CTableBody>
            </CTable>
          )}
        </CCardBody>
      </CCard>

      {/* ── Reassign modal ───────────────────────────────── */}
      {reassignTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: isDark ? '#0f2744' : '#fff', borderRadius: 16, padding: 28, width: 460, maxWidth: '95vw', color: isDark ? '#e2e8f0' : '#1e293b' }}>
            <h4 style={{ fontWeight: 700, marginBottom: 4 }}>Reassign Scan #{reassignTarget.scan_id}</h4>
            <p style={{ color: isDark ? '#94a3b8' : '#6b7280', fontSize: 13, marginBottom: 20 }}>
              {reassignTarget.case_id} · {reassignTarget.patient_name} · {reassignTarget.scan_type}
            </p>

            <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
              Assign to (leave blank for auto next-best)
            </label>
            <select
              value={reassignUserId}
              onChange={(e) => setReassignUserId(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: `1px solid ${isDark ? '#3b5278' : '#d1d5db'}`, borderRadius: 8, fontSize: 14, marginBottom: 16, background: isDark ? '#1e2d45' : '#fff', color: isDark ? '#e2e8f0' : '#1e293b' }}
            >
              <option value="">— Auto (next best by score) —</option>
              {radiologists.map((r) => (
                <option key={r.user_id} value={r.user_id}>
                  {r.name} · {r.department || 'No dept'} · {r.weekly_scans} scans/week
                </option>
              ))}
            </select>

            {reassignMsg && (
              <CAlert color={reassignMsg.type} className="mb-3">{reassignMsg.text}</CAlert>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <CButton color="secondary" onClick={() => setReassignTarget(null)}>Cancel</CButton>
              <CButton color="warning" onClick={doReassign} disabled={reassigning}>
                {reassigning ? <CSpinner size="sm" /> : 'Reassign'}
              </CButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Radiologists ────────────────────────────────── */}
      <CCard className="mb-4">
        <CCardHeader style={{ fontWeight: 700 }}>
          Radiologists
          <CButton size="sm" color="secondary" variant="outline" className="ms-3" onClick={loadRadiologists}>
            Refresh
          </CButton>
        </CCardHeader>
        <CCardBody>
          {loadingRad ? (
            <CSpinner />
          ) : (
            <CTable striped hover>
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell>Name</CTableHeaderCell>
                  <CTableHeaderCell>Department</CTableHeaderCell>
                  <CTableHeaderCell>Scans (7 days)</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {radiologists.map((rad) => (
                  <CTableRow key={rad.user_id}>
                    <CTableDataCell>
                      <strong>{rad.name}</strong>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{rad.email}</div>
                    </CTableDataCell>
                    <CTableDataCell>{rad.department || '—'}</CTableDataCell>
                    <CTableDataCell>
                      <CBadge color={rad.weekly_scans >= 15 ? 'danger' : rad.weekly_scans >= 8 ? 'warning' : 'success'}>
                        {rad.weekly_scans}
                      </CBadge>
                    </CTableDataCell>
                  </CTableRow>
                ))}
              </CTableBody>
            </CTable>
          )}
        </CCardBody>
      </CCard>

      {/* ── Assignment log ──────────────────────────────── */}
      <CCard>
        <CCardHeader style={{ fontWeight: 700 }}>
          Recent Auto-Assign Log
          <CButton size="sm" color="secondary" variant="outline" className="ms-3" onClick={loadLog}>
            Refresh
          </CButton>
        </CCardHeader>
        <CCardBody>
          {loadingLog ? (
            <CSpinner />
          ) : log.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No assignments yet.</p>
          ) : (
            <CTable striped small>
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell>Scan ID</CTableHeaderCell>
                  <CTableHeaderCell>Case ID</CTableHeaderCell>
                  <CTableHeaderCell>Patient</CTableHeaderCell>
                  <CTableHeaderCell>Type</CTableHeaderCell>
                  <CTableHeaderCell>Assigned To</CTableHeaderCell>
                  <CTableHeaderCell>Availability</CTableHeaderCell>
                  <CTableHeaderCell>Specialty</CTableHeaderCell>
                  <CTableHeaderCell>Total</CTableHeaderCell>
                  <CTableHeaderCell>At</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {log.map((l) => (
                  <CTableRow key={l.id}>
                    <CTableDataCell>{l.scan_id}</CTableDataCell>
                    <CTableDataCell style={{ fontSize: 12 }}>{l.case_id}</CTableDataCell>
                    <CTableDataCell>{l.patient_name || '—'}</CTableDataCell>
                    <CTableDataCell>
                      <CBadge color="info">{l.scan_type}</CBadge>
                    </CTableDataCell>
                    <CTableDataCell>{l.radiologist_name}</CTableDataCell>
                    <CTableDataCell>
                      <ScoreBadge score={l.availability_score} max={20} />
                    </CTableDataCell>
                    <CTableDataCell>
                      <ScoreBadge score={l.specialty_score} max={25} />
                    </CTableDataCell>
                    <CTableDataCell>
                      <ScoreBadge score={l.total_score} max={45} />
                    </CTableDataCell>
                    <CTableDataCell style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {l.assigned_at ? new Date(l.assigned_at).toLocaleString() : '—'}
                    </CTableDataCell>
                  </CTableRow>
                ))}
              </CTableBody>
            </CTable>
          )}
        </CCardBody>
      </CCard>
    </div>
  )
}
