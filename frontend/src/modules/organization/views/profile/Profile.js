import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Profile.css'
import OrgSetupModal from './OrgSetupModal'

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
  const [data, setData] = useState(() => {
    const raw = localStorage.getItem('org_profile')
    return raw ? JSON.parse(raw) : null
  })
  const [showSetup, setShowSetup] = useState(!data)

  const handleComplete = () => {
    const raw = localStorage.getItem('org_profile')
    setData(raw ? JSON.parse(raw) : null)
    setShowSetup(false)
  }

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
          <span className="op-badge">{data.orgType}</span>
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
