import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from "../../shared/api/axios";
// medical icons
import { FaUserMd } from "react-icons/fa";   // doctor (stethoscope)
import { FaHospital } from "react-icons/fa"; // hospital building


import TermsAndConditions from './TermsAndConditions'
import { useLocation } from 'react-router-dom'
import {
  CButton,
  CCard,
  CCardBody,
  CCol,
  CContainer,
  CForm,
  CFormInput,
  CInputGroup,
  CInputGroupText,
  CRow,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilLockLocked,
  cilUser,
  cilEnvelopeClosed,
  cilBriefcase,
} from '@coreui/icons'
import { apptheme } from "../colors/apptheme";


// Google logo import
import { FcGoogle } from 'react-icons/fc'

// Google OAuth
import { useGoogleLogin } from '@react-oauth/google'

const OTP_LENGTH = 6

const Register = () => {
  const navigate = useNavigate()

  const [role, setRole] = useState('radiologist') // ✅ default
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState(new Array(OTP_LENGTH).fill(''))
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false) // show password toggle
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpVerified, setOtpVerified] = useState(false)
  const [googleUser, setGoogleUser] = useState(null) // NEW Google user
  const otpRefs = useRef([])
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [showCodeSent, setShowCodeSent] = useState(false)
  const resetForm = () => {
    setFirstName('')
    setLastName('')
    setEmail('')
    setOtp(new Array(OTP_LENGTH).fill(''))
    setPassword('')
    setConfirm('')
    setOtpSent(false)
    setOtpVerified(false)
    setGoogleUser(null)
    setAgreeTerms(false)
    setError('')
  }
  
  


  // Hide error automatically after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error])
 

  

  // ========================
  // Send OTP
  // ========================
  const handleSendOtp = async () => {
    if (!email) {
      setError('Please enter email first')
      return
    }
    if (!role) {
      setError('Please select Radiologist or organization')
      return
    }
  
    try {
      const response = await api.post("/send-otp", {
        email: email,
        role: role
      })
  
      if (response.status === 200) {
        setOtpSent(true)
        setError('')
  
        // ✅ Show "Code sent" for 3 seconds
        setShowCodeSent(true)
        setTimeout(() => {
          setShowCodeSent(false)
        }, 3000)
  
      } else {
        setError('Failed to send OTP')
      }
    } catch (err) {
      console.error(err)
      setError('Server error while sending OTP')
    }
  }
  

  // ========================
  // OTP input handling
  // ========================
  const handleOtpChange = (element, index) => {
    if (isNaN(element.value)) return
    const newOtp = [...otp]
    newOtp[index] = element.value
    setOtp(newOtp)
    if (element.value !== '' && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1].focus()
    }
  }

  // ========================
  // Verify OTP
  // ========================
  const handleVerifyOtp = async () => {
    const otpString = otp.join('')
    if (otpString.length < OTP_LENGTH) {
      setError('Enter full OTP')
      return
    }
    try {
      const response = await api.post('/verify-otp', {
        email,
        otp: otpString,
      })
      if (response.data.message === 'OTP verified successfully') {
        setOtpVerified(true)
        setError('')
      } else {
        setError('Invalid OTP')
      }
    } catch (err) {
      setError('OTP verification failed')
    }
  }

  const location = useLocation()

  useEffect(() => {
    if (location.state?.prefillEmail) {
      setEmail(location.state.prefillEmail)
    }
  }, [location.state])


  // ========================
  // Final Register
  // ========================
  const handleRegister = async (e) => {
    e.preventDefault()
  
    if (!role) {
      setError('Please select Radiologist or organization')
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match")
      return
    }
    if (!agreeTerms) {
      setError('You must agree to Terms & Conditions')
      return
    }
  
    // 👉 Build username from first + last name
    const usernameCombined = `${firstName} ${lastName}`.trim()
    if (!usernameCombined) {
      setError('Please enter first name and last name')
      return
    }
  
    try {
      let response
      if (googleUser) {
        // Google completion
        response = await api.post('/complete-google-registration', {
          email,
          username: usernameCombined,
          password,
          confirm_password: confirm,
          role: googleUser.role,
        })
      } else {
        // Normal registration
        if (!otpVerified) {
          setError('Please verify OTP first')
          return
        }
        response = await api.post('/register', {
          email,
          username: usernameCombined,
          password,
          role,
        })
      }
  
      if (
        response.data.message === 'User registered successfully' ||
        response.data.message === 'Registration completed successfully'
      ) {
        setError('Account created successfully!')
        navigate('/login')
      } else {
        setError(response.data.message || JSON.stringify(response.data) || 'Registration failed')
      }
    } catch (err) {
      console.error('Axios error:', err.response?.data || err)
      setError('Registration failed! Please try again.')
    }
  }
  

  // ========================
  // Google Signup / Login
  // ========================
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const res = await api.get('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        })
        const { email: googleEmail, name: googleName } = res.data
  
        if (!role) {
          setError('Please select Radiologist or organization for Google signup')
          return
        }
  
        // ✅ Immediately show verified tick and set user info
        setGoogleUser({ email: googleEmail, role })
        setEmail(googleEmail)
        const parts = googleName.split(" ");
        setFirstName(parts[0]);
        setLastName(parts.slice(1).join(" "));
        setOtpVerified(true)  // Tick shows instantly
        setError('')
  
        // ✅ Call backend asynchronously, no await delay
        api.post('/google-login', {
          email: googleEmail,
          name: googleName,
          role: role
        })
        .then(response => {
          if (!response.data.needs_registration) {
            setError(`Login successful as ${response.data.role}`)
            navigate('/login')
          }
          // Optional: handle needs_registration response if needed
        })
        .catch(err => {
          console.error('Server Google login failed', err)
          setError('Google login failed on server')
        })
  
      } catch (err) {
        console.error(err)
        setError('Google login failed')
      }
    },
    onError: () => setError('Google login failed')
  })
  
  return (
    <div className="bg-body-tertiary min-vh-100 d-flex flex-row align-items-center" style={{
      background: apptheme.gradients.authBg,
      position: 'relative'
    }}>
            {/* Top-left logo */}
     <img
  src="/logo.png"
  alt="SanPlosis"
  style={{
    position: 'absolute',
    top: 11,
    left: 12,
    height: 55,
    width: 190,
    
  }}
/>

      <CContainer>
        <CRow className="justify-content-center">
          <CCol md={9} lg={7} xl={6}>
            <CCard className="mx-4" style={apptheme.card.base}>
              <CCardBody className="p-4">
                <CButton
                  color="light"
                  shape="rounded-pill"
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 500,
                    padding: '5px 10px',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: apptheme.colors.primary2,
                    color: apptheme.colors.white,
                    border: "none",
                    border: 'none',
                    boxShadow: 'none',
                    color: 'white',
                    fontWeight: '600'
                    
                  }}
                  onClick={() => navigate(-1)} // goes back
                 >
                  ← Back
                </CButton>

                <h1>Register</h1>
                <p className="text-body-secondary">Select account type</p>

               

                {/* Normal OTP Registration */}
                {role && !googleUser && (
                  <>
                    <CForm onSubmit={handleRegister}>
                      <h5 className="mb-3 text-center">
                        Register as <b>{role.toUpperCase()}</b>
                      </h5>

                      <CRow className="mb-4 text-center">
                        <CCol md={6} style={{ order: 2 }}>
                          <div
                            onClick={() => {
                              if (role !== "radiologist") resetForm()
                              setRole("radiologist")
                            }}
                            style={{
                              ...apptheme.roleCard.base,
                              ...(role === "radiologist"
                                ? apptheme.roleCard.radiologist.active
                                : apptheme.roleCard.radiologist.inactive),
                            }}
                            onMouseEnter={(e) => {
                              if (role !== "radiologist") {
                                e.currentTarget.style.background = apptheme.roleCard.radiologist.hover
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (role !== "radiologist") {
                                e.currentTarget.style.background =
                                  apptheme.roleCard.radiologist.inactive.background
                              }
                            }}
                          >
                            <FaUserMd size={42} />

                            <h5 className="mt-2">Radiologist</h5>
                          </div>
                        </CCol>

                        <CCol md={6} style={{ order: 1 }}>
                          <div
                            onClick={() => {
                              if (role !== "organization") resetForm()
                              setRole("organization")
                            }}
                            style={{
                              ...apptheme.roleCard.base,
                              ...(role === "organization"
                                ? apptheme.roleCard.organization.active
                                : apptheme.roleCard.organization.inactive),
                            }}
                            onMouseEnter={(e) => {
                              if (role !== "organization") {
                                e.currentTarget.style.background = apptheme.roleCard.organization.hover
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (role !== "organization") {
                                e.currentTarget.style.background =
                                  apptheme.roleCard.organization.inactive.background
                              }
                            }}
                          >
                           <FaHospital size={42} />

                            <h5 className="mt-2">Organization</h5>
                          </div>
                        </CCol>
                      </CRow>



                      {/* Username */}
                      
{/* ================= ROLE BASED INPUTS ================= */}

{role === "radiologist" && (
  <>
    <CInputGroup className="mb-3">
      <CInputGroupText>
        <CIcon icon={cilUser} />
      </CInputGroupText>
      <CFormInput
        placeholder="First Name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
      />
    </CInputGroup>

    <CInputGroup className="mb-3">
      <CInputGroupText>
        <CIcon icon={cilUser} />
      </CInputGroupText>
      <CFormInput
        placeholder="Last Name"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
      />
    </CInputGroup>
  </>
)}

{role === "organization" && (
  <CInputGroup className="mb-3">
    <CInputGroupText>
      <CIcon icon={cilBriefcase} />
    </CInputGroupText>
    <CFormInput
      placeholder="Organization Name"
      value={firstName}
      onChange={(e) => setFirstName(e.target.value)}
    />
  </CInputGroup>
)}



                      {/* Email + Send OTP */}
                      <CInputGroup className="mb-2">
                        <CInputGroupText>
                          <CIcon icon={cilEnvelopeClosed} />
                        </CInputGroupText>

                        <CFormInput
                          placeholder="Email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          disabled={otpSent && otpVerified}
                        />

                        {/* ✅ Verified Tick on right side */}
                        {otpVerified && (
                          <CInputGroupText style={{ color: 'green', fontWeight: '600' }}>
                            ✔ Verified
                          </CInputGroupText>
                        )}
                      </CInputGroup>

                      {/* ✅ Get OTP button */}
                      {!otpSent && !otpVerified && (
                        <div className="mb-3 text-end">
                          <CButton
                            onClick={handleSendOtp}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              boxShadow: 'none',
                              color: '#4b2c88',
                              fontWeight: '600',
                              padding: 0,
                              cursor: 'pointer'
                            }}
                            onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                            onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}
                          >
                            Get Verification Code
                          </CButton>
                        </div>
                      )}

                      {/* ✅ Resend OTP */}
                      {/* ✅ Resend OTP */}
                      {otpSent && !otpVerified && (
                        <div className="mb-3 d-flex justify-content-between align-items-center">
                          {/* Left side: Code sent message (always exists, but empty when not shown) */}
                          <div
                            style={{
                              color: 'green',
                              fontWeight: '600',
                              minWidth: '100px', // optional, keeps spacing consistent
                              visibility: showCodeSent ? 'visible' : 'hidden',
                            }}
                          >
                            ✅ Code sent
                          </div>

                          {/* Right side: Resend button */}
                          <CButton
                            onClick={handleSendOtp}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              boxShadow: 'none',
                              color: '#4b2c88',
                              fontWeight: '600',
                              padding: 0,
                              cursor: 'pointer'
                            }}
                            onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                            onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}
                          >
                            Resend Code
                          </CButton>
                        </div>
                      )}








                      {/* Verification Code with 6 boxes */}
                      {otpSent && !otpVerified && (
                        <>
                          <div className="mb-2"><b>Verification Code</b></div>
                          <div className="d-flex justify-content-between mb-3">
                            {otp.map((digit, i) => (
                              <CFormInput
                                key={i}
                                maxLength={1}
                                value={digit}
                                onChange={e => handleOtpChange(e.target, i)}
                                ref={el => otpRefs.current[i] = el}
                                style={{ width: '40px', textAlign: 'center', fontSize: '18px'}}
                              />
                            ))}
                            <CButton color="info" onClick={handleVerifyOtp} style={{ backgroundColor: '#6f42c1', borderColor: '#6f42c1', color: '#fff' }}>Verify</CButton>
                          </div>
                        </>
                      )}

                      

                      {/* Password fields */}
                      {otpVerified && (
                        <>
                        <div style={{ marginTop: '15px' }}></div>
                          <CInputGroup className="mb-3">
                            <CInputGroupText>
                              <CIcon icon={cilLockLocked} />
                            </CInputGroupText>
                            <CFormInput
                              type={showPassword ? 'text' : 'password'}
                              placeholder="Password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              
                            />
                            <CButton
                              color="secondary"
                              onClick={() => setShowPassword(!showPassword)}
                              type="button"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                boxShadow: 'none',
                                color: '#4b2c88',
                                fontWeight: '600'
                              }}

                            >
                              {showPassword ? 'Hide' : 'Show'}
                            </CButton>
                          </CInputGroup>

                          <CInputGroup className="mb-4">
                            <CInputGroupText>
                              <CIcon icon={cilLockLocked} />
                            </CInputGroupText>
                            <CFormInput
                              type={showConfirm ? 'text' : 'password'}
                              placeholder="Repeat Password"
                              value={confirm}
                              onChange={(e) => setConfirm(e.target.value)}
                            />
                            <CButton
                              color="secondary"
                              onClick={() => setShowConfirm(!showConfirm)}
                              type="button"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                boxShadow: 'none',
                                color: '#4b2c88',
                                fontWeight: '600'
                              }}

                            >
                              {showConfirm ? 'Hide' : 'Show'}
                            </CButton>
                          </CInputGroup>

                                              {/* ✅ Terms & Conditions checkbox */}
                          <div className="mb-3 d-flex align-items-center">
                            <input
                              type="checkbox"
                              id="terms"
                              checked={agreeTerms}
                              onChange={(e) => setAgreeTerms(e.target.checked)}
                              style={{ marginRight: '10px', cursor: 'pointer' }}
                            />

                            <label htmlFor="terms" style={{ cursor: 'pointer' }}>
                              I agree to the{' '}
                              <span
                                onClick={() => setShowTermsModal(true)}
                                style={{
                                  color: '#4b2c88',
                                  fontWeight: '600',
                                  textDecoration: 'underline',
                                  cursor: 'pointer'
                                }}
                              >
                                Terms & Conditions
                              </span>

                            </label>
                          </div>

                          <div className="d-grid">
                            <CButton type="submit" color="success">
                              Create Account
                            </CButton>
                          </div>
                        </>
                      )}
                    </CForm>

                    <div className="text-center my-3">OR</div>
                  </>
                )}

                {/* Google login button */}
                {role && !googleUser && (
                  <div className="d-grid mb-3">
                    <CButton
                      onClick={() => googleLogin()}
                      style={{
                        backgroundColor: "rgb(227, 236, 231)",
                        border: "1px solid #d1d5db",
                        color: "#111827",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                      }}
                    >
                      <FcGoogle size={24} />
                      Sign up with Google
                    </CButton>
                  </div>
                )}

                {/* Google new user registration */}
                {googleUser && (
                  <CForm onSubmit={handleRegister}>
                    <h5 className="mb-3 text-center">Complete Registration</h5>


                    <CRow className="mb-4 text-center">
                      <CCol md={6} style={{ order: 2 }}>
                        <div
                          onClick={() => setRole("radiologist")}
                          style={{
                            ...apptheme.roleCard.base,
                            ...(role === "radiologist"
                              ? apptheme.roleCard.radiologist.active
                              : apptheme.roleCard.radiologist.inactive),
                          }}
                          onMouseEnter={(e) => {
                            if (role !== "radiologist") e.currentTarget.style.background = apptheme.roleCard.radiologist.hover
                          }}
                          onMouseLeave={(e) => {
                            if (role !== "radiologist")
                              e.currentTarget.style.background = apptheme.roleCard.radiologist.inactive.background
                          }}
                        >
                          <CIcon icon={cilUser} size="xl" />
                          <h5 className="mt-2">Radiologist</h5>
                        </div>
                      </CCol>

                      <CCol md={6} style={{ order: 1 }}>
                        <div
                          onClick={() => setRole("organization")}
                          style={{
                            ...apptheme.roleCard.base,
                            ...(role === "organization"
                              ? apptheme.roleCard.organization.active
                              : apptheme.roleCard.organization.inactive),
                          }}
                          onMouseEnter={(e) => {
                            if (role !== "organization") e.currentTarget.style.background = apptheme.roleCard.organization.hover
                          }}
                          onMouseLeave={(e) => {
                            if (role !== "organization")
                              e.currentTarget.style.background = apptheme.roleCard.organization.inactive.background
                          }}
                        >
                          <CIcon icon={cilBriefcase} size="xl" />
                          <h5 className="mt-2">Organization</h5>
                        </div>
                      </CCol>
                    </CRow>


                    
{/* ================= ROLE BASED INPUTS ================= */}

{role === "radiologist" && (
  <>
    <CInputGroup className="mb-3">
      <CInputGroupText>
        <CIcon icon={cilUser} />
      </CInputGroupText>
      <CFormInput
        placeholder="First Name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
      />
    </CInputGroup>

    <CInputGroup className="mb-3">
      <CInputGroupText>
        <CIcon icon={cilUser} />
      </CInputGroupText>
      <CFormInput
        placeholder="Last Name"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
      />
    </CInputGroup>
  </>
)}

{role === "organization" && (
  <CInputGroup className="mb-3">
    <CInputGroupText>
      <CIcon icon={cilBriefcase} />
    </CInputGroupText>
    <CFormInput
      placeholder="Organization Name"
      value={firstName}
      onChange={(e) => setFirstName(e.target.value)}
    />
  </CInputGroup>
)}



                    <CInputGroup className="mb-3">
                      <CInputGroupText>
                        <CIcon icon={cilEnvelopeClosed} />
                      </CInputGroupText>

                      <CFormInput value={email} readOnly />

                      <CInputGroupText style={{ color: 'green', fontWeight: '600' }}>
                        ✔ Verified
                      </CInputGroupText>
                    </CInputGroup>


                    <CInputGroup className="mb-3">
                      <CInputGroupText>
                        <CIcon icon={cilLockLocked} />
                      </CInputGroupText>
                      <CFormInput
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <CButton
                        color="secondary"
                        onClick={() => setShowPassword(!showPassword)}
                        type="button"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          boxShadow: 'none',
                          color: '#4b2c88',
                          fontWeight: '600'
                        }}
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </CButton>
                    </CInputGroup>

                    <CInputGroup className="mb-4">
                      <CInputGroupText>
                        <CIcon icon={cilLockLocked} />
                      </CInputGroupText>
                      <CFormInput
                        type={showConfirm ? 'text' : 'password'}
                        placeholder="Confirm Password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                      />
                      <CButton
                        color="secondary"
                        onClick={() => setShowConfirm(!showConfirm)}
                        type="button"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          boxShadow: 'none',
                          color: '#4b2c88',
                          fontWeight: '600'
                        }}

                      >
                        {showConfirm ? 'Hide' : 'Show'}
                      </CButton>
                    </CInputGroup>


                    {/* ✅ Terms & Conditions checkbox */}
                    <div className="mb-3 d-flex align-items-center">
                      <input
                        type="checkbox"
                        id="terms"
                        checked={agreeTerms}
                        onChange={(e) => setAgreeTerms(e.target.checked)}
                        style={{ marginRight: '10px', cursor: 'pointer' }}
                      />

                      <label htmlFor="terms" style={{ cursor: 'pointer' }}>
                        I agree to the{' '}
                        <span
                          onClick={() => setShowTermsModal(true)}
                          style={{
                            color: '#4b2c88',
                            fontWeight: '600',
                            textDecoration: 'underline',
                            cursor: 'pointer'
                          }}
                        >
                          Terms & Conditions
                        </span>

                      </label>
                    </div>


                    <div className="d-grid mb-3">
                      <CButton type="submit" color="success">
                        Complete Registration
                      </CButton>
                    </div>
                  </CForm>
                )}

                {showTermsModal && (
                  <div
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      width: '100vw',
                      height: '100vh',
                      backgroundColor: 'rgba(0,0,0,0.5)',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      zIndex: 9999,
                    }}
                  >
                    <div
                      style={{
                        background: '#fff',
                        padding: '20px',
                        borderRadius: '10px',
                        maxWidth: '700px',
                        maxHeight: '80vh',
                        overflowY: 'auto',
                      }}
                    >
                      <TermsAndConditions />
                      <div className="text-end mt-3">
                        <CButton color="primary" onClick={() => setShowTermsModal(false)}>
                          Close
                        </CButton>
                      </div>
                    </div>
                  </div>
                )}


                {/* Message Section */}
                {error && (
                  <div
                    style={{
                      marginTop: '20px',
                      padding: '10px',
                      color:
                        error === 'Account created successfully!' ? '#0f5132' : '#842029',
                      textAlign: 'center',
                    }}
                  >
                    {error}
                  </div>
                )}

                {googleUser && (
                  <div
                    style={{
                      marginTop: '20px',
                      padding: '10px',
                      color: '#055160',
                      textAlign: 'center',
                    }}
                  >
                    Complete your Google registration below.
                  </div>
                )}

              </CCardBody>
            </CCard>
          </CCol>
        </CRow>
      </CContainer>
    </div>
  )
}

export default Register
