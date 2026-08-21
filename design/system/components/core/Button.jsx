import React from 'react';
const TONES={
  primary:{main:'var(--accent)',hoverMain:'var(--accent-hover)',onMain:'var(--accent-fg)',text:'var(--accent-soft-fg)',softBg:'var(--accent-soft-bg)',border:'var(--accent-soft-border)'},
  secondary:{main:'var(--color-steel-blue-600)',hoverMain:'var(--color-steel-blue-700)',onMain:'#ffffff',text:'var(--secondary-action-fg)',softBg:'var(--info-soft-bg)',border:'var(--secondary-action-fg)'},
  warning:{main:'var(--danger)',hoverMain:'var(--danger-hover)',onMain:'var(--danger-fg)',text:'var(--danger-soft-fg)',softBg:'var(--danger-soft-bg)',border:'var(--danger-soft-border)'}
};
const LEGACY={primary:['raised','primary'],secondary:['outlined','primary'],ghost:['text','secondary'],danger:['raised','warning']};
const SIZES={sm:{fontSize:'var(--text-sm)',padding:'6px 12px'},md:{fontSize:'var(--text-base)',padding:'9px 18px'},lg:{fontSize:'var(--text-md)',padding:'12px 24px'}};
const adjustPad=p=>p.split(' ').map(v=>Math.max(0,parseInt(v)-1)+'px').join(' ');
export function Button({variant='raised',tone='primary',size='md',disabled=false,fullWidth=false,children,onClick,type='button',style}){
  const [hov,setHov]=React.useState(false),[act,setAct]=React.useState(false);
  let v=variant,t=tone;
  if(LEGACY[variant]){[v,t]=LEGACY[variant]}
  const c=TONES[t]||TONES.primary;
  const variants={
    raised:{background:hov?c.hoverMain:c.main,color:c.onMain,boxShadow:act?'var(--shadow-card)':'var(--shadow-raised)'},
    outlined:{background:hov?c.softBg:'transparent',color:c.text,borderColor:c.border,borderWidth:2,padding:SIZES[size]?adjustPad(SIZES[size].padding):undefined},
    text:{background:hov?c.softBg:'transparent',color:c.text}
  };
  const st={fontFamily:'var(--font-sans)',fontWeight:'var(--weight-bold)',border:'1px solid transparent',borderRadius:'var(--radius-md)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:'var(--space-2)',transition:'background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-spring), box-shadow var(--dur-fast) var(--ease-out)',textDecoration:'none',whiteSpace:'nowrap',
    ...SIZES[size],...(variants[v]||variants.raised),
    ...(act&&!disabled?{transform:'scale(.97)'}:null),
    ...(disabled?{opacity:.5,cursor:'not-allowed'}:null),
    ...(fullWidth?{width:'100%'}:null),...style};
  return <button type={type} disabled={disabled} onClick={onClick} style={st}
    onMouseEnter={()=>setHov(true)} onMouseLeave={()=>{setHov(false);setAct(false)}}
    onMouseDown={()=>setAct(true)} onMouseUp={()=>setAct(false)}>{children}</button>;
}