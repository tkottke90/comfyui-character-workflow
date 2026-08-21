import React from 'react';
export function Stepper({steps=[],current=0,style}){
  return <ol style={{display:'flex',alignItems:'flex-start',listStyle:'none',margin:0,padding:0,fontFamily:'var(--font-sans)',...style}}>
    {steps.map((s,i)=>{
      const done=i<current,active=i===current;
      return <li key={i} style={{display:'flex',alignItems:'flex-start',flex:i<steps.length-1?1:'0 0 auto',minWidth:0}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,minWidth:64}}>
          <span style={{width:30,height:30,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'var(--weight-bold)',fontSize:'var(--text-sm)',flexShrink:0,transition:'all var(--dur-base) var(--ease-spring)',
            background:done?'var(--accent)':active?'var(--surface-card)':'var(--surface-sunken)',
            color:done?'var(--accent-fg)':active?'var(--accent)':'var(--fg-subtle)',
            border:`2px solid ${done||active?'var(--accent)':'var(--border-strong)'}`}}>
            {done?<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>:i+1}
          </span>
          <span style={{fontSize:'var(--text-xs)',fontWeight:active?'var(--weight-bold)':'var(--weight-medium)',color:active?'var(--fg)':'var(--fg-muted)',textAlign:'center',maxWidth:96}}>{s}</span>
        </div>
        {i<steps.length-1&&<span style={{flex:1,height:2,background:done?'var(--accent)':'var(--border)',margin:'14px 4px 0',borderRadius:1,transition:'background var(--dur-base) var(--ease-out)'}}></span>}
      </li>;
    })}
  </ol>;
}