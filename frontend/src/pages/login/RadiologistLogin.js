import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import GoogleTranslateSwitcher from '../../shared/components/GoogleTranslateSwitcher'
import { CButton, CFormInput, CAlert, CModal, CModalBody, CModalFooter, CModalHeader, CModalTitle } from '@coreui/react'
import api from "../../shared/api/axios"
import { FcGoogle } from 'react-icons/fc'
import { useGoogleLogin } from '@react-oauth/google'
import axios from "axios"

/* ── Radiologist icon ── */
const RadiologistIcon = ({ size = 52, color = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="18" r="10" stroke={color} strokeWidth="2.5" fill="none"/>
    <path d="M14 52c0-10 8-18 18-18s18 8 18 18" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <circle cx="44" cy="40" r="6" stroke={color} strokeWidth="2" fill="none"/>
    <path d="M44 37v3l2 2" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M32 34v4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <path d="M32 38 Q36 42 40 40" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
  </svg>
)

/* ── Radiology bg illustration ── */
const RadiologySVG = () => (
  <svg viewBox="0 0 600 700" xmlns="http://www.w3.org/2000/svg"
    style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', opacity:0.13, pointerEvents:'none' }}>
    <circle cx="520" cy="580" r="200" fill="none" stroke="#1d9e75" strokeWidth="1"/>
    <circle cx="520" cy="580" r="155" fill="none" stroke="#1d9e75" strokeWidth="1"/>
    <circle cx="520" cy="580" r="110" fill="none" stroke="#1d9e75" strokeWidth="1.5"/>
    <circle cx="520" cy="580" r="65"  fill="none" stroke="#1d9e75" strokeWidth="2"/>
    <circle cx="520" cy="580" r="28"  fill="none" stroke="#1d9e75" strokeWidth="2.5"/>
    <line x1="520" y1="360" x2="520" y2="800" stroke="#1d9e75" strokeWidth="0.6"/>
    <line x1="300" y1="580" x2="740" y2="580" stroke="#1d9e75" strokeWidth="0.6"/>
    <polyline points="20,80 80,80 95,40 115,120 135,55 155,95 175,80 320,80" fill="none" stroke="#1d9e75" strokeWidth="1.8"/>
    <ellipse cx="100" cy="200" rx="75" ry="88" fill="none" stroke="#5dcaa5" strokeWidth="1.2"/>
    <ellipse cx="100" cy="230" rx="34" ry="20" fill="none" stroke="#5dcaa5" strokeWidth="0.8"/>
    <path d="M58 175 Q100 148 142 175" fill="none" stroke="#5dcaa5" strokeWidth="0.8"/>
    <path d="M62 198 Q100 182 138 198" fill="none" stroke="#5dcaa5" strokeWidth="0.6"/>
    <rect x="22" y="340" width="30" height="20" rx="4" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <rect x="22" y="368" width="30" height="20" rx="4" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <rect x="22" y="396" width="30" height="20" rx="4" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <rect x="22" y="424" width="30" height="20" rx="4" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <line x1="37" y1="360" x2="37" y2="368" stroke="#5dcaa5" strokeWidth="0.8"/>
    <line x1="37" y1="388" x2="37" y2="396" stroke="#5dcaa5" strokeWidth="0.8"/>
    <line x1="37" y1="416" x2="37" y2="424" stroke="#5dcaa5" strokeWidth="0.8"/>
    <path d="M230 350 Q210 365 207 400 Q204 435 222 452 Q240 462 252 445 Q258 428 254 405 Q249 378 244 355 Z" fill="none" stroke="#5dcaa5" strokeWidth="1.2"/>
    <path d="M280 350 Q300 365 303 400 Q306 435 288 452 Q270 462 258 445 Q252 428 256 405 Q261 378 266 355 Z" fill="none" stroke="#5dcaa5" strokeWidth="1.2"/>
    <path d="M500 20 Q522 42 500 64 Q478 86 500 108 Q522 130 500 152 Q478 174 500 196" fill="none" stroke="#1d9e75" strokeWidth="1.2"/>
    <path d="M524 20 Q502 42 524 64 Q546 86 524 108 Q502 130 524 152 Q546 174 524 196" fill="none" stroke="#1d9e75" strokeWidth="1.2"/>
    <line x1="500" y1="42" x2="524" y2="42" stroke="#1d9e75" strokeWidth="0.8"/>
    <line x1="500" y1="86" x2="524" y2="86" stroke="#1d9e75" strokeWidth="0.8"/>
    <line x1="500" y1="130" x2="524" y2="130" stroke="#1d9e75" strokeWidth="0.8"/>
    {[0,1,2,3,4].map(r => [0,1,2,3,4,5].map(c => (
      <circle key={`${r}-${c}`} cx={340+c*28} cy={150+r*28} r="1.2" fill="#1d9e75"/>
    )))}
  </svg>
)

const T = {
  teal:'#1d9e75', tealLight:'#5dcaa5', tealPale:'#e1f5ee',
  white:'#ffffff', offWhite:'#f7faf9', border:'#dce8e4',
  textDark:'#0d1b2a', textMid:'#4a6070', textLight:'#8fa8b8',
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

const RadiologistLogin = () => {
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
    if (r==="admin")             navigate(from||"/admin/dashboard",         {replace:true})
    else if (r==="organization") navigate(from||"/organization/profile",  {replace:true})
    else                         navigate(from||"/radiologist/dashboard",   {replace:true})
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
      <RadiologySVG />
      {[420,300,200].map((s,i) => (
        <div key={i} style={{ position:'absolute', bottom:-120, left:-120, width:s, height:s, borderRadius:'50%', border:`1px solid rgba(29,158,117,${0.08+i*0.06})`, pointerEvents:'none' }} />
      ))}

      <img src="/logo.png" alt="ONIX AI" style={{ position:'absolute', top:16, left:18, height:48, width:170, objectFit:'contain' }} />
      <div style={{ position:'absolute', top:16, right:18, zIndex:10 }}>
        <GoogleTranslateSwitcher />
      </div>

      <div style={{
        display:'flex', width:'100%', maxWidth:'860px',
        borderRadius:'20px', overflow:'hidden',
        boxShadow:'0 20px 60px rgba(13,27,42,0.14), 0 4px 16px rgba(0,0,0,0.08)', position:'relative', zIndex:1,
      }}>
        {/* LEFT — teal/dark gradient matching selected card */}
        <div style={{
          width:'40%',
          background:'linear-gradient(150deg, #38b6c7 10%, #16557c 40%, #081a2e 100%)',
          padding:'44px 32px', display:'flex', flexDirection:'column', justifyContent:'space-between',
          borderRight:'1px solid rgba(29,158,117,0.2)',
        }}>
          <div>
            <div style={{
              width:80, height:80, borderRadius:'50%',
              background:'rgba(255,255,255,0.1)', border:'1.5px solid rgba(255,255,255,0.18)',
              display:'flex', alignItems:'center', justifyContent:'center', marginBottom:22,
            }}>
              <RadiologistIcon size={48} color="#fff" />
            </div>
            <div style={{ fontSize:'26px', fontWeight:700, color:'#fff', marginBottom:6 }}>Clinician Portal</div>
            <div style={{ fontSize:'11px', color:T.tealLight, textTransform:'uppercase', letterSpacing:'0.12em', fontWeight:500, marginBottom:26 }}>Radiologist Access</div>
            <div style={{ width:40, height:2, background:T.teal, borderRadius:2, marginBottom:26 }} />
            <p style={{ fontSize:'14px', color:'rgba(159,225,203,0.85)', lineHeight:1.7, fontWeight:300, margin:0 }}>
AI-powered clinician, working on the right platform for precision diagnostics and seamless report management.            </p>
          </div>
          <div>
            {['HIPAA Compliant','Encrypted','SOC 2'].map(b => (
              <div key={b} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(29,158,117,0.15)', border:'1px solid rgba(93,202,165,0.3)', borderRadius:20, padding:'4px 11px', marginRight:6, marginBottom:6 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:T.tealLight }} />
                <span style={{ fontSize:'10px', color:T.tealLight, fontWeight:500 }}>{b}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — white form */}
        <div style={{ flex:1, background:T.offWhite, display:'flex', alignItems:'center', justifyContent:'center', padding:'44px 36px' }}>
          <div style={{ background:T.white, borderRadius:'16px', border:`1px solid ${T.border}`, padding:'36px 32px', width:'100%', maxWidth:'360px', boxShadow:'0 4px 24px rgba(13,27,42,0.07)' }}>
            <div style={{ fontSize:'10px', color:T.teal, textTransform:'uppercase', letterSpacing:'0.12em', fontWeight:600, marginBottom:4 }}>Welcome back</div>
            <div style={{ fontSize:'22px', fontWeight:700, color:T.textDark, marginBottom:4 }}>Sign in</div>
            <div style={{ fontSize:'13px', color:T.textLight, marginBottom:26 }}>Radiologist / Clinical account</div>

            {error && <div style={{ background:'#fff0f0', border:'1px solid #f7c1c1', borderRadius:8, padding:'10px 14px', color:'#a32d2d', fontSize:'13px', marginBottom:16 }}>{error}</div>}

            <form onSubmit={handleLogin}>
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} type="email" placeholder="you@clinic.com"
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
              <span style={{ fontSize:'11px', color:T.textLight }}></span>
              <div style={{ flex:1, height:'1px', background:T.border }} />
            </div>

            

            <div style={{ marginTop:18, padding:'10px 14px', background:T.tealPale, borderRadius:8, display:'flex', alignItems:'center', gap:8 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.teal} strokeWidth="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span style={{ fontSize:'11px', color:'#0f6e56' }}>256-bit encrypted · HIPAA compliant</span>
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

export default RadiologistLogin
