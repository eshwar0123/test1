import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { CButton } from '@coreui/react'
import api from "../../shared/api/axios"
import { FcGoogle } from 'react-icons/fc'
import { useGoogleLogin } from '@react-oauth/google'
import TermsAndConditions from './TermsAndConditions'

const OTP_LENGTH = 6
const ROLE = 'organization'

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

const OrgIcon = ({ size=52, color='#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <rect x="10" y="22" width="44" height="36" rx="2" stroke={color} strokeWidth="2.5" fill="none"/>
    <polygon points="6,22 32,6 58,22" stroke={color} strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
    <rect x="28" y="10" width="8" height="20" rx="2" stroke={color} strokeWidth="2" fill="none"/>
    <rect x="22" y="16" width="20" height="8" rx="2" stroke={color} strokeWidth="2" fill="none"/>
    <rect x="15" y="34" width="10" height="10" rx="1.5" stroke={color} strokeWidth="1.8" fill="none"/>
    <rect x="39" y="34" width="10" height="10" rx="1.5" stroke={color} strokeWidth="1.8" fill="none"/>
    <rect x="26" y="42" width="12" height="16" rx="1.5" stroke={color} strokeWidth="1.8" fill="none"/>
  </svg>
)

const BG = () => (
  <svg viewBox="0 0 600 800" xmlns="http://www.w3.org/2000/svg"
    style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',opacity:0.07,pointerEvents:'none'}}>
    <rect x="180" y="240" width="200" height="200" fill="none" stroke="#1d9e75" strokeWidth="1.5"/>
    <polygon points="160,240 280,160 400,240" fill="none" stroke="#1d9e75" strokeWidth="1.5"/>
    <rect x="266" y="190" width="28" height="50" rx="4" fill="none" stroke="#1d9e75" strokeWidth="1.8"/>
    <rect x="252" y="204" width="56" height="22" rx="4" fill="none" stroke="#1d9e75" strokeWidth="1.8"/>
    {[[200,270],[250,270],[330,270],[200,315],[330,315]].map(([x,y],i)=>(
      <rect key={i} x={x} y={y} width="28" height="28" rx="2" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    ))}
    <rect x="240" y="340" width="80" height="100" fill="none" stroke="#1d9e75" strokeWidth="1"/>
    <line x1="80" y1="440" x2="480" y2="440" stroke="#1d9e75" strokeWidth="0.8"/>
    <rect x="100" y="450" width="75" height="36" rx="5" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <circle cx="118" cy="490" r="8" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <circle cx="160" cy="490" r="8" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    <circle cx="280" cy="530" r="13" fill="none" stroke="#1d9e75" strokeWidth="1.2"/>
    {[[200,590],[280,590],[360,590]].map(([x,y],i)=>(
      <circle key={i} cx={x} cy={y} r="11" fill="none" stroke="#5dcaa5" strokeWidth="1"/>
    ))}
    <line x1="280" y1="543" x2="280" y2="566" stroke="#1d9e75" strokeWidth="0.8"/>
    <line x1="200" y1="566" x2="360" y2="566" stroke="#1d9e75" strokeWidth="0.8"/>
    {[200,280,360].map((x,i)=><line key={i} x1={x} y1="566" x2={x} y2="579" stroke="#1d9e75" strokeWidth="0.8"/>)}
    <rect x="20" y="50" width="18" height="56" rx="4" fill="none" stroke="#1d9e75" strokeWidth="1.4"/>
    <rect x="2" y="68" width="54" height="18" rx="4" fill="none" stroke="#1d9e75" strokeWidth="1.4"/>
    <circle cx="500" cy="560" r="160" fill="none" stroke="#0a3350" strokeWidth="1"/>
    <circle cx="500" cy="560" r="110" fill="none" stroke="#1d9e75" strokeWidth="1"/>
    <circle cx="500" cy="560" r="60"  fill="none" stroke="#1d9e75" strokeWidth="1.2"/>
    <polyline points="20,680 50,680 62,652 78,708 90,665 104,688 130,688 200,688" fill="none" stroke="#1d9e75" strokeWidth="1.5"/>
    {[0,1,2,3].map(r=>[0,1,2,3,4].map(c=>(
      <circle key={`${r}-${c}`} cx={360+c*26} cy={100+r*26} r="1.2" fill="#1d9e75"/>
    )))}
  </svg>
)

const stats = [
  { value:'600+', label:'Partner hospitals' },
  { value:'2M+',  label:'Reports processed' },
  { value:'99.9%',label:'Platform uptime' },
]

export default function OrganizationRegister() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [orgName,setOrgName]           = useState('')
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

  useEffect(()=>{ if (location.state?.prefillEmail) setEmail(location.state.prefillEmail) },[location.state])
  useEffect(()=>{ if (error) { const t=setTimeout(()=>setError(''),5000); return ()=>clearTimeout(t) } },[error])

  const handleSendOtp = async () => {
    if (!email) { setError('Please enter your email first'); return }
    try {
      const res=await api.post('/send-otp',{email,role:ROLE})
      if (res.status===200) { setOtpSent(true); setError(''); setShowCodeSent(true); setTimeout(()=>setShowCodeSent(false),3000) }
      else setError('Failed to send OTP')
    } catch { setError('Server error while sending OTP') }
  }

  const handleOtpChange = (el,i) => {
    if (isNaN(el.value)) return
    const n=[...otp]; n[i]=el.value; setOtp(n)
    if (el.value!==''&&i<OTP_LENGTH-1) otpRefs.current[i+1].focus()
  }

  const handleVerifyOtp = async () => {
    const s=otp.join('')
    if (s.length<OTP_LENGTH) { setError('Enter the full 6-digit code'); return }
    try {
      const res=await api.post('/verify-otp',{email,otp:s})
      if (res.data.message==='OTP verified successfully') { setOtpVerified(true); setError('') }
      else setError('Invalid code — please try again')
    } catch { setError('OTP verification failed') }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (password!==confirm) { setError("Passwords don't match"); return }
    if (!agreeTerms) { setError('Please agree to the Terms & Conditions'); return }
    if (!orgName.trim()) { setError('Please enter your organization name'); return }
    try {
      let res
      if (googleUser) {
        res=await api.post('/complete-google-registration',{email,username:orgName,password,confirm_password:confirm,role:ROLE})
      } else {
        if (!otpVerified) { setError('Please verify your email first'); return }
        res=await api.post('/register',{email,username:orgName,password,role:ROLE})
      }
      if (res.data.message==='User registered successfully'||res.data.message==='Registration completed successfully') {
        setError('Account created successfully!')
        setTimeout(()=>navigate('/organization/login'),1500)
      } else setError(res.data.message||'Registration failed')
    } catch (err) { console.error(err); setError('Registration failed! Please try again.') }
  }

  const googleSignup = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const res=await api.get('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${tokenResponse.access_token}`}})
        const {email:gEmail,name:gName}=res.data
        setGoogleUser({email:gEmail,role:ROLE}); setEmail(gEmail); setOrgName(gName); setOtpVerified(true); setError('')
        api.post('/google-login',{email:gEmail,name:gName,role:ROLE})
          .then(r=>{ if (!r.data.needs_registration) { setError('Login successful'); navigate('/login') } })
          .catch(()=>setError('Google login failed on server'))
      } catch { setError('Google signup failed') }
    },
    onError:()=>setError('Google signup failed'),
  })

  const isSuccess = error==='Account created successfully!'
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
        <div key={i} style={{position:'absolute',top:-100,right:-100,width:s,height:s,borderRadius:'50%',border:`1px solid rgba(29,158,117,${0.05+i*0.05})`,pointerEvents:'none'}}/>
      ))}
      <img src="/logo.png" alt="ONIX AI" style={{position:'absolute',top:16,left:18,height:48,width:170,objectFit:'contain'}}/>

      <div style={{display:'flex',width:'100%',maxWidth:'1080px',borderRadius:'22px',overflow:'hidden',boxShadow:'0 32px 80px rgba(0,0,0,0.55)',position:'relative',zIndex:1}}>

        {/* ── LEFT PANEL ── */}
        <div style={{
          width:'42%', background:'linear-gradient(150deg, #38b6c7 10%, #16557c 40%, #081a2e 100%)',
          padding:'52px 36px', display:'flex', flexDirection:'column', justifyContent:'space-between',
          borderRight:'1px solid rgba(29,158,117,0.18)', position:'relative', overflow:'hidden',
        }}>
          <div style={{position:'absolute',bottom:0,right:0,width:'130px',height:'130px',backgroundImage:'radial-gradient(circle, rgba(29,158,117,0.22) 1px, transparent 1px)',backgroundSize:'14px 14px'}}/>
          <div>
            <div style={{width:84,height:84,borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'1.5px solid rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:26}}>
              <OrgIcon size={52} color="#fff"/>
            </div>

            <div style={{fontSize:'12px',color:T.tealLight,textTransform:'uppercase',letterSpacing:'0.14em',fontWeight:600,marginBottom:12}}>
              For Hospitals & Institutions
            </div>
            <div style={{fontSize:'32px',fontWeight:700,color:'#fff',lineHeight:1.2,marginBottom:12}}>
              Built for<br/>Modern<br/>Healthcare.
            </div>
            <div style={{width:40,height:2.5,background:T.teal,borderRadius:2,marginBottom:20}}/>
            <p style={{fontSize:'14px',color:'rgba(159,225,203,0.85)',lineHeight:1.8,fontWeight:300,margin:'0 0 30px'}}>
              Streamline your radiology operations with enterprise-grade tools for team management, analytics, and AI-powered workflows.
            </p>

            {/* Stats */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:30}}>
              {stats.map(s=>(
                <div key={s.value} style={{background:'rgba(29,158,117,0.12)',border:'1px solid rgba(93,202,165,0.2)',borderRadius:12,padding:'14px 10px',textAlign:'center'}}>
                  <div style={{fontSize:'22px',fontWeight:700,color:T.tealLight,lineHeight:1}}>{s.value}</div>
                  <div style={{fontSize:'10px',color:'rgba(159,225,203,0.7)',marginTop:5,lineHeight:1.4}}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Testimonial */}
          <div style={{background:'rgba(255,255,255,0.06)',borderRadius:12,padding:'14px 16px',borderLeft:`3px solid ${T.teal}`,position:'relative',zIndex:1}}>
            <p style={{fontSize:'12px',color:'rgba(159,225,203,0.8)',fontStyle:'italic',margin:'0 0 8px',lineHeight:1.6}}>
              "ONIX AI transformed how we manage radiology across our 12 branches. Turnaround is down by 35%."
            </p>
            <div style={{fontSize:'10px',color:T.tealLight,fontWeight:600}}>Mr. Arjun Rao · CTO, MedCare Hospital Group</div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{flex:1,background:T.offWhite,display:'flex',alignItems:'center',justifyContent:'center',padding:'40px 36px',overflowY:'auto'}}>
          <div style={{background:T.white,borderRadius:'18px',border:`1px solid ${T.border}`,padding:'36px 32px',width:'100%',maxWidth:'440px',boxShadow:'0 4px 24px rgba(13,27,42,0.07)'}}>

            {/* Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22,paddingBottom:18,borderBottom:`1px solid ${T.border}`}}>
              <div style={{display:'flex',alignItems:'center',gap:14}}>
                <div style={{width:44,height:44,borderRadius:'12px',background:T.tealPale,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <OrgIcon size={26} color={T.teal}/>
                </div>
                <div>
                  <div style={{fontSize:'18px',fontWeight:700,color:T.textDark}}>Create Organization</div>
                  <div style={{fontSize:'12px',color:T.textLight,marginTop:2}}>Hospital & Healthcare Institution</div>
                </div>
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
                      background:step>=i+1?T.teal:'rgba(29,158,117,0.12)',
                      color:step>=i+1?'#fff':T.textLight,
                      border:step<i+1?`1.5px solid ${T.border}`:'none',transition:'all 0.2s'}}>
                      {step>i+1?'✓':i+1}
                    </div>
                    <span style={{fontSize:'10px',fontWeight:600,color:step>=i+1?T.teal:T.textLight,transition:'color 0.2s'}}>{s}</span>
                  </div>
                  {i<2&&<div style={{flex:1,height:1,background:step>i+1?T.teal:T.border,transition:'background 0.2s'}}/>}
                </React.Fragment>
              ))}
            </div>

            {error && (
              <div style={{background:isSuccess?'#f0fdf4':'#fff0f0',border:`1px solid ${isSuccess?'#bbf7d0':'#f7c1c1'}`,borderRadius:8,padding:'9px 13px',color:isSuccess?'#166534':'#a32d2d',fontSize:'12px',marginBottom:14,textAlign:'center'}}>
                {error}
              </div>
            )}

            <form onSubmit={handleRegister}>
              {/* Org name */}
              <div style={{marginBottom:12}}>
                <label style={lbl}>Organization Name</label>
                <input style={inp()} placeholder="e.g. City General Hospital" value={orgName} onChange={e=>setOrgName(e.target.value)} required={!googleUser}/>
              </div>

              {/* Email */}
              <div style={{marginBottom:6}}>
                <label style={lbl}>Official Email Address</label>
                <div style={{position:'relative'}}>
                  <input style={inp({paddingRight:otpVerified?'95px':'13px'})}
                    type="email" placeholder="admin@hospital.org"
                    value={email} onChange={e=>setEmail(e.target.value)}
                    disabled={otpSent&&otpVerified} required/>
                  {otpVerified&&<span style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',fontSize:'11px',color:T.teal,fontWeight:600}}>✔ Verified</span>}
                </div>
              </div>

              {!otpSent&&!otpVerified&&(
                <div style={{textAlign:'right',marginBottom:12}}>
                  <button type="button" onClick={handleSendOtp}
                    style={{background:'none',border:'none',cursor:'pointer',fontSize:'12px',color:T.teal,fontWeight:600,fontFamily:'inherit',textDecoration:'underline',textUnderlineOffset:'2px'}}>
                    Get Verification Code
                  </button>
                </div>
              )}

              {/* OTP */}
              {otpSent&&!otpVerified&&(
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
                        style={{width:'38px',height:'44px',textAlign:'center',fontSize:'18px',fontWeight:700,border:`1.5px solid ${T.border}`,borderRadius:'10px',outline:'none',fontFamily:'inherit',background:T.offWhite,color:T.textDark}}/>
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

              {/* Password */}
              {otpVerified&&(
                <>
                  <div style={{marginTop:8,marginBottom:12}}>
                    <label style={lbl}>Password</label>
                    <div style={{position:'relative'}}>
                      <input style={inp({paddingRight:'55px'})} type={showPwd?'text':'password'} placeholder="Min. 8 characters" value={password} onChange={e=>setPassword(e.target.value)} required/>
                      <button type="button" onClick={()=>setShowPwd(!showPwd)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:'11px',color:T.teal,fontWeight:600,fontFamily:'inherit'}}>
                        {showPwd?'Hide':'Show'}
                      </button>
                    </div>
                  </div>
                  <div style={{marginBottom:14}}>
                    <label style={lbl}>Confirm Password</label>
                    <div style={{position:'relative'}}>
                      <input style={inp({paddingRight:'55px',borderColor:confirm&&password&&confirm!==password?'#f09595':T.border})} type={showCfm?'text':'password'} placeholder="Re-enter password" value={confirm} onChange={e=>setConfirm(e.target.value)} required/>
                      <button type="button" onClick={()=>setShowCfm(!showCfm)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:'11px',color:T.teal,fontWeight:600,fontFamily:'inherit'}}>
                        {showCfm?'Hide':'Show'}
                      </button>
                    </div>
                    {confirm&&password&&confirm!==password&&<span style={{fontSize:'10px',color:'#e24b4a',marginTop:3,display:'block'}}>Passwords do not match</span>}
                  </div>

                  <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:16}}>
                    <input type="checkbox" id="terms" checked={agreeTerms} onChange={e=>setAgreeTerms(e.target.checked)} style={{marginTop:2,cursor:'pointer',accentColor:T.teal}}/>
                    <label htmlFor="terms" style={{fontSize:'12px',color:T.textMid,cursor:'pointer',lineHeight:1.5}}>
                      I agree to the{' '}
                      <span onClick={()=>setShowTerms(true)} style={{color:T.teal,fontWeight:600,textDecoration:'underline',cursor:'pointer'}}>Terms & Conditions</span>
                    </label>
                  </div>

                  <button type="submit" style={{width:'100%',padding:'12px',background:`linear-gradient(135deg,${T.teal},${T.tealDark})`,color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer',fontFamily:'inherit',marginBottom:14,letterSpacing:'0.02em'}}>
                    Register Organization
                  </button>
                </>
              )}
            </form>

            {!googleUser&&(
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
              <span onClick={()=>navigate('/organization/login')} style={{color:T.teal,fontWeight:600,cursor:'pointer',textDecoration:'underline'}}>Sign in here</span>
            </div>
          </div>
        </div>
      </div>

      {showTerms&&(
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