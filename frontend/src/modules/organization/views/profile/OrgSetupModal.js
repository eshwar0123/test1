import { useState, useEffect } from 'react'
import './OrgSetupModal.css'

const ORG_TYPES = [
  'Hospital', 'Clinic', 'Private Practice', 'Urgent Care Center',
  'Imaging Center', 'Diagnostic Laboratory', 'Rehabilitation Center', 'Specialty Center',
]

const ADMIN_ROLES = ['CMO', 'CEO', 'Practice Manager', 'Compliance Officer', 'IT Administrator', 'Other']

const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]

const EMPTY = {
  orgName: '', orgType: '', npi: '', ein: '', clia: '', website: '',
  email: '', phone: '', fax: '', street: '', city: '', state: '', zip: '', country: 'India',
  adminName: '', adminEmail: '', adminPhone: '', adminRole: '',
  hipaaOfficerName: '', hipaaOfficerEmail: '', logo: '',
}

/* ── Validators ─────────────────────────────────────────────────────────── */
const isEmail  = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
const isNPI    = v => /^\d{10}$/.test(v.trim())
const isEIN    = v => /^\d{2}-\d{7}$/.test(v.trim())
const isZIP    = v => /^\d{5}$/.test(v.trim())
const isUSPhone = v => v.replace(/\D/g, '').length === 10

const OrgSetupModal = ({ onComplete, onBack }) => {
  const [form, setForm]   = useState(EMPTY)
  const [step, setStep]   = useState(1)
  const [errors, setErrors] = useState({})

  // ✅ On mount: pull username + email from core_schema.users (the row we
  // logged in with) and prefill the two fields that should be authoritative
  // against the user account — Organization Name (form.orgName) and
  // Primary Email (form.email). Both are then rendered read-only so the
  // operator cannot change them via this form.
  //
  // Strategy: read from localStorage.auth FIRST (instant, no network) since
  // the login flow already stashes username + email there. Then refresh
  // against the backend as authoritative source — if anything in
  // localStorage is stale (admin renamed the org, etc.) the backend value
  // wins. Either way the field gets populated even if the backend is down.
  useEffect(() => {
    // Step 1: instant prefill from localStorage.auth (no network)
    try {
      const auth = JSON.parse(localStorage.getItem('auth') || '{}')
      setForm(f => ({
        ...f,
        orgName: f.orgName || auth?.username || '',
        email:   f.email   || auth?.email    || '',
      }))
    } catch {}

    // Step 2: refresh from backend (authoritative). Silent on failure —
    // localStorage values from step 1 stay in place.
    let authToken = null
    try {
      const auth = JSON.parse(localStorage.getItem('auth') || '{}')
      authToken = auth?.token || null
    } catch {}

    if (!authToken) return

    fetch('/api/organization/current-user', {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!j?.ok || !j.data) return
        setForm(f => ({
          ...f,
          // username from core_schema.users → Organization Name (locked)
          orgName: j.data.username || f.orgName,
          // email from core_schema.users → Primary Email (locked)
          email:   j.data.email    || f.email,
        }))
      })
      .catch(() => {})
  }, [])

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }))

  const handleLogo = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => set('logo', ev.target.result)
    reader.readAsDataURL(file)
  }

  const validateStep1 = () => { setErrors({}); return true }
  const validateStep2 = () => { setErrors({}); return true }
  const validateStep3 = () => { setErrors({}); return true }

  const next = () => {
    if (step === 1 && !validateStep1()) return
    if (step === 2 && !validateStep2()) return
    if (step === 3 && !validateStep3()) return
    setErrors({})
    setStep(s => s + 1)
  }

  const submit = async () => {
    const payload = { ...form }

    // ✅ Persist to organization_schema.org_profile via the backend FIRST.
    // The backend overrides orgName + email server-side using
    // core_schema.users (those two fields are locked in the UI but a
    // tampered client could still send different values).
    let authToken = null
    try {
      const auth = JSON.parse(localStorage.getItem('auth') || '{}')
      authToken = auth?.token || null
    } catch {}

    if (authToken) {
      try {
        const res = await fetch('/api/organization/org-profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(payload),
        })
        const j = await res.json().catch(() => null)
        if (!res.ok || !j?.ok) {
          console.error('[OrgSetupModal] save failed:', res.status, j)
          alert('Could not save profile to server: ' + (j?.detail || `HTTP ${res.status}`))
          return
        }
        console.log('[OrgSetupModal] saved to DB:', j.data)
      } catch (err) {
        console.error('[OrgSetupModal] network error:', err)
        alert('Network error while saving profile: ' + err.message)
        return
      }
    }

    // Mirror to localStorage so Profile.js + AppHeader (which read from
    // localStorage for instant render) stay in sync without a refetch.
    localStorage.setItem('org_profile', JSON.stringify(payload))

    // ✅ Notify other components (e.g. AppHeader) that the org profile —
    // including the logo — has changed. AppHeader listens on this event and
    // re-reads localStorage.org_profile so the new logo appears immediately
    // in the avatar slot without needing a page reload.
    try { window.dispatchEvent(new CustomEvent('org-profile-updated')) } catch {}

    onComplete()
  }

  return (
    <div className="osm-overlay">
      <div className="osm-modal">
        <div className="osm-header">
          <h2 className="osm-title">Setup Organization Profile</h2>
          <p className="osm-subtitle">This information will appear on your profile page</p>
          <div className="osm-steps">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className={`osm-step ${step === n ? 'active' : step > n ? 'done' : ''}`}>
                <span>{step > n ? '✓' : n}</span>
                <label>{['Basic Info', 'Contact', 'Admin', 'Preview'][n - 1]}</label>
              </div>
            ))}
          </div>
        </div>

        <div className="osm-body">

          {/* ── STEP 1: Basic Info ─────────────────────────────────────── */}
          {step === 1 && (
            <div className="osm-section">
              <div className="osm-logo-upload">
                <div className="osm-logo-preview">
                  {form.logo
                    ? <img src={form.logo} alt="logo" />
                    : <span className="osm-logo-placeholder">Logo</span>}
                </div>
                <label className="osm-upload-btn">
                  Upload Logo
                  <input type="file" accept="image/*" onChange={handleLogo} hidden />
                </label>
              </div>

              <div className="osm-row">
                <div className="osm-field">
                  <label>Organization Name</label>
                  {/* ✅ LOCKED: value comes from core_schema.users.username,
                      cannot be edited from this form. */}
                  <input
                    value={form.orgName}
                    readOnly
                    title="Organization name is set from your account and cannot be changed here."
                    placeholder="e.g. City General Hospital"
                    style={{ opacity: 0.75, cursor: 'not-allowed', background: '#eef2f7' }}
                  />
                  {errors.orgName && <span className="osm-err">{errors.orgName}</span>}
                </div>
                <div className="osm-field">
                  <label>Organization Type</label>
                  <select value={form.orgType} onChange={e => set('orgType', e.target.value)}>
                    <option value="">Select type</option>
                    {ORG_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  {errors.orgType && <span className="osm-err">{errors.orgType}</span>}
                </div>
              </div>

              <div className="osm-row">
                <div className="osm-field">
                  <label>NPI Number</label>
                  <input
                    value={form.npi}
                    onChange={e => set('npi', e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="e.g. 1234567890"
                    maxLength={10}
                  />
                  {errors.npi && <span className="osm-err">{errors.npi}</span>}
                </div>
                <div className="osm-field">
                  <label>EIN / Tax ID</label>
                  <input
                    value={form.ein}
                    onChange={e => {
                      let v = e.target.value.replace(/[^\d-]/g, '')
                      if (v.length === 2 && !v.includes('-') && e.nativeEvent.inputType !== 'deleteContentBackward') v += '-'
                      set('ein', v.slice(0, 10))
                    }}
                    placeholder="e.g. 12-3456789"
                    maxLength={10}
                  />
                  {errors.ein && <span className="osm-err">{errors.ein}</span>}
                </div>
              </div>

              <div className="osm-row">
                <div className="osm-field">
                  <label>CLIA Number <span className="osm-optional">(optional)</span></label>
                  <input value={form.clia} onChange={e => set('clia', e.target.value)} placeholder="e.g. 12D0123456" />
                </div>
                <div className="osm-field">
                  <label>Website</label>
                  <input value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://yourorg.com" />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Contact ────────────────────────────────────────── */}
          {step === 2 && (
            <div className="osm-section">
              <div className="osm-row">
                <div className="osm-field">
                  <label>Primary Email</label>
                  {/* ✅ LOCKED: value comes from core_schema.users.email
                      (the email used to log in), cannot be edited here. */}
                  <input
                    value={form.email}
                    readOnly
                    title="Primary email is your login email and cannot be changed here."
                    placeholder="contact@org.com"
                    style={{ opacity: 0.75, cursor: 'not-allowed', background: '#eef2f7' }}
                  />
                  {errors.email && <span className="osm-err">{errors.email}</span>}
                </div>
                <div className="osm-field">
                  <label>Phone Number</label>
                  <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 XXXXX XXXXX" />
                  {errors.phone && <span className="osm-err">{errors.phone}</span>}
                </div>
              </div>

              <div className="osm-row">
                <div className="osm-field">
                  <label>Fax Number <span className="osm-optional">(optional)</span></label>
                  <input value={form.fax} onChange={e => set('fax', e.target.value)} placeholder="+91 XXXXX XXXXX" />
                  {errors.fax && <span className="osm-err">{errors.fax}</span>}
                </div>
                <div className="osm-field">
                  {/* spacer */}
                </div>
              </div>

              <div className="osm-field full">
                <label>Street Address</label>
                <input value={form.street} onChange={e => set('street', e.target.value)} placeholder="e.g. No. 12, Gandhi Road, Anna Nagar" />
                {errors.street && <span className="osm-err">{errors.street}</span>}
              </div>

              <div className="osm-row">
                <div className="osm-field">
                  <label>City</label>
                  <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="e.g. Chennai" />
                  {errors.city && <span className="osm-err">{errors.city}</span>}
                </div>
                <div className="osm-field">
                  <label>State</label>
                  <select value={form.state} onChange={e => set('state', e.target.value)}>
                    <option value="">Select state</option>
                    {INDIA_STATES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="osm-row">
                <div className="osm-field">
                  <label>PIN Code</label>
                  <input
                    value={form.zip}
                    onChange={e => set('zip', e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="e.g. 600001"
                    maxLength={6}
                  />
                  {errors.zip && <span className="osm-err">{errors.zip}</span>}
                </div>
                <div className="osm-field">
                  <label>Country</label>
                  <input value={form.country} onChange={e => set('country', e.target.value)} placeholder="e.g. India" />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Admin ──────────────────────────────────────────── */}
          {step === 3 && (
            <div className="osm-section">
              <div className="osm-row">
                <div className="osm-field">
                  <label>Admin / Contact Name</label>
                  <input value={form.adminName} onChange={e => set('adminName', e.target.value)} placeholder="Dr. John Smith" />
                  {errors.adminName && <span className="osm-err">{errors.adminName}</span>}
                </div>
                <div className="osm-field">
                  <label>Admin Title / Role</label>
                  <select value={form.adminRole} onChange={e => set('adminRole', e.target.value)}>
                    <option value="">Select role</option>
                    {ADMIN_ROLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div className="osm-row">
                <div className="osm-field">
                  <label>Admin Email</label>
                  <input value={form.adminEmail} onChange={e => set('adminEmail', e.target.value)} placeholder="admin@org.com" />
                  {errors.adminEmail && <span className="osm-err">{errors.adminEmail}</span>}
                </div>
                <div className="osm-field">
                  <label>Admin Phone</label>
                  <input value={form.adminPhone} onChange={e => set('adminPhone', e.target.value)} placeholder="+91 XXXXX XXXXX" />
                  {errors.adminPhone && <span className="osm-err">{errors.adminPhone}</span>}
                </div>
              </div>

              <div className="osm-row">
                <div className="osm-field">
                  <label>HIPAA Privacy Officer Name</label>
                  <input value={form.hipaaOfficerName} onChange={e => set('hipaaOfficerName', e.target.value)} placeholder="Full name of Privacy Officer" />
                  {errors.hipaaOfficerName && <span className="osm-err">{errors.hipaaOfficerName}</span>}
                </div>
                <div className="osm-field">
                  <label>HIPAA Privacy Officer Email</label>
                  <input value={form.hipaaOfficerEmail} onChange={e => set('hipaaOfficerEmail', e.target.value)} placeholder="privacy@org.com" />
                  {errors.hipaaOfficerEmail && <span className="osm-err">{errors.hipaaOfficerEmail}</span>}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 4: Preview ────────────────────────────────────────── */}
          {step === 4 && (
            <div className="osm-preview">
              <div className="osm-preview-hero">
                {form.logo
                  ? <img src={form.logo} alt="logo" className="osm-preview-logo" />
                  : <div className="osm-preview-logo-placeholder">{form.orgName?.[0] || 'O'}</div>}
                <div>
                  <div className="osm-preview-orgname">{form.orgName}</div>
                  <span className="osm-preview-badge">{form.orgType}</span>
                </div>
              </div>

              <div className="osm-preview-grid">
                <div className="osm-preview-card">
                  <div className="osm-preview-card-title">Basic Information</div>
                  <div className="osm-preview-row"><span>Org Name</span><span>{form.orgName}</span></div>
                  <div className="osm-preview-row"><span>Type</span><span>{form.orgType}</span></div>
                  <div className="osm-preview-row"><span>NPI Number</span><span>{form.npi}</span></div>
                  <div className="osm-preview-row"><span>EIN / Tax ID</span><span>{form.ein}</span></div>
                  {form.clia && <div className="osm-preview-row"><span>CLIA Number</span><span>{form.clia}</span></div>}
                  {form.website && <div className="osm-preview-row"><span>Website</span><span>{form.website}</span></div>}
                </div>

                <div className="osm-preview-card">
                  <div className="osm-preview-card-title">Contact Details</div>
                  <div className="osm-preview-row"><span>Email</span><span>{form.email}</span></div>
                  <div className="osm-preview-row"><span>Phone</span><span>{form.phone}</span></div>
                  {form.fax && <div className="osm-preview-row"><span>Fax</span><span>{form.fax}</span></div>}
                  <div className="osm-preview-row">
                    <span>Address</span>
                    <span>{[form.street, form.city, form.state, form.zip, form.country].filter(Boolean).join(', ')}</span>
                  </div>
                </div>

                <div className="osm-preview-card">
                  <div className="osm-preview-card-title">Admin / Point of Contact</div>
                  <div className="osm-preview-row"><span>Name</span><span>{form.adminName}</span></div>
                  {form.adminRole && <div className="osm-preview-row"><span>Role</span><span>{form.adminRole}</span></div>}
                  <div className="osm-preview-row"><span>Email</span><span>{form.adminEmail}</span></div>
                  {form.adminPhone && <div className="osm-preview-row"><span>Phone</span><span>{form.adminPhone}</span></div>}
                </div>

                <div className="osm-preview-card">
                  <div className="osm-preview-card-title">Compliance</div>
                  <div className="osm-preview-row"><span>HIPAA Officer</span><span>{form.hipaaOfficerName}</span></div>
                  <div className="osm-preview-row"><span>Officer Email</span><span>{form.hipaaOfficerEmail}</span></div>
                </div>
              </div>

              <p className="osm-preview-note">Please review your details before saving. Click Back to make changes.</p>
            </div>
          )}
        </div>

        <div className="osm-footer">
          {step === 1
            ? onBack && <button className="osm-btn-back" onClick={onBack}>← Dashboard</button>
            : <button className="osm-btn-back" onClick={() => { setErrors({}); setStep(s => s - 1) }}>Back</button>
          }
          {step < 4
            ? <button className="osm-btn-next" onClick={next}>Next →</button>
            : <button className="osm-btn-submit" onClick={submit}>Confirm & Save</button>
          }
        </div>
      </div>
    </div>
  )
}

export default OrgSetupModal
