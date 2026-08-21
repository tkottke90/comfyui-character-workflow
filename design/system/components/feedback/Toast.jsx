import React from 'react';
const toneAccents={success:'var(--success)',info:'var(--info)',warning:'var(--warning)',danger:'var(--danger)'};
export function Toast({tone='success',title,message,onDismiss,style}){
  return <div role="status" style={{display:'flex',alignItems:'flex-start',gap:'var(--space-3)',background:'var(--surface-raised)',border:'1px solid var(--border)',borderLeft:`4px solid ${toneAccents[tone]}`,borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-toast)',padding:'var(--space-3) var(--space-4)',fontFamily:'var(--font-sans)',color:'var(--fg)',minWidth:260,maxWidth:380,animation:'tdk-toast-in var(--dur-slow) var(--ease-spring)',...style}}>
    <style>{'@keyframes tdk-toast-in{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}'}</style>
    <div style={{flex:1}}>
      <div style={{fontWeight:'var(--weight-bold)',fontSize:'var(--text-sm)'}}>{title}</div>
      {message&&<div style={{fontSize:'var(--text-sm)',color:'var(--fg-muted)',marginTop:2}}>{message}</div>}
    </div>
    {onDismiss&&<button onClick={onDismiss} aria-label="Dismiss" style={{border:'none',background:'none',cursor:'pointer',color:'var(--fg-subtle)',padding:2,lineHeight:1,fontSize:16}}>×</button>}
  </div>;
}
export function ToastStack({children,style}){
  return <div style={{position:'fixed',bottom:'var(--space-5)',right:'var(--space-5)',display:'flex',flexDirection:'column',gap:'var(--space-2)',zIndex:'var(--z-toast, 30)',...style}}>{children}</div>;
}