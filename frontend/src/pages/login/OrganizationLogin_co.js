import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { CButton, CFormInput, CAlert, CModal, CModalBody, CModalFooter, CModalHeader, CModalTitle } from '@coreui/react'
import api from "../../shared/api/axios"
import { FcGoogle } from 'react-icons/fc'
import { useGoogleLogin } from '@react-oauth/google'
import axios from "axios"

/* ── Organisation icon ── */
const OrganisationIcon = ({ size = 52, color = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="22" width="44" height="36" rx="2" stroke={color} strokeWidth="2.5" fill="none"/>
    <polygon points="6,22 32,6 58,22" stroke={color} strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
    <rect x="28" y="10" width="8" height="20" rx="2" stroke={color} strokeWidth="2" fill="none"/>
    <rect x="22" y="16" width="20" height="8" rx="2" stroke={color} strokeWidth="2" fill="none"/>
    <rect x="15" y="34" width="10" height="10" rx="1.5" stroke={color} strokeWidth="1.8" fill="none"/>
    <rect x="39" y="34" width="10" height="10" rx="1.5" stroke={color} strokeWidth="1.8" fill="none"/>
    <rect x="26" y="42" width="12" height="16" rx="1.5" stroke={color} strokeWidth="1.8" fill="none"/>
  </svg>
)

/* ── Hospital bg illustration (teal tones) ── */
const HospitalSVG = () => (
  <svg viewBox="0 0 600 700" xmlns="http://www.w3.org/2000/svg"
    style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', opacity:0.13, pointerEvents:'none' }}>
    <rect x="200" y="280" width="200" height="200" fill="none" stroke="#1d9e75" strokeWidth="1.5"/>
    <rect x="260" y="370" width="80" height="110" fill="none" stroke="#1d9e75" strokeWidth="1"/>
    <polygon points="180,280 300,200 420,280" fill="none" stroke="#1d9e75" strokeWidth="1.5"/>
    <rect x="286" y="230" width="28" height="56" rx="4" fill="none" stroke="#1d9e75" strokeWidth="1.8"/>
    <rect x="272" y="244" width="56" height="28" rx="4" fill="none" stroke="#1d9e75" strokeWidth="1.8"/>
    <rect x="220" y="310" width="30" height="30" rx="2" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <rect x="270" y="310" width="30" height="30" rx="2" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <rect x="350" y="310" width="30" height="30" rx="2" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <rect x="220" y="355" width="30" height="30" rx="2" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <rect x="350" y="355" width="30" height="30" rx="2" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <line x1="100" y1="480" x2="500" y2="480" stroke="#1d9e75" strokeWidth="0.8"/>
    <rect x="120" y="490" width="80" height="40" rx="6" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <circle cx="140" cy="534" r="8" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <circle cx="184" cy="534" r="8" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <rect x="40" y="60" width="20" height="60" rx="4" fill="none" stroke="#1d9e75" strokeWidth="1.5"/>
    <rect x="20" y="80" width="60" height="20" rx="4" fill="none" stroke="#1d9e75" strokeWidth="1.5"/>
    <rect x="490" y="40" width="16" height="50" rx="3" fill="none" stroke="#5dcaa5" strokeWidth="1.2"/>
    <rect x="474" y="56" width="48" height="16" rx="3" fill="none" stroke="#5dcaa5" strokeWidth="1.2"/>
    <circle cx="300" cy="570" r="14" fill="none" stroke="#1d9e75" strokeWidth="1.2"/>
    <circle cx="220" cy="630" r="12" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <circle cx="300" cy="630" r="12" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <circle cx="380" cy="630" r="12" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <line x1="300" y1="584" x2="300" y2="606" stroke="#1d9e75" strokeWidth="0.8"/>
    <line x1="220" y1="606" x2="380" y2="606" stroke="#1d9e75" strokeWidth="0.8"/>
    <line x1="220" y1="606" x2="220" y2="618" stroke="#1d9e75" strokeWidth="0.8"/>
    <line x1="300" y1="606" x2="300" y2="618" stroke="#1d9e75" strokeWidth="0.8"/>
    <line x1="380" y1="606" x2="380" y2="618" stroke="#1d9e75" strokeWidth="0.8"/>
    {[0,1,2,3,4].map(r => [0,1,2,3,4,5].map(c => (
      <circle key={`${r}-${c}`} cx={390+c*26} cy={150+r*26} r="1.2" fill="#1d9e75"/>
    )))}
    <polyline points="20,560 50,560 62,530 78,590 90,545 104,570 130,570 200,570" fill="none" stroke="#1d9e75" strokeWidth="1.5"/>
    <circle cx="520" cy="600" r="120" fill="none" stroke="#1d9e75" strokeWidth="0.8"/>
    <circle cx="520" cy="600" r="80"  fill="none" stroke="#1d9e75" strokeWidth="1"/>
    <circle cx="520" cy="600" r="45"  fill="none" stroke="#1d9e75" strokeWidth="1"/>
  </svg>
)

const T = {
  navy:'#0d1b2a', navyMid:'#0a3350', teal:'#1d9e75',
  tealLight:'#5dcaa5', tealPale:'#e1f5ee', white:'#ffffff',
  offWhite:'#f7faf9', border:'#dce8e4', textDark:'#0d1b2a',
  textMid:'#4a6070', textLight:'#8fa8b8',
}

const inputStyle = {
  width:'100%', padding:'11px 14px', border:`1.5px solid ${T.border}`,
  borderRadius:'10px', fontSize:'14px', background:T.offWhite,
  color:T.textDark, outline:'none', fontFamily:'inherit', boxSizing:'border-box',
}
const labelStyle = {
  display:'block', fontSize:'11px', fontWeight:'600',
  letterSpacing:'0.07em', textTransform:'uppercase', color:T.textMid, marginBottom:'6px',
}

const OrganizationLogin = () => {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [email,setEmail]                     = useState('')
  const [password,setPassword]               = useState('')
  const [showPassword,setShowPassword]       = useState(false)
  const [error,setError]                     = useState('')
  const [showForgotModal,setShowForgotModal] = useState(false)
  const [forgotEmail,setForgotEmail]         = useState('')
  const [forgotMessage,setForgotMessage]     = useState('')
  const [forgotError,setForgotError]         = useState('')

  const saveProfilePrefill = ({ emailVal,roleVal,usernameVal,firstNameVal,lastNameVal }) => {
    if (emailVal) localStorage.setItem("email",emailVal)
    if (roleVal)  localStorage.setItem("role",roleVal)
    const uname = (usernameVal||"").trim()
    if (uname) localStorage.setItem("username",uname)
    const parts = uname ? uname.split(" ") : []
    const first = firstNameVal||parts[0]||""; const last = lastNameVal||parts.slice(1).join(" ")||""
    localStorage.setItem("firstName",first); localStorage.setItem("lastName",last)
    localStorage.setItem("firstname",first); localStorage.setItem("lastname",last)
  }

  const redirectByRole = (role,from) => {
    const r = (role||"").toLowerCase()
    if (r==="admin")             navigate(from||"/admin/dashboard",        {replace:true})
    else if (r==="organization") navigate(from||"/organization/dashboard", {replace:true})
    else                         navigate(from||"/radiologist/repository",  {replace:true})
  }

  const handleLogin = async (e) => {
    e.preventDefault(); setError('')
    try {
      const res = await api.post("/login",{email,password})
      if (res.data.message !== "Login successful") { setError("Invalid credentials"); return }
      const token = res.data.access_token||res.data.token
      if (!token) { setError("Login failed: token missing"); return }
      localStorage.setItem("auth",JSON.stringify({
        isLoggedIn:true, token, role:res.data.role,
        userId:res.data.user_id||res.data.id,
        firstName:res.data.first_name||res.data.firstName,
        lastName:res.data.last_name||res.data.lastName,
        email:res.data.email||email,
      }))
      localStorage.setItem("profileCompleted","false")
      redirectByRole(res.data.role, location.state?.from?.pathname)
    } catch(err) { console.error(err); setError(err.response?.data?.detail||"Email or password is incorrect") }
  }

  const googleLogin = useGoogleLogin({
    onSuccess: async(tokenResponse) => {
      try {
        const googleRes = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo",{
          headers:{Authorization:`Bearer ${tokenResponse.access_token}`}})
        const {email:gEmail,name} = googleRes.data
        const backendRes = await api.post("/google-login",{email:gEmail,name})
        if (backendRes.data.needs_registration) { navigate("/signup",{state:{prefillEmail:gEmail}}); return }
        const token = backendRes.data.access_token||backendRes.data.token
        if (!token) { setError("Google login failed: token missing"); return }
        localStorage.setItem("token",token)
        localStorage.setItem("auth",JSON.stringify({
          isLoggedIn:true, token, role:backendRes.data.role,
          userId:backendRes.data.user_id||backendRes.data.id,
          firstName:backendRes.data.first_name||name?.split(" ")[0],
          lastName:backendRes.data.last_name||name?.split(" ").slice(1).join(" "),
          email:gEmail,
        }))
        saveProfilePrefill({emailVal:gEmail, roleVal:backendRes.data.role,
          usernameVal:backendRes.data.username||name,
          firstNameVal:backendRes.data.first_name, lastNameVal:backendRes.data.last_name})
        localStorage.setItem("profileCompleted","false")
        redirectByRole(backendRes.data.role,null)
      } catch(err) { console.error(err); setError("Google login failed") }
    },
    onError: () => setError("Google login failed"),
  })

  const handleForgotPassword = async () => {
    setForgotMessage(''); setForgotError('')
    if (!forgotEmail) { setForgotError('Enter email'); return }
    try {
      const res = await api.post('/forgot-password',{email:forgotEmail})
      setForgotMessage(res.data.message)
    } catch(err) { setForgotError(err.response?.data?.detail||'Server error') }
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'#fffbe7',
      fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif",
      position:'relative', overflow:'hidden', padding:'24px 16px',
    }}>
      <HospitalSVG />

      {[420,300,190].map((s,i) => (
        <div key={i} style={{ position:'absolute', bottom:-120, right:-120, width:s, height:s, borderRadius:'50%', border:`1px solid rgba(29,158,117,${0.08+i*0.06})`, pointerEvents:'none' }} />
      ))}
      {[360,260,160].map((s,i) => (
        <div key={i} style={{ position:'absolute', top:-80, left:-80, width:s, height:s, borderRadius:'50%', border:`1px solid rgba(29,158,117,${0.05+i*0.04})`, pointerEvents:'none' }} />
      ))}

      <img src="/logo.png" alt="ONIX AI" style={{ position:'absolute', top:16, left:18, height:48, width:170, objectFit:'contain' }} />

      <div style={{
        display:'flex', width:'100%', maxWidth:'860px',
        borderRadius:'20px', overflow:'hidden',
        boxShadow:'0 20px 60px rgba(13,27,42,0.14), 0 4px 16px rgba(0,0,0,0.08)', position:'relative', zIndex:1,
      }}>
        {/* LEFT — same teal/navy as radiologist */}
        <div style={{
          width:'40%',
          background:'linear-gradient(150deg, #38b6c7 10%, #16557c 40%, #081a2e 100%)',
          padding:'44px 32px', display:'flex', flexDirection:'column', justifyContent:'space-between',
          borderRight:'1px solid rgba(29,158,117,0.2)', position:'relative', overflow:'hidden',
        }}>
          <div>
            <div style={{
              width:80, height:80, borderRadius:'50%',
              background:'rgba(255,255,255,0.1)', border:'1.5px solid rgba(255,255,255,0.18)',
              display:'flex', alignItems:'center', justifyContent:'center', marginBottom:22,
            }}>
              <OrganisationIcon size={48} color="#fff" />
            </div>
            <div style={{ fontSize:'26px', fontWeight:700, color:T.white, marginBottom:6 }}>Organization Portal</div>
            <div style={{ fontSize:'11px', color:T.tealLight, textTransform:'uppercase', letterSpacing:'0.12em', fontWeight:500, marginBottom:26 }}>Hospital & Healthcare Org</div>
            <div style={{ width:40, height:2, background:T.teal, borderRadius:2, marginBottom:26 }} />
            <p style={{ fontSize:'14px', color:'rgba(159,225,203,0.85)', lineHeight:1.7, fontWeight:300, margin:0 }}>
              Centralized management for your radiology operations, teams, and Organizational reporting.
            </p>
          </div>
          <div>
            {[
              {icon:'🏥', label:'Multi-branch management'},
              {icon:'👥', label:'Team & role administration'},
              {icon:'📊', label:'Analytics & reporting'},
            ].map(f => (
              <div key={f.label} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ width:28, height:28, background:'rgba(29,158,117,0.2)', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px' }}>{f.icon}</div>
                <span style={{ fontSize:'12px', color:'rgba(159,225,203,0.75)', fontWeight:400 }}>{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ flex:1, background:T.offWhite, display:'flex', alignItems:'center', justifyContent:'center', padding:'44px 36px' }}>
          <div style={{ background:T.white, borderRadius:'16px', border:`1px solid ${T.border}`, padding:'36px 32px', width:'100%', maxWidth:'360px', boxShadow:'0 4px 24px rgba(13,27,42,0.07)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24, paddingBottom:20, borderBottom:`1px solid ${T.border}` }}>
              <div style={{ width:42, height:42, borderRadius:'10px', background:T.tealPale, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <OrganisationIcon size={24} color={T.teal} />
              </div>
              <div>
                <div style={{ fontSize:'16px', fontWeight:700, color:T.textDark }}>Organization Login</div>
                <div style={{ fontSize:'12px', color:T.textLight }}>Hospital & Healthcare Institutions</div>
              </div>
            </div>

            {error && <div style={{ background:'#fff0f0', border:'1px solid #f7c1c1', borderRadius:8, padding:'10px 14px', color:'#a32d2d', fontSize:'13px', marginBottom:16 }}>{error}</div>}

            <form onSubmit={handleLogin}>
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Organization Email</label>
                <input style={inputStyle} type="email" placeholder="admin@hospital.org"
                  value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required />
              </div>
              <div style={{ marginBottom:8 }}>
                <label style={labelStyle}>Password</label>
                <div style={{ position:'relative' }}>
                  <input style={{ ...inputStyle, paddingRight:'60px' }}
                    type={showPassword?'text':'password'} placeholder="••••••••"
                    value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required />
                  <button type="button" onClick={()=>setShowPassword(!showPassword)}
                    style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:'12px', color:T.teal, fontWeight:600, fontFamily:'inherit' }}>
                    {showPassword?'Hide':'Show'}
                  </button>
                </div>
              </div>
              <div style={{ textAlign:'right', marginBottom:22 }}>
                <button type="button" onClick={()=>setShowForgotModal(true)}
                  style={{ background:'none', border:'none', cursor:'pointer', fontSize:'12px', color:T.teal, fontWeight:500, fontFamily:'inherit' }}>
                  Forgot password?
                </button>
              </div>
              <button type="submit" style={{ width:'100%', padding:'12px', background:'linear-gradient(135deg,#1d9e75 0%,#178a63 100%)', color:'#fff', border:'none', borderRadius:'10px', fontSize:'14px', fontWeight:600, cursor:'pointer', letterSpacing:'0.02em', fontFamily:'inherit', marginBottom:16 }}>
                Sign In
              </button>
            </form>

            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
              <div style={{ flex:1, height:'1px', background:T.border }} />
              <span style={{ fontSize:'11px', color:T.textLight }}>or</span>
              <div style={{ flex:1, height:'1px', background:T.border }} />
            </div>

            <button onClick={()=>googleLogin()} style={{ width:'100%', padding:'11px', background:T.white, border:`1.5px solid ${T.border}`, borderRadius:'10px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontSize:'13px', fontWeight:500, color:T.textMid, fontFamily:'inherit' }}>
              <FcGoogle size={18} /> Sign in with Google
            </button>

            <div style={{ marginTop:18, padding:'10px 14px', background:T.tealPale, borderRadius:8, display:'flex', alignItems:'center', gap:8 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.teal} strokeWidth="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span style={{ fontSize:'11px', color:'#0f6e56' }}>256-bit encrypted · HIPAA compliant · SSO ready</span>
            </div>
          </div>
        </div>
      </div>

      <CModal visible={showForgotModal} onClose={()=>setShowForgotModal(false)}>
        <CModalHeader><CModalTitle>Reset Password</CModalTitle></CModalHeader>
        <CModalBody>
          {forgotError   && <CAlert color="danger">{forgotError}</CAlert>}
          {forgotMessage && <CAlert color="success">{forgotMessage}</CAlert>}
          {!forgotMessage && (<><p style={{fontSize:'14px'}}>Enter your registered email to receive a reset link.</p>
            <CFormInput type="email" placeholder="Email address" value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)} /></>)}
        </CModalBody>
        <CModalFooter>
          {!forgotMessage && <CButton color="primary" onClick={handleForgotPassword}>Send Reset Link</CButton>}
          <CButton color="secondary" onClick={()=>setShowForgotModal(false)}>Close</CButton>
        </CModalFooter>
      </CModal>
    </div>
  )
}

export default OrganizationLogin