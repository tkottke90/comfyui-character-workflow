import React from 'react';
export function SidebarNav({brand='TDK_Design',logoSrc,items=[],actionItems=[],activeId,onSelect,actions,footer,style}){
  const [hov,setHov]=React.useState(null);
  const link=(it)=>{
      const on=it.id===activeId;
      return <a key={it.id} href={it.href||'#'} onClick={e=>{if(onSelect){e.preventDefault();onSelect(it.id)}}}
        onMouseEnter={()=>setHov(it.id)} onMouseLeave={()=>setHov(null)}
        style={{display:'flex',alignItems:'center',gap:'var(--space-2)',padding:'9px 12px',borderRadius:'var(--radius-md)',textDecoration:'none',fontWeight:'var(--weight-medium)',fontSize:'var(--text-sm)',transition:'background var(--dur-fast) var(--ease-out)',
        background:on?'var(--sidebar-active-bg)':hov===it.id?'var(--sidebar-hover-bg)':'transparent',
        color:on?'var(--sidebar-active-fg, #fff)':'var(--sidebar-fg-muted)'}}>
        {it.icon}{it.label}
      </a>;
  };
  return <aside style={{width:'var(--sidebar-width)',minHeight:'100%',background:'var(--sidebar-bg)',color:'var(--sidebar-fg)',padding:'var(--space-5) var(--space-3)',display:'flex',flexDirection:'column',gap:'var(--space-4)',fontFamily:'var(--font-sans)',boxSizing:'border-box',...style}}>
    <header style={{display:'flex',alignItems:'center',gap:'var(--space-2)',padding:'0 var(--space-3)',flexShrink:0}}>
      {logoSrc&&<img src={logoSrc} alt="" style={{width:26,height:26,filter:'var(--sidebar-logo-filter, brightness(0) invert(1))'}}/>}
      <span style={{fontWeight:'var(--weight-heading)',fontSize:'var(--text-md)',color:'var(--sidebar-fg)',letterSpacing:'.02em'}}>{brand}</span>
    </header>
    <nav style={{flexGrow:1,display:'flex',flexDirection:'column',gap:'var(--space-1)',minHeight:0,overflowY:'auto'}}>
    {items.map(link)}
    </nav>
    {(actionItems.length>0||actions||footer)&&<div style={{flexShrink:0,display:'flex',flexDirection:'column',gap:'var(--space-1)'}}>{actionItems.map(link)}{actions||footer}</div>}
  </aside>;
}