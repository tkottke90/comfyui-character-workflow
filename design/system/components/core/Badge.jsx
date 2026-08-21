import React from 'react';
const tones={
  neutral:{bg:'var(--surface-sunken)',fg:'var(--fg-muted)',bd:'var(--border)'},
  green:{bg:'var(--accent-soft-bg)',fg:'var(--accent-soft-fg)',bd:'var(--accent-soft-border)'},
  blue:{bg:'var(--info-soft-bg)',fg:'var(--info-soft-fg)',bd:'transparent'},
  success:{bg:'var(--success-soft-bg)',fg:'var(--success-soft-fg)',bd:'transparent'},
  warning:{bg:'var(--warning-soft-bg)',fg:'var(--warning-soft-fg)',bd:'var(--danger-soft-border)'},
  danger:{bg:'var(--danger-soft-bg)',fg:'var(--danger-soft-fg)',bd:'var(--danger-soft-border)'}
};
export function Badge({tone='neutral',children,style}){
  const t=tones[tone]||tones.neutral;
  return <span style={{display:'inline-flex',alignItems:'center',gap:'var(--space-1)',background:t.bg,color:t.fg,border:`1px solid ${t.bd}`,borderRadius:'var(--radius-full)',padding:'2px 10px',fontSize:'var(--text-xs)',fontWeight:'var(--weight-bold)',fontFamily:'var(--font-sans)',letterSpacing:'.02em',...style}}>{children}</span>;
}