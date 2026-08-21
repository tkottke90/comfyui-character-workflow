import React from 'react';
export function Tabs({tabs=[],active=0,onChange,style}){
  return <div role="tablist" style={{display:'flex',gap:2,borderBottom:'1px solid var(--border)',fontFamily:'var(--font-sans)',...style}}>
    {tabs.map((t,i)=>{
      const on=i===active;
      return <button key={i} role="tab" aria-selected={on} onClick={()=>onChange&&onChange(i)}
        style={{font:'inherit',fontWeight:'var(--weight-medium)',fontSize:'var(--text-sm)',padding:'8px 16px',cursor:'pointer',
        border:'1px solid var(--border)',borderBottom:'none',borderRadius:'var(--radius-md) var(--radius-md) 0 0',
        background:on?'var(--surface-card)':'var(--surface-sunken)',color:on?'var(--fg)':'var(--fg-muted)',
        position:'relative',top:1,transition:'background var(--dur-fast) var(--ease-out)',
        boxShadow:on?'inset 0 2px 0 var(--accent)':'none'}}>{t}</button>;
    })}
  </div>;
}