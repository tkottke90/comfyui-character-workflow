import React from 'react';
export function Breadcrumbs({items=[],style}){
  return <nav aria-label="Breadcrumb" style={{fontFamily:'var(--font-sans)',fontSize:'var(--text-sm)',...style}}>
    <ol style={{display:'flex',alignItems:'center',gap:'var(--space-2)',listStyle:'none',margin:0,padding:0,flexWrap:'wrap'}}>
      {items.map((it,i)=>{
        const last=i===items.length-1;
        return <li key={i} style={{display:'flex',alignItems:'center',gap:'var(--space-2)'}}>
          {last||!it.href?<span aria-current={last?'page':undefined} style={{color:last?'var(--fg)':'var(--fg-muted)',fontWeight:last?'var(--weight-bold)':'var(--weight-body)'}}>{it.label}</span>
            :<a href={it.href} onClick={it.onClick} style={{color:'var(--fg-muted)',textDecoration:'none'}}>{it.label}</a>}
          {!last&&<span aria-hidden="true" style={{color:'var(--fg-subtle)'}}>›</span>}
        </li>;
      })}
    </ol>
  </nav>;
}