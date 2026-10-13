import React from 'react'
import { useNavigate } from 'react-router-dom'

/* ── Icons ── */
const RadiologistIcon = ({ size = 44, color = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="18" r="10" stroke={color} strokeWidth="2.5" fill="none"/>
    <path d="M14 52c0-10 8-18 18-18s18 8 18 18" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <circle cx="44" cy="40" r="6" stroke={color} strokeWidth="2" fill="none"/>
    <path d="M44 37v3l2 2" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M32 34v4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <path d="M32 38 Q36 42 40 40" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
  </svg>
)

const OrganisationIcon = ({ size = 44, color = '#fff' }) => (
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

/* ── Combined background illustration ── */
const CombinedBG = () => (
  <svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg"
    style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none' }}>
    {/* CT rings left — darker strokes for light bg */}
    <circle cx="130" cy="420" r="180" fill="none" stroke="#0d6b78" strokeWidth="1"   opacity="0.2"/>
    <circle cx="130" cy="420" r="140" fill="none" stroke="#0d6b78" strokeWidth="1.1" opacity="0.24"/>
    <circle cx="130" cy="420" r="100" fill="none" stroke="#0d6b78" strokeWidth="1.3" opacity="0.26"/>
    <circle cx="130" cy="420" r="60"  fill="none" stroke="#0d6b78" strokeWidth="1.5" opacity="0.28"/>
    <circle cx="130" cy="420" r="25"  fill="none" stroke="#0d6b78" strokeWidth="1.8" opacity="0.3"/>
    <line x1="130" y1="220" x2="130" y2="620" stroke="#0d6b78" strokeWidth="0.8" opacity="0.16"/>
    <line x1="-70" y1="420" x2="330" y2="420" stroke="#0d6b78" strokeWidth="0.8" opacity="0.16"/>
    {/* ECG — bold, clearly visible */}
    <polyline points="0,120 60,120 76,75 96,165 112,90 128,135 148,120 320,120" fill="none" stroke="#0f7a5a" strokeWidth="2" opacity="0.28"/>
    {/* Skull */}
    <ellipse cx="160" cy="130" rx="55" ry="65" fill="none" stroke="#0d6b78" strokeWidth="1.2" opacity="0.22"/>
    <ellipse cx="160" cy="155" rx="24" ry="15" fill="none" stroke="#0d6b78" strokeWidth="1"   opacity="0.18"/>
    {/* Spine */}
    {[570,592,614,636].map((y,i) => <rect key={i} x="30" y={y} width="22" height="15" rx="3" fill="none" stroke="#0d6b78" strokeWidth="1.1" opacity="0.22"/>)}
    {/* Lungs */}
    <path d="M260 560 Q245 572 243 600 Q241 628 254 640 Q268 648 276 634 Q280 620 277 600 Q273 578 269 562 Z" fill="none" stroke="#0d6b78" strokeWidth="1.2" opacity="0.22"/>
    <path d="M300 560 Q315 572 317 600 Q319 628 306 640 Q292 648 284 634 Q280 620 283 600 Q287 578 291 562 Z" fill="none" stroke="#0d6b78" strokeWidth="1.2" opacity="0.22"/>
    {/* DNA */}
    <path d="M50 250 Q68 268 50 286 Q32 304 50 322 Q68 340 50 358" fill="none" stroke="#0d6b78" strokeWidth="1.4" opacity="0.25"/>
    <path d="M70 250 Q52 268 70 286 Q88 304 70 322 Q52 340 70 358" fill="none" stroke="#0d6b78" strokeWidth="1.4" opacity="0.25"/>
    {[268,304,340].map((y,i) => <line key={i} x1="50" y1={y} x2="70" y2={y} stroke="#0d6b78" strokeWidth="1.2" opacity="0.24"/>)}
    {/* AI neural net center */}
    {[[540,160],[540,260],[540,360],[540,460],[540,560],[640,210],[640,310],[640,410],[640,510],[740,260],[740,360],[740,460]].map(([x,y],i) => (
      <circle key={i} cx={x} cy={y} r="5.5" fill="none" stroke="#185fa5" strokeWidth="1.4" opacity="0.25"/>
    ))}
    {[[540,160,640,210],[540,160,640,310],[540,260,640,210],[540,260,640,310],[540,260,640,410],[540,360,640,310],[540,360,640,410],[540,360,640,510],[540,460,640,410],[540,460,640,510],[540,560,640,510],[640,210,740,260],[640,210,740,360],[640,310,740,260],[640,310,740,360],[640,310,740,460],[640,410,740,360],[640,410,740,460],[640,510,740,460]].map(([x1,y1,x2,y2],i) => (
      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#185fa5" strokeWidth="0.9" opacity="0.18"/>
    ))}
    <line x1="440" y1="400" x2="540" y2="400" stroke="#185fa5" strokeWidth="0.9" opacity="0.18"/>
    <line x1="440" y1="300" x2="440" y2="500" stroke="#185fa5" strokeWidth="0.9" opacity="0.18"/>
    <line x1="740" y1="360" x2="840" y2="360" stroke="#185fa5" strokeWidth="0.9" opacity="0.18"/>
    <line x1="840" y1="280" x2="840" y2="450" stroke="#185fa5" strokeWidth="0.9" opacity="0.18"/>
    <rect x="820" y="340" width="20" height="20" rx="3" fill="none" stroke="#185fa5" strokeWidth="1.2" opacity="0.2"/>
    <rect x="425" y="390" width="16" height="16" rx="3" fill="none" stroke="#185fa5" strokeWidth="1.2" opacity="0.2"/>
    {[0,1,2,3,4].map(r => [0,1,2,3].map(c => (
      <circle key={`g${r}-${c}`} cx={470+c*22} cy={680+r*22} r="2" fill="#185fa5" opacity="0.18"/>
    )))}
    {/* Hospital right */}
    <rect x="960" y="320" width="160" height="180" fill="none" stroke="#0d6b78" strokeWidth="1.3" opacity="0.22"/>
    <polygon points="940,320 1040,240 1140,320" fill="none" stroke="#0d6b78" strokeWidth="1.3" opacity="0.22"/>
    <rect x="1018" y="260" width="20" height="50" rx="3" fill="none" stroke="#0d6b78" strokeWidth="1.5" opacity="0.24"/>
    <rect x="1006" y="272" width="44" height="20" rx="3" fill="none" stroke="#0d6b78" strokeWidth="1.5" opacity="0.24"/>
    {[[968,350],[1010,350],[1052,350],[968,390],[1052,390]].map(([x,y],i) => <rect key={i} x={x} y={y} width="28" height="28" rx="2" fill="none" stroke="#0d6b78" strokeWidth="1.2" opacity="0.22"/>)}
    <rect x="1010" y="420" width="58" height="80" rx="2" fill="none" stroke="#0d6b78" strokeWidth="1.2" opacity="0.22"/>
    <circle cx="1040" cy="580" r="10" fill="none" stroke="#0d6b78" strokeWidth="1.3" opacity="0.22"/>
    {[[990,640],[1040,640],[1090,640]].map(([x,y],i) => <circle key={i} cx={x} cy={y} r="9" fill="none" stroke="#0d6b78" strokeWidth="1.2" opacity="0.22"/>)}
    <line x1="1040" y1="590" x2="1040" y2="612" stroke="#0d6b78" strokeWidth="1" opacity="0.2"/>
    <line x1="990" y1="612" x2="1090" y2="612" stroke="#0d6b78" strokeWidth="1" opacity="0.2"/>
    {[990,1040,1090].map((x,i) => <line key={i} x1={x} y1="612" x2={x} y2="631" stroke="#0d6b78" strokeWidth="1" opacity="0.2"/>)}
    <rect x="900" y="510" width="70" height="34" rx="5" fill="none" stroke="#0d6b78" strokeWidth="1.2" opacity="0.22"/>
    <circle cx="918" cy="548" r="7" fill="none" stroke="#0d6b78" strokeWidth="1.2" opacity="0.22"/>
    <circle cx="954" cy="548" r="7" fill="none" stroke="#0d6b78" strokeWidth="1.2" opacity="0.22"/>
    <rect x="1130" y="140" width="14" height="48" rx="3" fill="none" stroke="#0d6b78" strokeWidth="1.4" opacity="0.24"/>
    <rect x="1116" y="154" width="42" height="14" rx="3" fill="none" stroke="#0d6b78" strokeWidth="1.4" opacity="0.24"/>
    <polyline points="880,740 910,740 922,710 938,770 950,725 964,750 990,750 1100,750" fill="none" stroke="#0f7a5a" strokeWidth="2" opacity="0.26"/>
    {[0,1,2,3].map(r => [0,1,2,3,4].map(c => (
      <circle key={`d${r}-${c}`} cx={1000+c*24} cy={80+r*24} r="2" fill="#185fa5" opacity="0.2"/>
    )))}
  </svg>
)

/* ── Blue gradient card (matches screenshot) ── */
const CARD_DARK_BG = 'linear-gradient(160deg, #5dc6fa 0%, #14648b 40%, #04153d 100%)'
const TEAL = '#1a6cbf'
const TEAL_LIGHT = '#89ccf0'

/* ── Light grey theme tokens ── */
const BG = '#f0f2f5'
const TEXT_HEADING = '#0d1b2a'
const TEXT_SUB = '#4a6070'
const TEXT_MUTED = '#8fa8b8'
const BADGE_BG = 'rgba(30,108,191,0.12)'
const BADGE_BORDER = 'rgba(74,174,224,0.3)'
const BADGE_TEXT = '#0d4a9e'

const cards = [
  {
    role:'organization',
    label:'Organization',
    sub:'Hospital & Healthcare Institution',
    path:'/organization/login',
    features:['Multi-branch management','Team & role admin','Analytics & reporting'],
  },
  {
    role:'radiologist',
    label:'Radiologist',
    sub:'Clinical & Imaging Professional',
    path:'/radiologist/login',
    features:['View & report scans','AI-assisted diagnosis','Case repository'],
  },
]

function RoleCard({ card, onClick }) {
  const [hov, setHov] = React.useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 240,
        background: hov ? '#ffffff' : CARD_DARK_BG,
        border: `2px solid ${hov ? TEAL : 'rgba(74,174,224,0.35)'}`,
        borderRadius: 20,
        padding: '36px 28px',
        cursor: 'pointer',
        transition: 'all 0.22s ease',
        transform: hov ? 'translateY(-7px) scale(1.02)' : 'translateY(0) scale(1)',
        boxShadow: hov
          ? `0 24px 56px rgba(13,46,122,0.22), 0 0 0 1px rgba(30,108,191,0.18)`
          : '0 8px 32px rgba(13,46,122,0.22)',
      }}
    >
      {/* Icon circle */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: hov ? 'rgba(30,108,191,0.1)' : 'rgba(255,255,255,0.18)',
        border: hov ? `1.5px solid rgba(30,108,191,0.35)` : '1.5px solid rgba(255,255,255,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20, transition: 'all 0.22s',
      }}>
        {card.role === 'radiologist'
          ? <RadiologistIcon size={40} color={hov ? TEAL : '#fff'} />
          : <OrganisationIcon size={40} color={hov ? TEAL : '#fff'} />
        }
      </div>

      {/* Title */}
      <div style={{ fontSize: 20, fontWeight: 700, color: hov ? '#0d1b2a' : '#fff', marginBottom: 4, transition: 'color 0.22s' }}>
        {card.label}
      </div>
      <div style={{ fontSize: 12, color: hov ? '#4a6070' : '#a8d8f5', marginBottom: 20, transition: 'color 0.22s' }}>
        {card.sub}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: hov ? 'rgba(30,108,191,0.18)' : 'rgba(255,255,255,0.18)', marginBottom: 16, transition: 'background 0.22s' }} />

      {/* Features */}
      {card.features.map(f => (
        <div key={f} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background: hov ? TEAL : TEAL_LIGHT, flexShrink:0, transition:'background 0.22s' }}/>
          <span style={{ fontSize:12, color: hov ? '#4a6070' : 'rgba(255,255,255,0.65)', transition:'color 0.22s' }}>{f}</span>
        </div>
      ))}

      {/* CTA */}
      <div style={{ marginTop:22, display:'flex', alignItems:'center', gap:5, color: hov ? TEAL : '#a8d8f5', fontSize:13, fontWeight:600, transition:'color 0.22s' }}>
        Sign in
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </div>
    </div>
  )
}

export default function Login() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight:'100vh', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      background: BG,
      fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif",
      position:'relative', overflow:'hidden', padding:'24px 16px',
    }}>
      <CombinedBG />

      <img src="/logo.png" alt="ONIX AI" style={{ position:'absolute', top:16, left:18, height:48, width:170, objectFit:'contain' }} />

      {/* Header */}
      <div style={{ textAlign:'center', marginBottom:44, position:'relative', zIndex:1 }}>
        <div style={{ display:'inline-block', background: BADGE_BG, border:`1px solid ${BADGE_BORDER}`, borderRadius:20, padding:'5px 16px', marginBottom:16 }}>
          <span style={{ fontSize:10, color: BADGE_TEXT, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase' }}>Welcome to ONIX AI</span>
        </div>
        <h1 style={{ fontSize:30, fontWeight:700, color: TEXT_HEADING, margin:'0 0 8px', lineHeight:1.2 }}>Who are you signing in as?</h1>
        <p style={{ fontSize:14, color: TEXT_SUB, margin:0, fontWeight:400 }}>Choose your portal to continue</p>
      </div>

      {/* Cards */}
      <div style={{ display:'flex', gap:28, position:'relative', zIndex:1, flexWrap:'wrap', justifyContent:'center' }}>
        {cards.map(c => <RoleCard key={c.role} card={c} onClick={() => navigate(c.path)} />)}
      </div>

      {/* New partner line */}
      <div style={{ marginTop:36, position:'relative', zIndex:1, textAlign:'center' }}>
        <span style={{ fontSize:13, color: TEXT_SUB }}>New partner or institution?{' '}</span>
        <span
          onClick={() => navigate('/signup')}
          onMouseEnter={e => e.target.style.color='#0a4a9e'}
          onMouseLeave={e => e.target.style.color='#1a6cbf'}
          style={{ fontSize:13, fontWeight:600, color:'#1a6cbf', cursor:'pointer', textDecoration:'underline', textDecorationColor:'rgba(26,108,191,0.4)', textUnderlineOffset:'3px', transition:'color 0.15s' }}
        >
          Contact us
        </span>
        <span style={{ fontSize:13, color: TEXT_SUB }}> to get started.</span>
      </div>

      {/* Footer */}
      <div style={{ marginTop:28, position:'relative', zIndex:1, display:'flex', alignItems:'center', gap:7 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TEXT_MUTED} strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
        <span style={{ fontSize:11, color: TEXT_MUTED, letterSpacing:'0.04em' }}>256-bit encrypted · HIPAA compliant · SOC 2</span>
      </div>
    </div>
  )
}