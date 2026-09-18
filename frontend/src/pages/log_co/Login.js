import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import OnixBrand from "../../shared/OnixBrand";

import {
  CButton,
  CCard,
  CCardBody,
  CCardGroup,
  CCol,
  CContainer,
  CForm,
  CFormInput,
  CInputGroup,
  CInputGroupText,
  CRow,
  CAlert,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilLockLocked, cilUser } from '@coreui/icons'

import api from "../../shared/api/axios"
import { apptheme } from "../colors/apptheme"

import { FcGoogle } from 'react-icons/fc'
import { useGoogleLogin } from '@react-oauth/google'
import axios from "axios"

const Login = () => {
  const navigate = useNavigate()
  const location = useLocation()


  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotMessage, setForgotMessage] = useState('')
  const [forgotError, setForgotError] = useState('')

  // ========================
  // ✅ Redirect if already logged in

  // ========================




  // =========================================================
  // ✅ ADDED: helper to save profile prefill data
  // =========================================================
  const saveProfilePrefill = ({
    emailVal,
    roleVal,
    usernameVal,
    firstNameVal,
    lastNameVal,
  }) => {
    if (emailVal) localStorage.setItem("email", emailVal)
    if (roleVal) localStorage.setItem("role", roleVal)

    const uname = (usernameVal || "").trim()
    if (uname) localStorage.setItem("username", uname)

    const parts = uname ? uname.split(" ") : []
    const first = firstNameVal || parts[0] || ""
    const last = lastNameVal || parts.slice(1).join(" ") || ""

    // store both styles (backward compatible)
    localStorage.setItem("firstName", first)
    localStorage.setItem("lastName", last)
    localStorage.setItem("firstname", first)
    localStorage.setItem("lastname", last)
  }

  // ========================
  // EMAIL / PASSWORD LOGIN
  // ========================
  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')

    try {
      const res = await api.post("/login", { email, password })

      if (res.data.message !== "Login successful") {
        setError("Invalid credentials")
        return
      }

      const token = res.data.access_token || res.data.token
      if (!token) {
        setError("Login failed: token missing")
        return
      }
      

     //localStorage.setItem("token", token)

/* ===== CREATE AUTH OBJECT (VERY IMPORTANT) ===== */
localStorage.setItem(
  "auth",
  JSON.stringify({
    isLoggedIn: true,
    token: token,
    role: res.data.role,
    userId: res.data.user_id || res.data.id,
    firstName: res.data.first_name || res.data.firstName,
    lastName: res.data.last_name || res.data.lastName,
    email: res.data.email || email
  })
);


      localStorage.setItem("profileCompleted", "false")

      const role = (res.data.role || "").toLowerCase()
      const from = location.state?.from?.pathname
      
      if (role === "admin")
        navigate(from || "/admin/dashboard", { replace: true })
      else if (role === "organization")
        navigate(from || "/organization/dashboard", { replace: true })
      else
        navigate(from || "/radiologist/dashboard", { replace: true })
      


    } catch (err) {
      console.error(err)
      setError(err.response?.data?.detail || "Email or password is incorrect")
    }
  }

  // ========================
  // GOOGLE LOGIN
  // ========================
  const googleLogin = useGoogleLogin({
  onSuccess: async (tokenResponse) => {
    try {
      const googleRes = await axios.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: {
            Authorization: `Bearer ${tokenResponse.access_token}`,
          },
        }
      );

      const { email, name } = googleRes.data;

      const backendRes = await api.post("/google-login", { email, name });

      // NEW USER → GO TO SIGNUP
      if (backendRes.data.needs_registration) {
        navigate("/signup", { state: { prefillEmail: email } });
        return;
      }

      const token = backendRes.data.access_token || backendRes.data.token;
      if (!token) {
        setError("Google login failed: token missing");
        return;
      }

      localStorage.setItem("token", token);

      localStorage.setItem(
        "auth",
        JSON.stringify({
          isLoggedIn: true,
          token: token,
          role: backendRes.data.role,
          userId: backendRes.data.user_id || backendRes.data.id,
          firstName: backendRes.data.first_name || name?.split(" ")[0],
          lastName: backendRes.data.last_name || name?.split(" ").slice(1).join(" "),
          email: email,
        })
      );

      saveProfilePrefill({
        emailVal: email,
        roleVal: backendRes.data.role,
        usernameVal: backendRes.data.username || name,
        firstNameVal: backendRes.data.first_name,
        lastNameVal: backendRes.data.last_name,
      });

      localStorage.setItem("profileCompleted", "false");

      // ✅ ROLE BASED REDIRECT (3 ROLES)
      const role = (backendRes.data.role || "").toLowerCase();

      if (role === "admin")
        navigate("/admin/dashboard", { replace: true });
      else if (role === "organization")
        navigate("/organization/dashboard", { replace: true });
      else
        navigate("/radiologist/repository", { replace: true });

    } catch (err) {
      console.error(err);
      setError("Google login failed");
    }
  },
  onError: () => setError("Google login failed"),
});


  //       // =================================================
  //       // ✅ ADDED: save first name / last name / email
  //       // =================================================
  //       saveProfilePrefill({
  //         emailVal: email,
  //         roleVal: backendRes.data.role,
  //         usernameVal: backendRes.data.username || name,
  //         firstNameVal: backendRes.data.first_name || backendRes.data.firstName,
  //         lastNameVal: backendRes.data.last_name || backendRes.data.lastName,
  //       })

  //       localStorage.setItem("profileCompleted", "false")

  //       const role = (backendRes.data.role || "").toLowerCase()
  //       navigate(
  //         role === "organization" ? "/organization/dashboard" : "/radiologist/dashboard",
  //         { replace: true }
  //       )

  //     } catch (err) {
  //       console.error(err)
  //       setError("Google login failed")
  //     }
  //   },
  //   onError: () => setError("Google login failed"),
  // })
  

  // FORGOT PASSWORD
  const handleForgotPassword = async () => {
    setForgotMessage('')
    setForgotError('')
    if (!forgotEmail) {
      setForgotError('Enter email')
      return
    }
    try {
      const res = await api.post('/forgot-password', { email: forgotEmail })
      setForgotMessage(res.data.message)
    } catch (err) {
      setForgotError(err.response?.data?.detail || 'Server error')
    }
  }

  return (
    
    <div
  className="min-vh-100 d-flex flex-row align-items-center"
  style={{
    background: apptheme.gradients.authBg,
    position: 'relative'
  }}
>



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
          <CCol md={8}>
            <CCardGroup>

              {/* LOGIN CARD */}
              <CCard
                className="p-4"
                style={{
                  ...apptheme.card.authLeft,
                  width: "56%",
                  minHeight: "300px",
                }}
              >


                <CCardBody>
                                    {/* Logo above signup */}
                 
                  <CForm style={{
                    marginTop: '20px' 
                    }}onSubmit={handleLogin}>
                    <h1>Login</h1>
                    <p className="text-body-secondary">Sign in to your account</p>

                    {error && <CAlert color="danger">{error}</CAlert>}

                    {/* ✅ ROLE SELECTOR - RADIO 
                    <div className="d-flex gap-4 mb-3">
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="radio"
                          name="role"
                          id="radiologist"
                          value="radiologist"
                          checked={selectedRole === 'radiologist'}
                          onChange={(e) => setSelectedRole(e.target.value)}
                        />
                        <label className="form-check-label" htmlFor="radiologist">
                         Radiologist
                        </label>
                      </div>

                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="radio"
                          name="role"
                          id="organization"
                          value="organization"
                          checked={selectedRole === 'organization'}
                          onChange={(e) => setSelectedRole(e.target.value)}
                        />
                        <label className="form-check-label" htmlFor="organization">
                          organization
                        </label>
                      </div>
                    </div> */}

                    {/* EMAIL */}
                    <CInputGroup className="mb-3">
                      <CInputGroupText>
                        <CIcon icon={cilUser} />
                      </CInputGroupText>
                      <CFormInput
                        placeholder="Email"
                        type="email"
                        autoComplete="username"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </CInputGroup>

                    {/* PASSWORD + SHOW/HIDE */}
                    <CInputGroup className="mb-4">
                      <CInputGroupText>
                        <CIcon icon={cilLockLocked} />
                      </CInputGroupText>

                      <CFormInput
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />

                      <CButton
                        type="button"
                        color="secondary"
                        variant="outline"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          background: apptheme.colors.primary2,
                          border: "none",
                          boxShadow: "none",
                          color: apptheme.colors.white,
                          fontWeight: "600",
                        }}
                        
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </CButton>
                    </CInputGroup>

                    <CRow>
                      <CCol xs={6}>
                        <CButton type="submit" color="primary" className="px-4">
                          Login
                        </CButton>
                      </CCol>
                      <CCol xs={6} className="text-end">
                        <CButton color="link" className="px-0" onClick={() => setShowForgotModal(true)}>
                          Forgot Password?
                        </CButton>
                      </CCol>
                    </CRow>

                    <div className="text-center my-3">OR</div>

                    <div className="d-grid">
                      <CButton
                        color="light"
                        onClick={() => googleLogin()}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          fontWeight: '600',
                          background: "rgb(227, 236, 231)",  
                        }}
                      >
                        <FcGoogle size={22} />
                        Sign in with Google
                      </CButton>
                    </div>

                  </CForm>
                </CCardBody>
              </CCard>

              {/* SIGNUP CARD */}
              <CCard
                className="py-5"
                style={{ width: "44%", ...apptheme.card.authRight }}
              >

                <CCardBody className="text-center">



                  <div>
                    <h2>Sign up</h2>
                    <p>Create a new account and get started with your journey.</p>
                   <CButton color="light" className="mt-3" onClick={() => {
  if (window.location.pathname.startsWith("/admin"))
  navigate("/admin/signup");
else if (window.location.pathname.startsWith("/organization"))
  navigate("/organization/signup");
else
  navigate("/radiologist/signup");

}}
>

                      Register Now!
                    </CButton>
                  </div>
                </CCardBody>
              </CCard>

            </CCardGroup>
          </CCol>
        </CRow>
      </CContainer>

      {/* FORGOT PASSWORD MODAL */}
      <CModal visible={showForgotModal} onClose={() => setShowForgotModal(false)}>
        <CModalHeader>
          <CModalTitle>Forgot Password</CModalTitle>
        </CModalHeader>
        <CModalBody>
          {forgotError && <CAlert color="danger">{forgotError}</CAlert>}
          {forgotMessage && <CAlert color="success">{forgotMessage}</CAlert>}
          {!forgotMessage && (
            <>
              <p>Enter your registered email to get password reset link.</p>
              <CFormInput
                type="email"
                placeholder="Email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
              />
            </>
          )}
        </CModalBody>
        <CModalFooter>
          {!forgotMessage && (
            <CButton color="primary" onClick={handleForgotPassword}>
              Send Reset Link
            </CButton>
          )}
          <CButton color="secondary" onClick={() => setShowForgotModal(false)}>
            Close
          </CButton>
        </CModalFooter>
      </CModal>
    </div>
  )
}

export default Login
