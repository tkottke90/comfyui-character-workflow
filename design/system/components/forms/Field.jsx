import React from 'react';
export function Field({label,hint,error,required=false,htmlFor,children,style}){
  return <div style={{display:'flex',flexDirection:'column',gap:'5px',fontFamily:'var(--font-sans)',...style}}>
    <label htmlFor={htmlFor} style={{fontWeight:'var(--weight-bold)',fontSize:'var(--text-sm)',color:'var(--fg)'}}>{label}{required&&<span style={{color:'var(--danger)'}}> *</span>}</label>
    {children}
    {error?<div style={{fontSize:'var(--text-xs)',color:'var(--danger)',fontWeight:'var(--weight-medium)'}}>{error}</div>
      :hint?<div style={{fontSize:'var(--text-xs)',color:'var(--fg-muted)'}}>{hint}</div>:null}
  </div>;
}