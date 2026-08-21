import React from 'react';
function Box({checked,radio=false}){
  return <span aria-hidden="true" style={{width:18,height:18,flexShrink:0,borderRadius:radio?'50%':'var(--radius-sm)',border:`1.5px solid ${checked?'var(--accent)':'var(--border-strong)'}`,background:checked?'var(--accent)':'var(--surface-card)',display:'inline-flex',alignItems:'center',justifyContent:'center',transition:'all var(--dur-fast) var(--ease-spring)'}}>
    {checked&&(radio?<span style={{width:7,height:7,borderRadius:'50%',background:'var(--accent-fg)'}}></span>
      :<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-fg)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>)}
  </span>;
}
export function Checkbox({label,checked=false,onChange,disabled=false,style}){
  return <label style={{display:'inline-flex',alignItems:'center',gap:'var(--space-2)',cursor:disabled?'not-allowed':'pointer',opacity:disabled?.5:1,fontFamily:'var(--font-sans)',fontSize:'var(--text-base)',color:'var(--fg)',...style}}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={e=>onChange&&onChange(e.target.checked)} style={{position:'absolute',opacity:0,width:1,height:1}}/>
    <Box checked={checked}/>{label}
  </label>;
}
export function Radio({label,checked=false,onChange,name,value,disabled=false,style}){
  return <label style={{display:'inline-flex',alignItems:'center',gap:'var(--space-2)',cursor:disabled?'not-allowed':'pointer',opacity:disabled?.5:1,fontFamily:'var(--font-sans)',fontSize:'var(--text-base)',color:'var(--fg)',...style}}>
    <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={()=>onChange&&onChange(value)} style={{position:'absolute',opacity:0,width:1,height:1}}/>
    <Box checked={checked} radio/>{label}
  </label>;
}