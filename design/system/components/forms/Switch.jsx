import React from 'react';
export function Switch({label,checked=false,onChange,disabled=false,style}){
  return <label style={{display:'inline-flex',alignItems:'center',gap:'var(--space-2)',cursor:disabled?'not-allowed':'pointer',opacity:disabled?.5:1,fontFamily:'var(--font-sans)',fontSize:'var(--text-base)',color:'var(--fg)',...style}}>
    <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e=>onChange&&onChange(e.target.checked)} style={{position:'absolute',opacity:0,width:1,height:1}}/>
    <span aria-hidden="true" style={{width:38,height:22,borderRadius:'var(--radius-full)',background:checked?'var(--accent)':'var(--border-strong)',position:'relative',flexShrink:0,transition:'background var(--dur-base) var(--ease-out)'}}>
      <span style={{position:'absolute',top:3,left:checked?19:3,width:16,height:16,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 2px rgba(29,38,52,.2)',transition:'left var(--dur-base) var(--ease-spring)'}}></span>
    </span>{label}
  </label>;
}