import React, { useState, useEffect } from 'react'
import api from "../../../../shared/api/axios"

import {
  CCard,
  CCardHeader,
  CCardBody,
  CForm,
  CFormInput,
  CFormLabel,
  CRow,
  CCol,
  CButton,
  CFormCheck
} from '@coreui/react'
import { useNavigate } from 'react-router-dom'
import { apptheme } from './../theme/colors/apptheme'

import PhoneInput from 'react-phone-input-2'
import 'react-phone-input-2/lib/style.css'

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
  "New Hampshire","New Jersey","New Mexico","New York","North Carolina",
  "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island",
  "South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming"
]

const DRAFT_KEY = "draft.radiologist.profile"

const emptyAddr = { address1: "", address2: "", city: "", state: "", zip: "" }

const RadiologistProfile = () => {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    dob: "",
    phone: "",
  })

  const [permanent, setPermanent] = useState({
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
  })

  const [temporary, setTemporary] = useState({
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
  })

  const [sameAsPermanent, setSameAsPermanent] = useState(false)
  const [nameLocked, setNameLocked] = useState(false)

  const navigate = useNavigate()

  const phoneStyles = {
    containerStyle: { width: '100%' },
    inputStyle: {
      width: '100%',
      height: '40px',
      backgroundColor: 'white',
      color: 'black',
      border: '1px solid #4a4b50',
    },
    buttonStyle: {
      backgroundColor: 'white',
      borderRight: '1px solid #4a4b50',
    },
    dropdownStyle: {
      backgroundColor: 'white',
      color: 'black',
      border: '1px solid #4a4b50',
    },
  }

  const overrideDarkMode = `
    .country-list { background-color: white !important; color: black !important; }
    .country-list .country:hover { background-color:rgb(231, 232, 236) !important; color: black !important; }
    .selected-flag { background-color:rgb(248, 243, 243) !important; border-color: #4a4b50 !important; }
  `

  // 1) Optional: load draft only (DO NOT load name/email from localStorage anymore)
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null")
      if (draft) {
        setForm((p) => ({ ...p, ...draft.form }))
        setPermanent(draft.permanent || emptyAddr)
        setTemporary(draft.temporary || emptyAddr)
        setSameAsPermanent(!!draft.sameAsPermanent)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2) Load from backend (DB is source of truth)
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/radiologist/profile")
        const d = res.data || {}

        const fn = (d.first_name ?? "").trim()
        const ln = (d.last_name ?? "").trim()
        const hasName = Boolean(fn || ln)

        // 🔥 If DB has no name/profile, clear stale localStorage identity
        if (!hasName) {
          localStorage.removeItem("firstName")
          localStorage.removeItem("lastName")
          localStorage.removeItem("email")
        }

        setNameLocked(hasName)

        setForm((p) => ({
          ...p,
          firstName: fn || "",
          lastName: ln || "",
          email: (d.email ?? p.email) || "",
          phone: (d.phone ?? p.phone) || "",
          dob: (d.dob ?? p.dob) || "",
        }))

        setPermanent(d.permanent_address || emptyAddr)
        setTemporary(d.temporary_address || emptyAddr)

        // if temp equals permanent, auto tick
        const pa = d.permanent_address || {}
        const ta = d.temporary_address || {}
        const isSame =
          JSON.stringify(pa || {}) === JSON.stringify(ta || {}) &&
          Object.keys(pa || {}).length > 0
        setSameAsPermanent(isSame)
      } catch (e) {
        // New user / profile not created yet → allow editing & clear stale identity
        setNameLocked(false)
        localStorage.removeItem("firstName")
        localStorage.removeItem("lastName")
        localStorage.removeItem("email")
      }
    }
    load()
  }, [])

  // 3) Auto-save local draft so user can close browser without clicking save
  useEffect(() => {
    const draft = { form, permanent, temporary, sameAsPermanent }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [form, permanent, temporary, sameAsPermanent])

  const handleFormChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handlePermanent = (e) => {
    const next = { ...permanent, [e.target.name]: e.target.value }
    setPermanent(next)
    if (sameAsPermanent) setTemporary(next)
  }

  const handleTemporary = (e) => {
    setTemporary({ ...temporary, [e.target.name]: e.target.value })
  }

  const handleSameAddress = () => {
    const updated = !sameAsPermanent
    setSameAsPermanent(updated)

    if (!updated) {
      setTemporary({ address1: "", address2: "", city: "", state: "", zip: "" })
    } else {
      setTemporary({ ...permanent })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const payload = {
      first_name: form.firstName,
      last_name: form.lastName,
      email: form.email,
      phone: form.phone,
      dob: form.dob,
      permanent_address: permanent,
      temporary_address: sameAsPermanent ? permanent : temporary,
    }

    try {
      await api.post("/radiologist/profile", payload)

      // ✅ once saved, remove draft (DB has it)
      localStorage.removeItem(DRAFT_KEY)

      // keep base identity updated (NOW it will be correct)
      localStorage.setItem("firstName", form.firstName || "")
      localStorage.setItem("lastName", form.lastName || "")
      localStorage.setItem("email", form.email || "")

      alert("Details Saved Successfully!")
      navigate("/radiologist/kyc")
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.detail || "Failed to save personal details")
    }
  }

  return (
    <>
      <style>{overrideDarkMode}</style>

      <CCard>
        <CCardHeader>
          <h5 style={apptheme.tx("h2")}>Radiologist Personal Details</h5>
          <div style={{ fontSize: "14px", color: "#6c757d" }}>
            <span style={{ color: "#007bff", fontWeight: "bold" }}>Personal Details</span>
            &nbsp;›&nbsp; KYC &nbsp;›&nbsp; Education Profile &nbsp;›&nbsp; Experience &nbsp;›&nbsp; Job Preferences
          </div>
        </CCardHeader>

        <CCardBody>
          <CForm onSubmit={handleSubmit}>
            <CRow className="mb-3">
              <CCol md={6}>
                <CFormLabel style={apptheme.tx("label")}>First Name</CFormLabel>
                <CFormInput
                  name="firstName"
                  value={form.firstName}
                  onChange={handleFormChange}
                  disabled={nameLocked}
                />
              </CCol>

              <CCol md={6}>
                <CFormLabel style={apptheme.tx("label")}>Last Name</CFormLabel>
                <CFormInput
                  name="lastName"
                  value={form.lastName}
                  onChange={handleFormChange}
                  disabled={nameLocked}
                />
              </CCol>
            </CRow>

            <CRow className="mb-3">
              <CCol md={6}>
                <CFormLabel style={apptheme.tx("label")}>Email</CFormLabel>
                <CFormInput
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleFormChange}
                  readOnly
                  disabled
                />
                <div style={{ fontSize: 12, color: "#6c757d", marginTop: 4 }}>
                  Email is from login and cannot be changed.
                </div>
              </CCol>

              <CCol md={6}>
                <CFormLabel style={apptheme.tx("label")}>Phone Number</CFormLabel>
                <PhoneInput
                  country={'us'}
                  value={form.phone}
                  onChange={(phone) => setForm({ ...form, phone })}
                  containerStyle={phoneStyles.containerStyle}
                  inputStyle={phoneStyles.inputStyle}
                  buttonStyle={phoneStyles.buttonStyle}
                  dropdownStyle={phoneStyles.dropdownStyle}
                />
              </CCol>
            </CRow>

            <CRow className="mb-3">
              <CCol md={6}>
                <CFormLabel style={apptheme.tx("label")}>Date of Birth</CFormLabel>
                <CFormInput type="date" name="dob" value={form.dob || ""} onChange={handleFormChange} />
              </CCol>
            </CRow>

            <h6 style={apptheme.tx("h3", { marginTop: 40 })}>Permanent Address</h6>

            <CRow className="mb-3">
              <CCol md={6}>
                <CFormLabel style={apptheme.tx("label")}>Address Line 1</CFormLabel>
                <CFormInput name="address1" value={permanent.address1} onChange={handlePermanent} required />
              </CCol>

              <CCol md={6}>
                <CFormLabel style={apptheme.tx("label")}>Address Line 2</CFormLabel>
                <CFormInput name="address2" value={permanent.address2} onChange={handlePermanent} />
              </CCol>
            </CRow>

            <CRow className="mb-3">
              <CCol md={4}>
                <CFormLabel style={apptheme.tx("label")}>City</CFormLabel>
                <CFormInput name="city" value={permanent.city} onChange={handlePermanent} required />
              </CCol>

              <CCol md={4}>
                <CFormLabel style={apptheme.tx("label")}>State</CFormLabel>
                <select
                  name="state"
                  value={permanent.state}
                  onChange={handlePermanent}
                  className="form-select"
                  style={{ backgroundColor: 'white', color: 'black', border: '1px solid #4a4b50' }}
                  required
                >
                  <option value="">Select State</option>
                  {US_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
              </CCol>

              <CCol md={4}>
                <CFormLabel style={apptheme.tx("label")}>ZIP Code</CFormLabel>
                <CFormInput name="zip" value={permanent.zip} onChange={handlePermanent} maxLength={5} required />
              </CCol>
            </CRow>

            <CRow className="mb-3">
              <CCol>
                <CFormCheck
                  label="Temporary Address same as Permanent Address"
                  checked={sameAsPermanent}
                  onChange={handleSameAddress}
                />
              </CCol>
            </CRow>

            <h6 style={apptheme.tx("h3", { marginTop: 40 })}>Temporary Address</h6>

            <CRow className="mb-3">
              <CCol md={6}>
                <CFormLabel style={apptheme.tx("label")}>Address Line 1</CFormLabel>
                <CFormInput name="address1" value={temporary.address1} onChange={handleTemporary} disabled={sameAsPermanent} />
              </CCol>

              <CCol md={6}>
                <CFormLabel style={apptheme.tx("label")}>Address Line 2</CFormLabel>
                <CFormInput name="address2" value={temporary.address2} onChange={handleTemporary} disabled={sameAsPermanent} />
              </CCol>
            </CRow>

            <CRow className="mb-3">
              <CCol md={4}>
                <CFormLabel style={apptheme.tx("label")}>City</CFormLabel>
                <CFormInput name="city" value={temporary.city} onChange={handleTemporary} disabled={sameAsPermanent} />
              </CCol>

              <CCol md={4}>
                <CFormLabel style={apptheme.tx("label")}>State</CFormLabel>
                <select
                  name="state"
                  value={temporary.state}
                  onChange={handleTemporary}
                  className="form-select"
                  disabled={sameAsPermanent}
                  style={{ backgroundColor: 'white', color: 'black', border: '1px solid #4a4b50' }}
                >
                  <option value="">Select State</option>
                  {US_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
              </CCol>

              <CCol md={4}>
                <CFormLabel style={apptheme.tx("label")}>ZIP Code</CFormLabel>
                <CFormInput name="zip" value={temporary.zip} onChange={handleTemporary} maxLength={5} disabled={sameAsPermanent} />
              </CCol>
            </CRow>

            <div className="text-end">
              <CButton type="submit" color="primary">Save & Continue</CButton>
            </div>
          </CForm>
        </CCardBody>
      </CCard>
    </>
  )
}

export default RadiologistProfile
