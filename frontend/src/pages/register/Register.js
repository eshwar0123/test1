import React from 'react'
import { useNavigate } from 'react-router-dom'
import GoogleTranslateSwitcher from '../../shared/components/GoogleTranslateSwitcher'

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

const BG = () => (
  <svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg"
    style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none'}}>
    <circle cx="130" cy="400" r="180" fill="none" stroke="#1d9e75" strokeWidth="0.7" opacity="0.12"/>
    <circle cx="130" cy="400" r="130" fill="none" stroke="#1d9e75" strokeWidth="0.9" opacity="0.15"/>
    <circle cx="130" cy="400" r="80"  fill="none" stroke="#1d9e75" strokeWidth="1.1" opacity="0.18"/>
    <circle cx="130" cy="400" r="40"  fill="none" stroke="#1d9e75" strokeWidth="1.4" opacity="0.2"/>
    <polyline points="0,100 60,100 76,55 96,145 112,70 128,115 148,100 300,100" fill="none" stroke="#1d9e75" strokeWidth="1.5" opacity="0.18"/>
    <ellipse cx="170" cy="200" rx="50" ry="60" fill="none" stroke="#5dcaa5" strokeWidth="0.9" opacity="0.14"/>
    {[[540,160],[540,280],[540,400],[540,520],[640,220],[640,340],[640,460],[740,280],[740,400]].map(([x,y],i)=>(
      <circle key={i} cx={x} cy={y} r="5" fill="none" stroke="#378add" strokeWidth="1" opacity="0.16"/>
    ))}
    {[[540,160,640,220],[540,280,640,220],[540,280,640,340],[540,400,640,340],[540,400,640,460],[540,520,640,460],[640,220,740,280],[640,340,740,280],[640,340,740,400],[640,460,740,400]].map(([x1,y1,x2,y2],i)=>(
      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#378add" strokeWidth="0.6" opacity="0.1"/>
    ))}
    <rect x="970" y="300" width="150" height="170" fill="none" stroke="#1d9e75" strokeWidth="1" opacity="0.13"/>
    <polygon points="950,300 1045,230 1140,300" fill="none" stroke="#1d9e75" strokeWidth="1" opacity="0.13"/>
    <rect x="1022" y="252" width="18" height="44" rx="2" fill="none" stroke="#1d9e75" strokeWidth="1.2" opacity="0.15"/>
    <rect x="1010" y="264" width="42" height="18" rx="2" fill="none" stroke="#1d9e75" strokeWidth="1.2" opacity="0.15"/>
    <polyline points="870,720 900,720 912,692 928,748 940,708 954,732 980,732 1080,732" fill="none" stroke="#1d9e75" strokeWidth="1.2" opacity="0.15"/>
    {[0,1,2,3].map(r=>[0,1,2,3,4].map(c=>(
      <circle key={`d${r}-${c}`} cx={990+c*24} cy={80+r*24} r="1.5" fill="#378add" opacity="0.12"/>
    )))}
  </svg>
)

const TEAL='#1d9e75', TEAL_L='#5dcaa5'

const cards = [
  { role:'organization', label:'Organization', sub:'Hospital & Healthcare Institution', path:'/organization/signup', features:['Institution account','Manage your teams','Full analytics access'] },
  { role:'radiologist',  label:'Radiologist',  sub:'Clinical & Imaging Professional',  path:'/radiologist/signup',  features:['Personal clinical account','AI-assisted tools','Case management'] },
]

function Card({ card, onClick }) {
  const [hov, setHov] = React.useState(false)
  return (
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        width:232, background: hov ? '#fff' : 'linear-gradient(145deg,#0d6b78,#0a3a58,#0d1b2a)',
        border:`2px solid ${hov ? TEAL : 'rgba(29,158,117,0.25)'}`,
        borderRadius:20, padding:'34px 26px', cursor:'pointer',
        transition:'all 0.22s ease',
        transform: hov ? 'translateY(-7px) scale(1.02)' : 'none',
        boxShadow: hov ? '0 24px 56px rgba(13,27,42,0.28)' : '0 6px 28px rgba(0,0,0,0.38)',
      }}>
      <div style={{ width:68,height:68,borderRadius:'50%',
        background: hov ? 'rgba(29,158,117,0.1)' : 'rgba(255,255,255,0.1)',
        border: hov ? '1.5px solid rgba(29,158,117,0.3)' : '1.5px solid rgba(255,255,255,0.18)',
        display:'flex',alignItems:'center',justifyContent:'center',marginBottom:18,transition:'all 0.22s' }}>
        {card.role==='radiologist' ? <RadiologistIcon size={38} color={hov?TEAL:'#fff'}/> : <OrganisationIcon size={38} color={hov?TEAL:'#fff'}/>}
      </div>
      <div style={{fontSize:19,fontWeight:700,color:hov?'#0d1b2a':'#fff',marginBottom:3,transition:'color 0.22s'}}>{card.label}</div>
      <div style={{fontSize:11,color:hov?'#4a6070':TEAL_L,marginBottom:18,transition:'color 0.22s'}}>{card.sub}</div>
      <div style={{height:1,background:hov?'rgba(29,158,117,0.2)':'rgba(255,255,255,0.12)',marginBottom:14,transition:'background 0.22s'}}/>
      {card.features.map(f=>(
        <div key={f} style={{display:'flex',alignItems:'center',gap:7,marginBottom:7}}>
          <div style={{width:5,height:5,borderRadius:'50%',background:hov?TEAL:TEAL_L,flexShrink:0}}/>
          <span style={{fontSize:11,color:hov?'#4a6070':'rgba(255,255,255,0.65)',transition:'color 0.22s'}}>{f}</span>
        </div>
      ))}
      <div style={{marginTop:20,display:'flex',alignItems:'center',gap:5,color:hov?TEAL:TEAL_L,fontSize:12,fontWeight:600,transition:'color 0.22s'}}>
        Create account
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </div>
    </div>
  )
}

export default function Register() {
  const navigate = useNavigate()
  return (
    <div style={{
      minHeight:'100vh', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      background:'linear-gradient(135deg,#0d1b2a 0%,#0a2a40 55%,#0d3347 100%)',
      fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif",
      position:'relative', overflow:'hidden', padding:'24px 16px',
    }}>
      <BG/>
      <img src="/logo.png" alt="ONIX AI" style={{position:'absolute',top:18,left:20,height:46,width:165,objectFit:'contain'}}/>
      <div style={{position:'absolute',top:16,right:18,zIndex:10}}>
        <GoogleTranslateSwitcher />
      </div>

      <div style={{textAlign:'center',marginBottom:40,position:'relative',zIndex:1}}>
        <div style={{display:'inline-block',background:'rgba(29,158,117,0.15)',border:'1px solid rgba(93,202,165,0.3)',borderRadius:20,padding:'5px 16px',marginBottom:14}}>
          <span style={{fontSize:10,color:'#5dcaa5',fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase'}}>Create your account</span>
        </div>
        <h1 style={{fontSize:28,fontWeight:700,color:'#fff',margin:'0 0 8px'}}>Who are you registering as?</h1>
        <p style={{fontSize:13,color:'rgba(181,212,244,0.6)',margin:0,fontWeight:300}}>Choose your account type to get started</p>
      </div>

      <div style={{display:'flex',gap:26,position:'relative',zIndex:1,flexWrap:'wrap',justifyContent:'center'}}>
        {cards.map(c=><Card key={c.role} card={c} onClick={()=>navigate(c.path)}/>)}
      </div>

      <div style={{marginTop:32,position:'relative',zIndex:1,textAlign:'center'}}>
        <span style={{fontSize:13,color:'rgba(255,255,255,0.45)'}}>Already have an account?{' '}</span>
        <span onClick={()=>navigate('/login')}
          onMouseEnter={e=>e.target.style.color='#7ec4ff'}
          onMouseLeave={e=>e.target.style.color='#5aacf5'}
          style={{fontSize:13,fontWeight:600,color:'#5aacf5',cursor:'pointer',textDecoration:'underline',textDecorationColor:'rgba(90,172,245,0.4)',textUnderlineOffset:'3px'}}>
          Sign in
        </span>
      </div>

      <div style={{marginTop:24,position:'relative',zIndex:1,display:'flex',alignItems:'center',gap:7}}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        <span style={{fontSize:11,color:'rgba(255,255,255,0.25)',letterSpacing:'0.04em'}}>256-bit encrypted · HIPAA compliant · SOC 2</span>
      </div>
    </div>
  )
}
