import React from 'react';
import { inputBaseStyle } from './Input.jsx';
export function Select({options=[],invalid=false,style,...rest}){
  const [focus,setFocus]=React.useState(false);
  return <select {...rest}
    style={{...inputBaseStyle,appearance:'none',WebkitAppearance:'none',backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23587fa7' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,backgroundRepeat:'no-repeat',backgroundPosition:'right 10px center',paddingRight:'32px',cursor:'pointer',...(invalid?{borderColor:'var(--danger)'}:null),...(focus?{outline:'2px solid var(--focus-ring)',outlineOffset:'1px'}:null),...style}}
    onFocus={e=>{setFocus(true);rest.onFocus&&rest.onFocus(e)}}
    onBlur={e=>{setFocus(false);rest.onBlur&&rest.onBlur(e)}}>
    {options.map(o=>typeof o==='string'?<option key={o} value={o}>{o}</option>:<option key={o.value} value={o.value}>{o.label}</option>)}
    {rest.children}
  </select>;
}