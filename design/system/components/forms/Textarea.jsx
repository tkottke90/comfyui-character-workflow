import React from 'react';
import { inputBaseStyle } from './Input.jsx';
export function Textarea({invalid=false,rows=4,style,...rest}){
  const [focus,setFocus]=React.useState(false);
  return <textarea rows={rows} {...rest}
    style={{...inputBaseStyle,resize:'vertical',lineHeight:'var(--leading-normal)',...(invalid?{borderColor:'var(--danger)'}:null),...(focus?{outline:'2px solid var(--focus-ring)',outlineOffset:'1px',borderColor:'var(--focus-ring)'}:null),...style}}
    onFocus={e=>{setFocus(true);rest.onFocus&&rest.onFocus(e)}}
    onBlur={e=>{setFocus(false);rest.onBlur&&rest.onBlur(e)}}/>;
}