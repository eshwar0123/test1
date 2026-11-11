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

// Same relative API address the dashboard uses (VITE_API_BASE_URL = /api in production).
const API =
  (typeof import.meta !== 'undefined' && import.meta.env &&
    (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE)) || ''

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const LEAVE_TYPES = ['leave', 'sick', 'holiday']





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
// ─── Real data helpers ───────────────────────────────────────────────────────
// The page reads real cases from /admin/dashboard/assignments, the doctor picker from
// /admin/assignable-radiologists, the radiologist list from /admin/directory/radiologists,
// and reassigns with POST /admin/cases/{case_id}/assign. Nothing here is made up: if a
// request fails, the page says so.
const authHeaders = () => {
  let tok = null
  try {
    const a = JSON.parse(localStorage.getItem('auth') || 'null')
    tok = a?.token || a?.access_token
  } catch { /* not logged in */ }
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

const getJson = async (path) => {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

const fmtWhen = (ms) =>
  ms
    ? new Date(ms).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
    : '—'

const PRIORITY_COLOR = { critical: 'danger', urgent: 'warning', regular: 'secondary' }

export default function AutoAssign() {
  const { isDark } = useTheme()
  const [cases, setCases] = useState([])            // assigned, not completed
  const [casesError, setCasesError] = useState('')
  const [loadingCases, setLoadingCases] = useState(false)
  const [search, setSearch] = useState('')
  const [radiologists, setRadiologists] = useState([])
  const [radError, setRadError] = useState('')
  const [loadingRad, setLoadingRad] = useState(false)
  const [pickList, setPickList] = useState([])      // doctors you can reassign to
  // reassign modal state
  const [reassignTarget, setReassignTarget] = useState(null) // case row
  const [reassignRadId, setReassignRadId] = useState('')
  const [reassigning, setReassigning] = useState(false)
  const [reassignMsg, setReassignMsg] = useState(null)

  const loadCases = useCallback(async () => {
    setLoadingCases(true)
    try {
      const j = await getJson('/admin/dashboard/assignments?range=overall&limit=1000')
      const rows = Array.isArray(j?.rows) ? j.rows : []
      setCases(rows.filter((r) => r.status === 'pending' && r.radiologist !== 'Unassigned'))
      setCasesError('')
    } catch {
      setCasesError('Could not load the assigned cases from the server.')
    } finally {
      setLoadingCases(false)
    }
  }, [])

  const loadRadiologists = useCallback(async () => {
    setLoadingRad(true)
    try {
      const j = await getJson('/admin/directory/radiologists')
      setRadiologists(Array.isArray(j) ? j : [])
      setRadError('')
    } catch {
      setRadError('Could not load the radiologists from the server.')
    } finally {
      setLoadingRad(false)
    }
  }, [])

  const loadPickList = useCallback(async () => {
    try {
      const j = await getJson('/admin/assignable-radiologists')
      setPickList(Array.isArray(j) ? j : [])
    } catch {
      setPickList([])
    }
  }, [])

  useEffect(() => {
    loadCases()
    loadRadiologists()
    loadPickList()
  }, [loadCases, loadRadiologists, loadPickList])

  // Keep the case list fresh (a doctor may finish a case, or a colleague may reassign it).
  useEffect(() => {
    const poll = setInterval(loadCases, 30000)
    return () => clearInterval(poll)
  }, [loadCases])

  const doReassign = async () => {
    if (!reassignTarget || !reassignRadId) return
    setReassigning(true)
    setReassignMsg(null)
    try {
      const res = await fetch(`${API}/admin/cases/${encodeURIComponent(reassignTarget.caseId)}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ rad_id: reassignRadId }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.success) {
        setReassignMsg({ type: 'success', text: `Reassigned to ${j.data?.radiologist || 'the selected radiologist'}` })
        loadCases(); loadRadiologists()
        setTimeout(() => { setReassignTarget(null); setReassignMsg(null); setReassignRadId('') }, 1500)
      } else {
        setReassignMsg({ type: 'danger', text: (typeof j.detail === 'string' && j.detail) || 'Reassign failed' })
      }
    } catch {
      setReassignMsg({ type: 'danger', text: 'Network error' })
    } finally {
      setReassigning(false)
    }
  }

  const q = search.trim().toLowerCase()
  const shown = q
    ? cases.filter((c) => [c.caseId, c.org, c.radiologist, c.type].some((v) => String(v || '').toLowerCase().includes(q)))
    : cases

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ fontWeight: 700, marginBottom: 4 }}>Auto-Assign Management</h2>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>
        Scans uploaded by organisations are assigned automatically. Use this panel to reassign a case
        that is assigned but not completed to another radiologist.
      </p>

      {/* ── Assigned cases ──────────────────────────────── */}
      <CCard className="mb-4" style={{ borderLeft: '4px solid #f59e0b' }}>
        <CCardHeader style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          Assigned Cases (not completed)
          {cases.length > 0 && <CBadge color="warning">{cases.length}</CBadge>}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search case, organisation, radiologist…"
            style={{ marginLeft: 'auto', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, minWidth: 240 }}
          />
          <CButton size="sm" color="secondary" variant="outline" onClick={loadCases} disabled={loadingCases}>
            {loadingCases ? <CSpinner size="sm" /> : 'Refresh'}
          </CButton>
        </CCardHeader>
        <CCardBody>
          {casesError ? (
            <CAlert color="danger" className="mb-0">{casesError}</CAlert>
          ) : shown.length === 0 ? (
            <p style={{ color: '#6b7280', margin: 0 }}>
              {loadingCases ? 'Loading…' : q ? 'No cases match your search.' : 'No assigned cases are waiting.'}
            </p>
          ) : (
            <div style={{ maxHeight: 460, overflowY: 'auto' }}>
              <CTable striped hover small>
                <CTableHead>
                  <CTableRow>
                    <CTableHeaderCell>Case ID</CTableHeaderCell>
                    <CTableHeaderCell>Organisation</CTableHeaderCell>
                    <CTableHeaderCell>Type</CTableHeaderCell>
                    <CTableHeaderCell>Priority</CTableHeaderCell>
                    <CTableHeaderCell>Assigned To</CTableHeaderCell>
                    <CTableHeaderCell>Assigned At</CTableHeaderCell>
                    <CTableHeaderCell>Action</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {shown.map((c) => (
                    <CTableRow key={c.id}>
                      <CTableDataCell style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.caseId}</CTableDataCell>
                      <CTableDataCell>{c.org}</CTableDataCell>
                      <CTableDataCell><CBadge color="info">{c.type}</CBadge></CTableDataCell>
                      <CTableDataCell><CBadge color={PRIORITY_COLOR[c.priority] || 'secondary'}>{c.priority}</CBadge></CTableDataCell>
                      <CTableDataCell style={{ fontWeight: 600 }}>{c.radiologist}</CTableDataCell>
                      <CTableDataCell style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtWhen(c.inTime)}</CTableDataCell>
                      <CTableDataCell>
                        <CButton size="sm" color="warning" onClick={() => { setReassignTarget(c); setReassignRadId(''); setReassignMsg(null) }}>
                          Reassign
                        </CButton>
                      </CTableDataCell>
                    </CTableRow>
                  ))}
                </CTableBody>
              </CTable>
            </div>
          )}
        </CCardBody>
      </CCard>

      {/* ── Reassign modal ───────────────────────────────── */}
      {reassignTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: isDark ? '#0f2744' : '#fff', borderRadius: 16, padding: 28, width: 480, maxWidth: '95vw', color: isDark ? '#e2e8f0' : '#1e293b' }}>
            <h4 style={{ fontWeight: 700, marginBottom: 4 }}>Reassign case</h4>
            <p style={{ color: isDark ? '#94a3b8' : '#6b7280', fontSize: 13, marginBottom: 6, fontFamily: 'monospace' }}>
              {reassignTarget.caseId}
            </p>
            <p style={{ color: isDark ? '#94a3b8' : '#6b7280', fontSize: 13, marginBottom: 20 }}>
              {reassignTarget.org} · {reassignTarget.type} · currently with <strong>{reassignTarget.radiologist}</strong>
            </p>

            <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
              Reassign to
            </label>
            <select
              value={reassignRadId}
              onChange={(e) => setReassignRadId(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: `1px solid ${isDark ? '#3b5278' : '#d1d5db'}`, borderRadius: 8, fontSize: 14, marginBottom: 16, background: isDark ? '#0b1f3a' : '#fff', color: isDark ? '#e2e8f0' : '#1e293b' }}
            >
              <option value="">— Choose a radiologist —</option>
              {pickList.map((r) => (
                <option key={r.rad_id} value={r.rad_id} disabled={!r.is_active}>
                  {r.name}{r.specialization ? ` · ${r.specialization}` : ''}{r.is_active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
            {pickList.length === 0 && (
              <p style={{ color: '#b91c1c', fontSize: 13 }}>Could not load the list of radiologists.</p>
            )}

            {reassignMsg && (
              <CAlert color={reassignMsg.type} className="mb-3">{reassignMsg.text}</CAlert>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <CButton color="secondary" onClick={() => setReassignTarget(null)}>Cancel</CButton>
              <CButton color="warning" onClick={doReassign} disabled={reassigning || !reassignRadId}>
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
          {radError ? (
            <CAlert color="danger" className="mb-0">{radError}</CAlert>
          ) : loadingRad && radiologists.length === 0 ? (
            <CSpinner />
          ) : (
            <CTable striped hover>
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell>Name</CTableHeaderCell>
                  <CTableHeaderCell>Qualification</CTableHeaderCell>
                  <CTableHeaderCell>Status</CTableHeaderCell>
                  <CTableHeaderCell>Cases</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {radiologists.map((rad) => (
                  <CTableRow key={rad.user_id}>
                    <CTableDataCell>
                      <strong>{`${rad.first_name || ''} ${rad.last_name || ''}`.trim()}</strong>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{rad.contact_email}</div>
                    </CTableDataCell>
                    <CTableDataCell>{rad.qualification || '—'}</CTableDataCell>
                    <CTableDataCell>
                      <CBadge color={rad.is_active ? 'success' : 'danger'}>{rad.is_active ? 'Active' : 'Inactive'}</CBadge>
                    </CTableDataCell>
                    <CTableDataCell>
                      <CBadge color="info">{rad.cases ?? 0}</CBadge>
                    </CTableDataCell>
                  </CTableRow>
                ))}
              </CTableBody>
            </CTable>
          )}
        </CCardBody>
      </CCard>

      <p style={{ color: '#6b7280', fontSize: 13 }}>
        Schedules, leaves and an assignment history are not available yet: the system does not record them.
      </p>
    </div>
  )
}
