// frontend/src/views/pages/otp/OtpVerify.js
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CButton, CCard, CCardBody, CCol, CContainer, CForm, CFormInput, CRow
} from '@coreui/react'

const OtpVerify = () => {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(()=>{
    const pending = localStorage.getItem('pending_email')
    if (!pending) {
      navigate('/register')
      return
    }
    setEmail(pending)
  }, [navigate])

  const handleVerify = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ email, otp })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'OTP verify failed')
      // token returned on verify
      if (data.token) {
        localStorage.setItem('auth_token', data.token)
      }
      localStorage.removeItem('pending_email')
      alert('Verified — logged in')
      navigate('/dashboard')
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    try {
      const res = await fetch('/api/resend-otp', {
        method: 'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(email)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Resend failed')
      alert('OTP resent')
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="bg-body-tertiary min-vh-100 d-flex flex-row align-items-center">
      <CContainer>
        <CRow className="justify-content-center">
          <CCol md={5}>
            <CCard className="p-4">
              <CCardBody>
                <h2>Verify OTP</h2>
                <p>Enter the 6-digit OTP sent to <b>{email}</b></p>
                <CForm onSubmit={handleVerify}>
                  <CFormInput placeholder="OTP" value={otp} onChange={e=>setOtp(e.target.value)} minLength={6} maxLength={6} required />
                  <div className="mt-3">
                    <CButton type="submit" disabled={loading}>{loading ? 'Verifying...' : 'Verify'}</CButton>
                    <CButton className="ms-2" color="secondary" onClick={handleResend}>Resend</CButton>
                  </div>
                </CForm>
              </CCardBody>
            </CCard>
          </CCol>
        </CRow>
      </CContainer>
    </div>
  )
}

export default OtpVerify

