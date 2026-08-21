import React from 'react';
import { IconButton } from '../core/IconButton.jsx';
export function Dialog({open,title,onClose,actions,footer,children,width=440,style}){
  const ref=React.useRef(null);
  React.useEffect(()=>{
    const d=ref.current;if(!d)return;
    if(open&&!d.open)d.showModal();
    else if(!open&&d.open)d.close();
  },[open]);
  return <dialog ref={ref} className="tdk-dialog" onCancel={e=>{e.preventDefault();onClose&&onClose()}}
    onClick={e=>{if(e.target===ref.current)onClose&&onClose()}}
    style={{background:'var(--surface-raised)',color:'var(--fg)',border:'1px solid var(--border)',borderRadius:'var(--radius-xl)',boxShadow:'var(--shadow-overlay)',width:'calc(100% - 32px)',maxWidth:width,padding:0,fontFamily:'var(--font-sans)',zIndex:'var(--z-overlay, 40)',...style}}>
    <style>{'@keyframes tdk-dialog-in{from{opacity:0;transform:scale(.94) translateY(8px)}to{opacity:1;transform:none}}.tdk-dialog[open]{animation:tdk-dialog-in var(--dur-slow) var(--ease-spring)}.tdk-dialog::backdrop{background:rgba(34,34,34,.33);backdrop-filter:blur(3px)}'}</style>
    <div style={{display:'grid',gridTemplateColumns:'1fr auto',alignItems:'center',gap:'var(--space-3)',padding:'var(--space-4) var(--space-5)',borderBottom:'1px solid var(--border)'}}>
      <div style={{fontWeight:'var(--weight-heading)',fontSize:'var(--text-lg)',letterSpacing:'var(--tracking-heading)'}}>{title}</div>
      <IconButton label="Close" size="sm" onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></IconButton>
    </div>
    <div style={{padding:'var(--space-5)'}}>{children}</div>
    {actions?<div style={{display:'flex',flexDirection:'row-reverse',gap:'var(--space-2)',padding:'var(--space-3) var(--space-5) var(--space-5)'}}>{actions}</div>
      :footer?<div style={{display:'flex',justifyContent:'flex-end',gap:'var(--space-2)',padding:'var(--space-3) var(--space-5) var(--space-5)'}}>{footer}</div>:null}
  </dialog>;
}