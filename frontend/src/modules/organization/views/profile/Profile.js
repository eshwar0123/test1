import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Profile.css'
import OrgSetupModal from './OrgSetupModal'

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8100"
// Uploaded files are served by the backend outside the /api proxy prefix
// (e.g. /uploads/... not /api/uploads/...).
const STATIC_BASE = API_BASE.replace(/\/api\/?$/, "")

const getAuth = () => {
  try { return JSON.parse(localStorage.getItem('auth') || 'null') } catch { return null }
}

const buildLogoUrl = (logoPath) => {
  if (!logoPath) return ''
  if (/^https?:\/\//i.test(logoPath)) return logoPath
  return `${STATIC_BASE}/${logoPath.replace(/^\/+/, '')}`
}

// Maps organization_schema.org_profile (snake_case, from GET /organization/org-profile)
// into the shape this page + OrgSetupModal's form use (camelCase).
const mapServerRow = (row) => !row ? null : ({
  orgName: row.org_name || '',
  orgType: row.org_type || '',
  gst: row.gst || '',
  website: row.website || '',
  email: row.email || '',
  phone: row.contact_number || '',
  fax: row.fax || '',
  street: row.street || '',
  city: row.city || '',
  state: row.state || '',
  zip: row.zip || '',
  country: row.country || '',
  adminName: row.org_admin_name || '',
  adminRole: row.admin_role || '',
  adminEmail: row.org_admin_email || '',
  adminPhone: row.org_admin_contact || '',
  logo: buildLogoUrl(row.logo_path),
})

// Used only for an instant first paint while the authoritative backend fetch
// is in flight. A cached blob only belongs to the current user if its email
// matches theirs — org_profile is a single un-namespaced localStorage key,
// so a mismatch means it's a previous account's leftover session data.
const readCachedOwnProfile = () => {
  const raw = localStorage.getItem('org_profile')
  if (!raw) return null
  let parsed
  try { parsed = JSON.parse(raw) } catch { return null }

  const auth = getAuth()
  if (auth?.email && parsed?.email && parsed.email !== auth.email) {
    localStorage.removeItem('org_profile')
    return null
  }
  return parsed
}

const Row = ({ label, value }) =>
  value ? (
    <div className="op-row">
      <span className="op-label">{label}</span>
      <span className="op-value">{value}</span>
    </div>
  ) : null

// Indian phone format — "+91 XXXXXXXXXX". Strips any existing country code /
// non-digits first so it works whether the number was saved as
// "9876543210", "+91 9876543210", or "09876543210".
const formatPhone = (v) => {
  if (!v) return ''
  const digits = v.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  return last10.length === 10 ? `+91 ${last10}` : v
}

const Profile = () => {
  const navigate = useNavigate()
  const [data, setData] = useState(readCachedOwnProfile)
  const [checking, setChecking] = useState(true)
  const [showSetup, setShowSetup] = useState(false)

  // Backend is the source of truth — localStorage is only a same-session
  // cache for instant render. Without this, logging out (which must clear
  // the cache to stop it leaking into the next account) would make an
  // already-set-up org look like it needs setup again on every re-login.
  useEffect(() => {
    let cancelled = false
    const auth = getAuth()
    const token = auth?.token

    if (!token) {
      setChecking(false)
      setShowSetup(true)
      return
    }

    fetch(`${API_BASE}/organization/org-profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        const mapped = mapServerRow(json?.data)
        if (mapped) {
          setData(mapped)
          localStorage.setItem('org_profile', JSON.stringify(mapped))
          setShowSetup(false)
        } else {
          localStorage.removeItem('org_profile')
          setData(null)
          setShowSetup(true)
        }
      })
      .catch((err) => {
        console.warn('[Profile] failed to load org-profile:', err.message)
        if (cancelled) return
        // Backend unreachable — keep showing whatever cache we already
        // verified belongs to this user; only force setup if we had nothing.
        setShowSetup((prev) => data ? prev : true)
      })
      .finally(() => { if (!cancelled) setChecking(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleComplete = () => {
    setData(readCachedOwnProfile())
    setShowSetup(false)
  }

  if (checking && !data) return null

  if (showSetup || !data) {
    return <OrgSetupModal onComplete={handleComplete} onBack={() => navigate('../dashboard')} />
  }

  const address = [data.street, data.city, data.state, data.zip, data.country]
    .filter(Boolean).join(', ')

  return (
    <div className="op-page">
      <div className="op-hero">
        <div className="op-logo-wrap">
          {data.logo
            ? <img src={data.logo} alt="org logo" className="op-logo-img" />
            : <div className="op-logo-placeholder">{data.orgName?.[0] || 'O'}</div>}
        </div>
        <div className="op-hero-info">
          <h1 className="op-org-name">{data.orgName}</h1>
          {data.orgType && <span className="op-badge">{data.orgType}</span>}
        </div>
        <button
          className="op-reset-btn"
          onClick={() => { localStorage.removeItem('org_profile'); setData(null); setShowSetup(true) }}
        >
          ↺ Reset Profile
        </button>
      </div>

      <div className="op-cards">
        <div className="op-card">
          <div className="op-card-title">Basic Information</div>
          <Row label="Organization Name" value={data.orgName} />
          <Row label="Type" value={data.orgType} />
          <Row label="GST Number" value={data.gst} />
          <Row label="Website" value={data.website} />
        </div>

        <div className="op-card">
          <div className="op-card-title">Contact Details</div>
          <Row label="Email" value={data.email} />
          <Row label="Phone" value={formatPhone(data.phone)} />
          <Row label="Fax" value={formatPhone(data.fax)} />
          <Row label="Address" value={address} />
        </div>

        <div className="op-card">
          <div className="op-card-title">Admin / Point of Contact</div>
          <Row label="Name" value={data.adminName} />
          <Row label="Role / Title" value={data.adminRole} />
          <Row label="Email" value={data.adminEmail} />
          <Row label="Phone" value={formatPhone(data.adminPhone)} />
        </div>
      </div>
    </div>
  )
}

export default Profile
