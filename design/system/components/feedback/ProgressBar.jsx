import React from 'react';
export function ProgressBar({value=0,max=100,label,showValue=false,tone='green',style}){
  const pct=Math.min(100,Math.max(0,(value/max)*100));
  const color=tone==='blue'?'var(--info)':'var(--accent)';
  return <div style={{fontFamily:'var(--font-sans)',color:'var(--fg)',...style}}>
    {(label||showValue)&&<div style={{display:'flex',justifyContent:'space-between',fontSize:'var(--text-sm)',fontWeight:'var(--weight-medium)',marginBottom:6}}>
      <span>{label}</span>{showValue&&<span style={{color:'var(--fg-muted)',fontFamily:'var(--font-mono)',fontSize:'var(--text-xs)'}}>{Math.round(pct)}%</span>}
    </div>}
    <div role="progressbar" aria-valuenow={value} aria-valuemax={max} style={{height:8,background:'var(--surface-sunken)',border:'1px solid var(--border)',borderRadius:'var(--radius-full)',overflow:'hidden'}}>
      <div style={{width:`${pct}%`,height:'100%',background:color,borderRadius:'var(--radius-full)',transition:'width var(--dur-slow) var(--ease-out)'}}></div>
    </div>
  </div>;
}