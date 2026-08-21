import React from 'react';
export function Card({title,actions,image,imageAlt='',imageHeight=160,padded=true,raised=false,children,style}){
  return <div style={{background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',boxShadow:raised?'var(--shadow-raised)':'var(--shadow-card)',fontFamily:'var(--font-sans)',color:'var(--fg)',overflow:'hidden',...style}}>
    {image&&<img src={image} alt={imageAlt} style={{display:'block',width:'100%',height:imageHeight,objectFit:'cover',borderBottom:'1px solid var(--border)'}}/>}
    {(title||actions)&&<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'var(--space-3)',padding:'var(--space-4) var(--space-5)',borderBottom:'1px solid var(--border)'}}>
      <div style={{fontWeight:'var(--weight-heading)',fontSize:'var(--text-md)',letterSpacing:'var(--tracking-heading)'}}>{title}</div>
      {actions&&<div style={{display:'flex',gap:'var(--space-2)'}}>{actions}</div>}
    </div>}
    <div style={padded?{padding:'var(--space-5)'}:null}>{children}</div>
  </div>;
}