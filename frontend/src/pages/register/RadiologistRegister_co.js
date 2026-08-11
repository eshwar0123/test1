import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { CButton } from '@coreui/react'
import api from "../../shared/api/axios"
import { FcGoogle } from 'react-icons/fc'
import { useGoogleLogin } from '@react-oauth/google'
import TermsAndConditions from './TermsAndConditions'

const OTP_LENGTH = 6
const ROLE = 'radiologist'

const T = {
  teal:'#1d9e75', tealDark:'#178a63', tealLight:'#5dcaa5', tealPale:'#e1f5ee',
  white:'#ffffff', offWhite:'#f7faf9', border:'#dce8e4',
  textDark:'#0d1b2a', textMid:'#4a6070', textLight:'#8fa8b8',
}

const inp = (ex={}) => ({
  width:'100%', padding:'11px 13px', border:`1.5px solid ${T.border}`,
  borderRadius:'10px', fontSize:'13px', background:T.offWhite,
  color:T.textDark, outline:'none', fontFamily:'inherit', boxSizing:'border-box', ...ex,
})
const lbl = { display:'block', fontSize:'10px', fontWeight:'600', letterSpacing:'0.07em', textTransform:'uppercase', color:T.textMid, marginBottom:'5px' }

const RadiologistIcon = ({ size=52, color='#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="18" r="10" stroke={color} strokeWidth="2.5" fill="none"/>
    <path d="M14 52c0-10 8-18 18-18s18 8 18 18" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <circle cx="44" cy="40" r="6" stroke={color} strokeWidth="2" fill="none"/>
    <path d="M44 37v3l2 2" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M32 34v4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <path d="M32 38 Q36 42 40 40" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
  </svg>
)

const BG = () => (
  <svg viewBox="0 0 600 800" xmlns="http://www.w3.org/2000/svg"
    style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',opacity:0.07,pointerEvents:'none'}}>
    <circle cx="500" cy="600" r="220" fill="none" stroke="#1d9e75" strokeWidth="1"/>
    <circle cx="500" cy="600" r="170" fill="none" stroke="#1d9e75" strokeWidth="1.2"/>
    <circle cx="500" cy="600" r="120" fill="none" stroke="#1d9e75" strokeWidth="1.5"/>
    <circle cx="500" cy="600" r="70"  fill="none" stroke="#1d9e75" strokeWidth="2"/>
    <circle cx="500" cy="600" r="30"  fill="none" stroke="#1d9e75" strokeWidth="2.5"/>
    <line x1="500" y1="360" x2="500" y2="840" stroke="#1d9e75" strokeWidth="0.6"/>
    <line x1="260" y1="600" x2="740" y2="600" stroke="#1d9e75" strokeWidth="0.6"/>
    <polyline points="0,90 60,90 76,48 96,132 112,65 128,108 148,90 280,90" fill="none" stroke="#1d9e75" strokeWidth="1.8"/>
    <ellipse cx="80" cy="220" rx="65" ry="76" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <ellipse cx="80" cy="248" rx="28" ry="17" fill="none" stroke="#5dcaa5" strokeWidth="0.8"/>
    <path d="M200 370 Q185 382 183 412 Q181 442 195 454 Q210 462 220 446 Q224 430 221 408 Q216 384 212 372 Z" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <path d="M244 370 Q259 382 261 412 Q263 442 249 454 Q234 462 224 446 Q220 430 223 408 Q228 384 232 372 Z" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <path d="M30 500 Q46 518 30 536 Q14 554 30 572 Q46 590 30 608" fill="none" stroke="#1d9e75" strokeWidth="1.2"/>
    <path d="M50 500 Q34 518 50 536 Q66 554 50 572 Q34 590 50 608" fill="none" stroke="#1d9e75" strokeWidth="1.2"/>
    {[518,554,590].map((y,i)=><line key={i} x1="30" y1={y} x2="50" y2={y} stroke="#1d9e75" strokeWidth="0.8"/>)}
    {[0,1,2,3].map(r=>[0,1,2,3,4].map(c=>(
      <circle key={`${r}-${c}`} cx={300+c*28} cy={140+r*28} r="1.2" fill="#1d9e75"/>
    )))}
  </svg>
)

const stats = [
  { value:'50K+', label:'Scans analysed daily' },
  { value:'99.2%', label:'Diagnostic accuracy' },
  { value:'200+', label:'Imaging centres' },
]

export default function RadiologistRegister() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [firstName,setFirstName]       = useState('')
  const [lastName,setLastName]         = useState('')
  const [email,setEmail]               = useState('')
  const [otp,setOtp]                   = useState(new Array(OTP_LENGTH).fill(''))
  const [password,setPassword]         = useState('')
  const [confirm,setConfirm]           = useState('')
  const [showPwd,setShowPwd]           = useState(false)
  const [showCfm,setShowCfm]           = useState(false)
  const [error,setError]               = useState('')
  const [otpSent,setOtpSent]           = useState(false)
  const [otpVerified,setOtpVerified]   = useState(false)
  const [googleUser,setGoogleUser]     = useState(null)
  const [agreeTerms,setAgreeTerms]     = useState(false)
  const [showCodeSent,setShowCodeSent] = useState(false)
  const [showTerms,setShowTerms]       = useState(false)
  const otpRefs = useRef([])

  useEffect(() => { if (location.state?.prefillEmail) setEmail(location.state.prefillEmail) }, [location.state])
  useEffect(() => { if (error) { const t=setTimeout(()=>setError(''),5000); return ()=>clearTimeout(t) } }, [error])

  const handleSendOtp = async () => {
    if (!email) { setError('Please enter your email first'); return }
    try {
      const res = await api.post('/send-otp', { email, role: ROLE })
      if (res.status === 200) {
        setOtpSent(true); setError('')
        setShowCodeSent(true); setTimeout(()=>setShowCodeSent(false),3000)
      } else setError('Failed to send OTP')
    } catch { setError('Server error while sending OTP') }
  }

  const handleOtpChange = (el,i) => {
    if (isNaN(el.value)) return
    const n=[...otp]; n[i]=el.value; setOtp(n)
    if (el.value!==''&&i<OTP_LENGTH-1) otpRefs.current[i+1].focus()
  }

  const handleVerifyOtp = async () => {
    const s=otp.join('')
    if (s.length<OTP_LENGTH) { setError('Enter full 6-digit code'); return }
    try {
      const res=await api.post('/verify-otp',{email,otp:s})
      if (res.data.message==='OTP verified successfully') { setOtpVerified(true); setError('') }
      else setError('Invalid OTP — please try again')
    } catch { setError('OTP verification failed') }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (password!==confirm) { setError("Passwords don't match"); return }
    if (!agreeTerms) { setError('Please agree to the Terms & Conditions'); return }
    const username=`${firstName} ${lastName}`.trim()
    if (!username) { setError('Please enter your first and last name'); return }
    try {
      let res
      if (googleUser) {
        res=await api.post('/complete-google-registration',{email,username,password,confirm_password:confirm,role:ROLE})
      } else {
        if (!otpVerified) { setError('Please verify your email first'); return }
        res=await api.post('/register',{email,username,password,role:ROLE})
      }
      if (res.data.message==='User registered successfully'||res.data.message==='Registration completed successfully') {
        setError('Account created successfully!')
        setTimeout(()=>navigate('/radiologist/login'),1500)
      } else setError(res.data.message||'Registration failed')
    } catch (err) { console.error(err); setError('Registration failed! Please try again.') }
  }

  const googleSignup = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const res=await api.get('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${tokenResponse.access_token}`}})
        const {email:gEmail,name:gName}=res.data
        setGoogleUser({email:gEmail,role:ROLE}); setEmail(gEmail)
        const parts=gName.split(' '); setFirstName(parts[0]); setLastName(parts.slice(1).join(' '))
        setOtpVerified(true); setError('')
        api.post('/google-login',{email:gEmail,name:gName,role:ROLE})
          .then(r=>{ if (!r.data.needs_registration) { setError('Login successful'); navigate('/login') } })
          .catch(()=>setError('Google login failed on server'))
      } catch { setError('Google signup failed') }
    },
    onError:()=>setError('Google signup failed'),
  })

  const isSuccess = error==='Account created successfully!'
  // Step indicator: 1=email, 2=otp, 3=password
  const step = !otpSent ? 1 : !otpVerified ? 2 : 3

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'#fffbe7',
      fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif",
      position:'relative', overflow:'hidden', padding:'24px 16px',
    }}>
      <BG/>
      {[380,260,160].map((s,i)=>(
        <div key={i} style={{position:'absolute',bottom:-100,left:-100,width:s,height:s,borderRadius:'50%',border:`1px solid rgba(29,158,117,${0.06+i*0.06})`,pointerEvents:'none'}}/>
      ))}
      <img src="/logo.png" alt="ONIX AI" style={{position:'absolute',top:16,left:18,height:48,width:170,objectFit:'contain'}}/>

      <div style={{display:'flex',width:'100%',maxWidth:'1080px',borderRadius:'22px',overflow:'hidden',boxShadow:'0 32px 80px rgba(0,0,0,0.55)',position:'relative',zIndex:1}}>

        {/* ── LEFT PANEL ── */}
        <div style={{
          width:'42%', background:'linear-gradient(150deg, #38b6c7 10%, #16557c 40%, #081a2e 100%)',
          padding:'52px 36px', display:'flex', flexDirection:'column', justifyContent:'space-between',
          borderRight:'1px solid rgba(29,158,117,0.18)',
        }}>
          <div>
            {/* Icon */}
            <div style={{width:84,height:84,borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'1.5px solid rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:26}}>
              <RadiologistIcon size={52} color="#fff"/>
            </div>

            {/* Tagline */}
            <div style={{fontSize:'12px',color:T.tealLight,textTransform:'uppercase',letterSpacing:'0.14em',fontWeight:600,marginBottom:12}}>
              For Radiologists & Clinicians
            </div>
            <div style={{fontSize:'32px',fontWeight:700,color:'#fff',lineHeight:1.2,marginBottom:12}}>
              Precision.<br/>Speed.<br/>Intelligence.
            </div>
            <div style={{width:40,height:2.5,background:T.teal,borderRadius:2,marginBottom:20}}/>
            <p style={{fontSize:'14px',color:'rgba(159,225,203,0.85)',lineHeight:1.8,fontWeight:300,margin:'0 0 30px'}}>
              Join thousands of radiologists using AI-powered tools to deliver faster, more accurate diagnoses — from anywhere.
            </p>

            {/* Stats row */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:30}}>
              {stats.map(s=>(
                <div key={s.value} style={{background:'rgba(29,158,117,0.12)',border:'1px solid rgba(93,202,165,0.2)',borderRadius:12,padding:'14px 10px',textAlign:'center'}}>
                  <div style={{fontSize:'22px',fontWeight:700,color:T.tealLight,lineHeight:1}}>{s.value}</div>
                  <div style={{fontSize:'10px',color:'rgba(159,225,203,0.7)',marginTop:5,lineHeight:1.4}}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom testimonial */}
          <div style={{background:'rgba(255,255,255,0.06)',borderRadius:12,padding:'14px 16px',borderLeft:`3px solid ${T.teal}`}}>
            <p style={{fontSize:'12px',color:'rgba(159,225,203,0.8)',fontStyle:'italic',margin:'0 0 8px',lineHeight:1.6}}>
              "Reporting time dropped by 40% after our team moved to ONIX AI. The AI pre-analysis is a game changer."
            </p>
            <div style={{fontSize:'10px',color:T.tealLight,fontWeight:600}}>Dr. Priya Menon · Senior Radiologist</div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{flex:1,background:T.offWhite,display:'flex',alignItems:'center',justifyContent:'center',padding:'40px 36px',overflowY:'auto'}}>
          <div style={{background:T.white,borderRadius:'18px',border:`1px solid ${T.border}`,padding:'36px 32px',width:'100%',maxWidth:'440px',boxShadow:'0 4px 24px rgba(13,27,42,0.07)'}}>

            {/* Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22,paddingBottom:18,borderBottom:`1px solid ${T.border}`}}>
              <div>
                <div style={{fontSize:'10px',color:T.teal,textTransform:'uppercase',letterSpacing:'0.12em',fontWeight:600,marginBottom:3}}>Radiologist</div>
                <div style={{fontSize:'22px',fontWeight:700,color:T.textDark}}>Create Account</div>
                <div style={{fontSize:'12px',color:T.textLight,marginTop:2}}>Clinical & Imaging Professional</div>
              </div>
              <button onClick={()=>navigate(-1)} style={{flexShrink:0,background:'none',border:`1.5px solid ${T.border}`,borderRadius:'20px',padding:'7px 16px',fontSize:'12px',color:T.textMid,cursor:'pointer',fontFamily:'inherit',fontWeight:500,whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:4}}>
                ← Back
              </button>
            </div>

            {/* Step progress */}
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:22}}>
              {['Details','Verify','Password'].map((s,i)=>(
                <React.Fragment key={s}>
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <div style={{width:22,height:22,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:700,
                      background: step>i+1 ? T.teal : step===i+1 ? T.teal : 'rgba(29,158,117,0.12)',
                      color: step>=i+1 ? '#fff' : T.textLight,border: step<i+1 ? `1.5px solid ${T.border}` : 'none',
                      transition:'all 0.2s'}}>
                      {step>i+1 ? '✓' : i+1}
                    </div>
                    <span style={{fontSize:'10px',fontWeight:600,color:step===i+1?T.teal:step>i+1?T.teal:T.textLight,transition:'color 0.2s'}}>{s}</span>
                  </div>
                  {i<2 && <div style={{flex:1,height:1,background:step>i+1?T.teal:T.border,transition:'background 0.2s'}}/>}
                </React.Fragment>
              ))}
            </div>

            {/* Error / success */}
            {error && (
              <div style={{background:isSuccess?'#f0fdf4':'#fff0f0',border:`1px solid ${isSuccess?'#bbf7d0':'#f7c1c1'}`,borderRadius:8,padding:'9px 13px',color:isSuccess?'#166534':'#a32d2d',fontSize:'12px',marginBottom:14,textAlign:'center'}}>
                {error}
              </div>
            )}

            <form onSubmit={handleRegister}>
              {/* Step 1 — Details */}
              <div style={{display:'flex',gap:10,marginBottom:12}}>
                <div style={{flex:1}}>
                  <label style={lbl}>First Name</label>
                  <input style={inp()} placeholder="First name" value={firstName} onChange={e=>setFirstName(e.target.value)} required={!googleUser}/>
                </div>
                <div style={{flex:1}}>
                  <label style={lbl}>Last Name</label>
                  <input style={inp()} placeholder="Last name" value={lastName} onChange={e=>setLastName(e.target.value)}/>
                </div>
              </div>

              <div style={{marginBottom:6}}>
                <label style={lbl}>Email Address</label>
                <div style={{position:'relative'}}>
                  <input style={inp({paddingRight:otpVerified?'95px':'13px'})}
                    type="email" placeholder="you@clinic.com"
                    value={email} onChange={e=>setEmail(e.target.value)}
                    disabled={otpSent&&otpVerified} required/>
                  {otpVerified && <span style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',fontSize:'11px',color:T.teal,fontWeight:600}}>✔ Verified</span>}
                </div>
              </div>

              {!otpSent&&!otpVerified && (
                <div style={{textAlign:'right',marginBottom:12}}>
                  <button type="button" onClick={handleSendOtp}
                    style={{background:'none',border:'none',cursor:'pointer',fontSize:'12px',color:T.teal,fontWeight:600,fontFamily:'inherit',textDecoration:'underline',textUnderlineOffset:'2px'}}>
                    Get Verification Code
                  </button>
                </div>
              )}

              {/* Step 2 — OTP */}
              {otpSent&&!otpVerified && (
                <div style={{marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <label style={lbl}>6-Digit Code</label>
                    <span style={{fontSize:'11px',color:T.teal,fontWeight:600,visibility:showCodeSent?'visible':'hidden'}}>✅ Sent!</span>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:8}}>
                    {otp.map((d,i)=>(
                      <input key={i} maxLength={1} value={d}
                        onChange={e=>handleOtpChange(e.target,i)}
                        ref={el=>otpRefs.current[i]=el}
                        style={{width:'38px',height:'44px',textAlign:'center',fontSize:'18px',fontWeight:700,border:`1.5px solid ${T.border}`,borderRadius:'10px',outline:'none',fontFamily:'inherit',background:T.offWhite,color:T.textDark,transition:'border-color 0.2s'}}/>
                    ))}
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <button type="button" onClick={handleSendOtp}
                      style={{background:'none',border:'none',cursor:'pointer',fontSize:'11px',color:T.textLight,fontFamily:'inherit',textDecoration:'underline'}}>
                      Resend code
                    </button>
                    <button type="button" onClick={handleVerifyOtp}
                      style={{padding:'8px 20px',background:T.teal,color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                      Verify →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3 — Password */}
              {otpVerified && (
                <>
                  <div style={{marginTop:8,marginBottom:12}}>
                    <label style={lbl}>Password</label>
                    <div style={{position:'relative'}}>
                      <input style={inp({paddingRight:'55px'})} type={showPwd?'text':'password'} placeholder="Min. 8 characters" value={password} onChange={e=>setPassword(e.target.value)} required/>
                      <button type="button" onClick={()=>setShowPwd(!showPwd)}
                        style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:'11px',color:T.teal,fontWeight:600,fontFamily:'inherit'}}>
                        {showPwd?'Hide':'Show'}
                      </button>
                    </div>
                  </div>
                  <div style={{marginBottom:14}}>
                    <label style={lbl}>Confirm Password</label>
                    <div style={{position:'relative'}}>
                      <input style={inp({paddingRight:'55px',borderColor:confirm&&password&&confirm!==password?'#f09595':T.border})} type={showCfm?'text':'password'} placeholder="Re-enter password" value={confirm} onChange={e=>setConfirm(e.target.value)} required/>
                      <button type="button" onClick={()=>setShowCfm(!showCfm)}
                        style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:'11px',color:T.teal,fontWeight:600,fontFamily:'inherit'}}>
                        {showCfm?'Hide':'Show'}
                      </button>
                    </div>
                    {confirm&&password&&confirm!==password && <span style={{fontSize:'10px',color:'#e24b4a',marginTop:3,display:'block'}}>Passwords do not match</span>}
                  </div>

                  <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:16}}>
                    <input type="checkbox" id="terms" checked={agreeTerms} onChange={e=>setAgreeTerms(e.target.checked)} style={{marginTop:2,cursor:'pointer',accentColor:T.teal}}/>
                    <label htmlFor="terms" style={{fontSize:'12px',color:T.textMid,cursor:'pointer',lineHeight:1.5}}>
                      I agree to the{' '}
                      <span onClick={()=>setShowTerms(true)} style={{color:T.teal,fontWeight:600,textDecoration:'underline',cursor:'pointer'}}>Terms & Conditions</span>
                    </label>
                  </div>

                  <button type="submit" style={{width:'100%',padding:'12px',background:`linear-gradient(135deg,${T.teal},${T.tealDark})`,color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer',fontFamily:'inherit',marginBottom:14,letterSpacing:'0.02em'}}>
                    Create My Account
                  </button>
                </>
              )}
            </form>

            {!googleUser && (
              <>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,marginTop:otpVerified?0:4}}>
                  <div style={{flex:1,height:'1px',background:T.border}}/><span style={{fontSize:'11px',color:T.textLight}}>or sign up with</span><div style={{flex:1,height:'1px',background:T.border}}/>
                </div>
                <button onClick={()=>googleSignup()} style={{width:'100%',padding:'10px',background:T.white,border:`1.5px solid ${T.border}`,borderRadius:'10px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:'13px',fontWeight:500,color:T.textMid,fontFamily:'inherit'}}>
                  <FcGoogle size={18}/> Sign up with Google
                </button>
              </>
            )}

            <div style={{textAlign:'center',marginTop:16,fontSize:'12px',color:T.textLight}}>
              Already registered?{' '}
              <span onClick={()=>navigate('/radiologist/login')} style={{color:T.teal,fontWeight:600,cursor:'pointer',textDecoration:'underline'}}>Sign in here</span>
            </div>
          </div>
        </div>
      </div>

      {showTerms && (
        <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.6)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:9999}}>
          <div style={{background:'#fff',padding:'24px',borderRadius:'14px',maxWidth:'700px',width:'90%',maxHeight:'80vh',overflowY:'auto'}}>
            <TermsAndConditions/>
            <div style={{textAlign:'right',marginTop:16}}><CButton color="primary" onClick={()=>setShowTerms(false)}>Close</CButton></div>
          </div>
        </div>
      )}
    </div>
  )
}