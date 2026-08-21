import React from 'react';
export const inputBaseStyle={fontFamily:'var(--font-sans)',fontSize:'var(--text-base)',padding:'9px 12px',border:'1px solid var(--border-strong)',borderRadius:'var(--radius-md)',background:'var(--surface-card)',color:'var(--fg)',transition:'border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',width:'100%'};
export function Input({invalid=false,style,...rest}){
  const [focus,setFocus]=React.useState(false);
  return <input {...rest}
    style={{...inputBaseStyle,...(invalid?{borderColor:'var(--danger)'}:null),...(focus?{outline:'2px solid var(--focus-ring)',outlineOffset:'1px',borderColor:'var(--focus-ring)'}:null),...style}}
    onFocus={e=>{setFocus(true);rest.onFocus&&rest.onFocus(e)}}
    onBlur={e=>{setFocus(false);rest.onBlur&&rest.onBlur(e)}}/>;
}