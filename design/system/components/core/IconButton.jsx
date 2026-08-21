import React from 'react';
export function IconButton({label,size='md',variant='ghost',disabled=false,onClick,children,style}){
  const dim={sm:28,md:36,lg:44}[size];
  const [hov,setHov]=React.useState(false),[act,setAct]=React.useState(false);
  const variants={
    ghost:{background:hov?'var(--surface-sunken)':'transparent',color:'var(--fg-muted)'},
    primary:{background:hov?'var(--accent-hover)':'var(--accent)',color:'var(--accent-fg)'},
    outline:{background:hov?'var(--surface-sunken)':'var(--surface-card)',color:'var(--fg-muted)',border:'1px solid var(--border)'}
  };
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
    style={{width:dim,height:dim,display:'inline-flex',alignItems:'center',justifyContent:'center',border:'1px solid transparent',borderRadius:'var(--radius-md)',cursor:disabled?'not-allowed':'pointer',opacity:disabled?.5:1,transition:'background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-spring)',transform:act&&!disabled?'scale(.94)':'none',...variants[variant],...style}}
    onMouseEnter={()=>setHov(true)} onMouseLeave={()=>{setHov(false);setAct(false)}}
    onMouseDown={()=>setAct(true)} onMouseUp={()=>setAct(false)}>{children}</button>;
}