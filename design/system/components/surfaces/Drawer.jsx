import React from 'react';
import { IconButton } from '../core/IconButton.jsx';
export function Drawer({open,side='right',title,onClose,actions,children,width=360,style}){
  const ref=React.useRef(null);
  const [closing,setClosing]=React.useState(false);
  React.useEffect(()=>{
    const d=ref.current;if(!d)return;
    if(open){setClosing(false);if(!d.open)d.showModal();}
    else if(d.open){
      setClosing(true);
      const t=setTimeout(()=>{d.open&&d.close();setClosing(false)},320);
      return()=>clearTimeout(t);
    }
  },[open]);
  const requestClose=()=>{onClose&&onClose()};
  return <dialog ref={ref} className={'tdk-drawer tdk-drawer-'+side+(closing?' tdk-drawer-closing':'')}
    onCancel={e=>{e.preventDefault();requestClose()}}
    onClick={e=>{if(e.target===ref.current)requestClose()}}
    style={{background:'var(--surface-raised)',color:'var(--fg)',border:'none',borderRadius:0,boxShadow:'var(--shadow-overlay)',width:'calc(100% - 48px)',maxWidth:width,height:'100%',maxHeight:'100%',margin:0,padding:0,position:'fixed',top:0,[side]:0,[side==='right'?'left':'right']:'auto',fontFamily:'var(--font-sans)',zIndex:'var(--z-overlay, 40)',...style}}>
    <style>{'@keyframes tdk-drawer-in-right{from{transform:translateX(100%)}to{transform:none}}@keyframes tdk-drawer-in-left{from{transform:translateX(-100%)}to{transform:none}}@keyframes tdk-drawer-out-right{from{transform:none}to{transform:translateX(100%)}}@keyframes tdk-drawer-out-left{from{transform:none}to{transform:translateX(-100%)}}@keyframes tdk-backdrop-out{from{opacity:1}to{opacity:0}}.tdk-drawer[open]{display:flex;flex-direction:column;animation:tdk-drawer-in-right var(--dur-slow) var(--ease-out)}.tdk-drawer-left[open]{animation-name:tdk-drawer-in-left}.tdk-drawer-closing[open]{animation:tdk-drawer-out-right var(--dur-slow) var(--ease-out) forwards}.tdk-drawer-left.tdk-drawer-closing[open]{animation-name:tdk-drawer-out-left}.tdk-drawer::backdrop{background:rgba(34,34,34,.33);backdrop-filter:blur(3px)}.tdk-drawer-closing::backdrop{animation:tdk-backdrop-out var(--dur-slow) var(--ease-out) forwards}'}</style>
    <div style={{display:'grid',gridTemplateColumns:'1fr auto',alignItems:'center',gap:'var(--space-3)',padding:'var(--space-4) var(--space-5)',borderBottom:'1px solid var(--border)',flexShrink:0}}>
      <div style={{fontWeight:'var(--weight-heading)',fontSize:'var(--text-lg)',letterSpacing:'var(--tracking-heading)'}}>{title}</div>
      <IconButton label="Close" size="sm" onClick={requestClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></IconButton>
    </div>
    <div style={{padding:'var(--space-5)',overflowY:'auto',flex:1}}>{children}</div>
    {actions?<div style={{display:'flex',flexDirection:'row-reverse',gap:'var(--space-2)',padding:'var(--space-4) var(--space-5)',borderTop:'1px solid var(--border)',flexShrink:0}}>{actions}</div>:null}
  </dialog>;
}
