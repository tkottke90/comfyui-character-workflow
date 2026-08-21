import React from 'react';
import { IconButton } from '../core/IconButton.jsx';
export function formatChatTime(t){
  if(t==null)return '';
  if(typeof t==='string'&&isNaN(Date.parse(t)))return t;
  const d=t instanceof Date?t:new Date(t);
  const now=new Date();
  if(d.toDateString()===now.toDateString()){
    const m=Math.max(0,Math.round((now-d)/60000));
    if(m<1)return 'just now';
    if(m<60)return `${m} min${m===1?'':'s'} ago`;
    const h=Math.round(m/60);
    return `${h} hr${h===1?'':'s'} ago`;
  }
  return d.toLocaleDateString()+' '+d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
}
function NsfwImage({src,alt,nsfw}){
  const [revealed,setRevealed]=React.useState(false);
  const blurred=nsfw&&!revealed;
  return <div style={{position:'relative',borderRadius:'var(--radius-md)',overflow:'hidden',maxWidth:280}}>
    <img src={src} alt={alt||''} style={{display:'block',width:'100%',filter:blurred?'blur(22px)':'none',transform:blurred?'scale(1.1)':'none',transition:'filter var(--dur-base) var(--ease-out)'}}/>
    {nsfw&&<button onClick={()=>setRevealed(r=>!r)} style={{position:'absolute',...(blurred?{inset:0}:{right:6,bottom:6}),display:'flex',alignItems:'center',justifyContent:'center',gap:6,border:'none',cursor:'pointer',fontFamily:'var(--font-sans)',fontWeight:700,fontSize:'var(--text-xs)',background:blurred?'rgba(29,38,52,.35)':'rgba(29,38,52,.65)',color:'#fff',padding:blurred?0:'4px 10px',borderRadius:blurred?0:'var(--radius-full)'}}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{blurred?<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>:<><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/></>}</svg>
      {blurred?'NSFW — show':'Hide'}
    </button>}
  </div>;
}
function FileChip({name,size,self}){
  return <div style={{display:'flex',alignItems:'center',gap:8,background:self?'rgba(255,255,255,.55)':'var(--surface-card)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',padding:'7px 10px',fontSize:'var(--text-sm)'}}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
    <span style={{fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</span>
    {size&&<span style={{color:'var(--fg-subtle)',fontSize:'var(--text-xs)',fontFamily:'var(--font-mono)',flexShrink:0}}>{size}</span>}
  </div>;
}
function AudioRow({name,duration,src,self}){
  const [playing,setPlaying]=React.useState(false);
  const ref=React.useRef(null);
  const toggle=()=>{if(!ref.current)return setPlaying(p=>!p);playing?ref.current.pause():ref.current.play();setPlaying(!playing)};
  return <div style={{display:'flex',alignItems:'center',gap:10,background:self?'rgba(255,255,255,.55)':'var(--surface-card)',border:'1px solid var(--border)',borderRadius:'var(--radius-full)',padding:'6px 12px 6px 6px',fontSize:'var(--text-sm)'}}>
    {src&&<audio ref={ref} src={src} onEnded={()=>setPlaying(false)} style={{display:'none'}}></audio>}
    <button onClick={toggle} aria-label={playing?'Pause':'Play'} style={{width:28,height:28,borderRadius:'50%',border:'none',cursor:'pointer',background:'var(--accent)',color:'var(--accent-fg)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
      {playing?<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>:<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4.5v15l13-7.5z"/></svg>}
    </button>
    <span style={{flex:1,display:'flex',alignItems:'center',gap:2,minWidth:60}} aria-hidden="true">{[5,9,13,8,11,6,10,14,9,6,12,8,5,9,7].map((h,i)=><span key={i} style={{width:2.5,height:h,borderRadius:2,background:'var(--fg-subtle)'}}></span>)}</span>
    {name&&<span style={{fontWeight:600,fontSize:'var(--text-xs)',color:'var(--fg-muted)'}}>{name}</span>}
    {duration&&<span style={{fontFamily:'var(--font-mono)',fontSize:'var(--text-xs)',color:'var(--fg-subtle)'}}>{duration}</span>}
  </div>;
}
export function ChatToolCall({name,input,result,status='done',duration,style}){
  const [open,setOpen]=React.useState(false);
  const running=status==='running',err=status==='error';
  return <div style={{background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',fontSize:'var(--text-sm)',overflow:'hidden',...style}}>
    <button onClick={()=>setOpen(o=>!o)} style={{display:'flex',alignItems:'center',gap:8,width:'100%',border:'none',background:'none',cursor:'pointer',font:'inherit',padding:'7px 10px',textAlign:'left',color:'var(--fg)'}}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={err?'var(--danger)':running?'var(--info)':'var(--success)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
      <span style={{fontFamily:'var(--font-mono)',fontWeight:600,fontSize:'var(--text-xs)'}}>{name}</span>
      <span style={{flex:1,color:'var(--fg-subtle)',fontFamily:'var(--font-mono)',fontSize:'var(--text-xs)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{input}</span>
      {running?<span style={{color:'var(--info)',fontSize:'var(--text-xs)',fontWeight:700,flexShrink:0}}>running…</span>
        :<span style={{color:err?'var(--danger)':'var(--fg-subtle)',fontFamily:'var(--font-mono)',fontSize:'var(--text-xs)',flexShrink:0}}>{err?'error':duration}</span>}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fg-subtle)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,transform:open?'rotate(180deg)':'none',transition:'transform var(--dur-fast) var(--ease-out)'}}><path d="m6 9 6 6 6-6"/></svg>
    </button>
    {open&&result&&<div style={{borderTop:'1px solid var(--border)',padding:'7px 10px',fontFamily:'var(--font-mono)',fontSize:'var(--text-xs)',color:'var(--fg-muted)',background:'var(--surface-sunken)',whiteSpace:'pre-wrap'}}>{result}</div>}
  </div>;
}
export function ChatBubble({from='other',author,time,timestamp,actions,metrics,images,audio,file,files,children,style}){
  const self=from==='self',ai=from==='ai';
  const fileList=files||(file?[file]:null);
  const when=formatChatTime(timestamp!=null?timestamp:time);
  const bg=self?'var(--chat-bubble-self-bg)':'var(--chat-bubble-other-bg)';
  const fg=self?'var(--chat-bubble-self-fg)':'var(--chat-bubble-other-fg)';
  return <div style={{display:'flex',flexDirection:'column',alignItems:self?'flex-end':'flex-start',fontFamily:'var(--font-sans)',...style}}>
    <div style={{maxWidth:'75%',minWidth:180,display:'grid',gridTemplateColumns:'auto 1fr auto',gap:'3px 8px'}}>
      <div style={{gridColumn:self?'1':'3',gridRow:1,display:'flex',gap:6,alignItems:'baseline'}}>
        {author&&<span style={{fontSize:'var(--text-xs)',fontWeight:'var(--weight-bold)',color:'var(--fg-muted)'}}>{author}</span>}
        {when&&<span style={{fontSize:'var(--text-xs)',color:'var(--fg-subtle)'}}>{when}</span>}
      </div>
      <div style={{gridColumn:'1 / -1',gridRow:2,background:bg,color:fg,borderRadius:self?'14px 14px 4px 14px':'14px 14px 14px 4px',padding:'10px 14px',fontSize:'var(--text-base)',lineHeight:'var(--leading-snug)',display:'flex',flexDirection:'column',gap:8}}>
        {fileList&&<div style={{display:'flex',flexDirection:'column',gap:6}}>{fileList.map((f,i)=><FileChip key={i} {...f} self={self}/>)}</div>}
        {children&&<div>{children}</div>}
        {images&&images.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:8}}>{images.map((im,i)=><NsfwImage key={i} {...im}/>)}</div>}
        {audio&&<AudioRow {...audio} self={self}/>}
      </div>
      {ai&&metrics&&<div style={{gridColumn:'1',gridRow:3,display:'flex',gap:10,alignItems:'center',fontFamily:'var(--font-mono)',fontSize:'var(--text-xs)',color:'var(--fg-subtle)',padding:'2px 4px'}}>
        {metrics.time&&<span>{metrics.time}</span>}{metrics.tps&&<span>{metrics.tps}</span>}{metrics.cost&&<span>{metrics.cost}</span>}
      </div>}
      {actions&&<div style={{gridColumn:'3',gridRow:3,display:'flex',gap:2,justifyContent:'flex-end'}}>{actions}</div>}
    </div>
  </div>;
}
const DEFAULT_PROVIDERS={OpenAI:['gpt-5.2','gpt-5.2-mini','o4'],Anthropic:['claude-opus-4.5','claude-sonnet-4.5','claude-haiku-4.5']};
function AttachmentPreview({att,onRemove}){
  const [hov,setHov]=React.useState(false);
  return <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{position:'relative',flexShrink:0}}>
    {att.kind==='image'&&att.src?<img src={att.src} alt={att.name||''} style={{display:'block',width:56,height:56,objectFit:'cover',borderRadius:'var(--radius-md)',border:'1px solid var(--border)'}}/>
      :<div style={{display:'flex',alignItems:'center',gap:8,background:'var(--surface-sunken)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',padding:'8px 12px',maxWidth:200}}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
        <span style={{fontSize:'var(--text-xs)',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.name}</span>
        {att.size&&<span style={{fontSize:'var(--text-xs)',fontFamily:'var(--font-mono)',color:'var(--fg-subtle)',flexShrink:0}}>{att.size}</span>}
      </div>}
    {hov&&<button onClick={onRemove} aria-label={`Remove ${att.name||'attachment'}`} style={{position:'absolute',top:-7,right:-7,width:20,height:20,borderRadius:'50%',border:'2px solid var(--surface-card)',background:'var(--fg)',color:'var(--surface-card)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>}
  </div>;
}
const menuItemStyle={display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,width:'100%',border:'none',background:'none',cursor:'pointer',font:'inherit',fontSize:'var(--text-sm)',fontWeight:600,color:'var(--fg)',padding:'8px 12px',textAlign:'left',borderRadius:'var(--radius-sm)'};
function Menu({children,style}){
  return <div style={{minWidth:170,background:'var(--surface-raised)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-overlay)',padding:4,zIndex:40,animation:'tdk-menu-in var(--dur-base) var(--ease-spring)',...style}}>
    <style>{'@keyframes tdk-menu-in{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}'}</style>{children}</div>;
}
export function ChatComposer({value,onChange,onSend,placeholder='Write a message…',disabled=false,attachments,onAttachmentsChange,model,onModelChange,providers=DEFAULT_PROVIDERS,style}){
  const [focus,setFocus]=React.useState(false);
  const [menu,setMenu]=React.useState(false);
  const [subProvider,setSubProvider]=React.useState(null); // provider name whose models flyout is open
  const [provOpen,setProvOpen]=React.useState(false);
  const [hovItem,setHovItem]=React.useState(null);
  const [selfAtts,setSelfAtts]=React.useState([]);
  const [selfModel,setSelfModel]=React.useState('claude-sonnet-4.5');
  const atts=attachments!=null?attachments:selfAtts;
  const setAtts=a=>{onAttachmentsChange?onAttachmentsChange(a):setSelfAtts(a)};
  const mdl=model!=null?model:selfModel;
  const setMdl=m=>{onModelChange?onModelChange(m):setSelfModel(m)};
  const fileRef=React.useRef(null);
  const rootRef=React.useRef(null);
  React.useEffect(()=>{
    if(!menu)return;
    const close=e=>{if(rootRef.current&&!rootRef.current.contains(e.target)){setMenu(false);setProvOpen(false);setSubProvider(null)}};
    document.addEventListener('mousedown',close);
    return()=>document.removeEventListener('mousedown',close);
  },[menu]);
  const send=()=>{if(disabled)return;const t=(value||'').trim();if(!t&&atts.length===0)return;onSend&&onSend(t,atts);setAtts([])};
  const addFiles=list=>{
    const next=[...atts];
    for(const f of list)next.push({kind:f.type&&f.type.startsWith('image/')?'image':'file',name:f.name,size:f.size>1048576?(f.size/1048576).toFixed(1)+' MB':Math.max(1,Math.round(f.size/1024))+' KB',src:f.type&&f.type.startsWith('image/')?URL.createObjectURL(f):undefined});
    setAtts(next);
  };
  const closeAll=()=>{setMenu(false);setProvOpen(false);setSubProvider(null)};
  const chevR=<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fg-subtle)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>;
  const item=(key,label,extra,onClick)=><button key={key} style={{...menuItemStyle,background:hovItem===key?'var(--surface-sunken)':'none'}} onMouseEnter={()=>setHovItem(key)} onMouseLeave={()=>setHovItem(null)} onClick={onClick}><span>{label}</span>{extra}</button>;
  return <div ref={rootRef} style={{position:'relative',display:'flex',flexDirection:'column',gap:'var(--space-2)',padding:'var(--space-3)',background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-card)',...(focus?{borderColor:'var(--focus-ring)'}:null),fontFamily:'var(--font-sans)',...style}}>
    <input ref={fileRef} type="file" multiple style={{display:'none'}} onChange={e=>{addFiles(e.target.files);e.target.value=''}}/>
    {atts.length>0&&<div style={{display:'flex',gap:10,flexWrap:'wrap',paddingTop:4}}>
      {atts.map((a,i)=><AttachmentPreview key={i} att={a} onRemove={()=>setAtts(atts.filter((_,j)=>j!==i))}/>)}
    </div>}
    <textarea rows={1} value={value} placeholder={placeholder} disabled={disabled}
      onChange={e=>onChange&&onChange(e.target.value)}
      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
      onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
      style={{border:'none',outline:'none',resize:'none',font:'inherit',fontSize:'var(--text-base)',background:'transparent',color:'var(--fg)',lineHeight:'var(--leading-snug)',padding:'2px 4px',width:'100%'}}/>
    <div style={{display:'flex',alignItems:'center',gap:'var(--space-2)'}}>
      <div style={{position:'relative'}}>
        <button aria-label="Add" aria-expanded={menu} onClick={()=>{menu?closeAll():setMenu(true)}} style={{width:30,height:30,borderRadius:'50%',border:'1px solid var(--border-strong)',background:menu?'var(--surface-sunken)':'var(--surface-card)',color:'var(--fg-muted)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'transform var(--dur-fast) var(--ease-spring)',transform:menu?'rotate(45deg)':'none'}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        {menu&&<div style={{position:'absolute',bottom:'calc(100% + 6px)',left:0,zIndex:40}}>
          <Menu>
            {item('add','Add a file',null,()=>{closeAll();fileRef.current&&fileRef.current.click()})}
            <div style={{position:'relative'}}>
              {item('prov','Provider',chevR,()=>{setProvOpen(o=>!o);setSubProvider(null)})}
              {provOpen&&<div style={{position:'absolute',left:'calc(100% + 6px)',bottom:0,zIndex:41}}>
                <Menu>
                  {Object.keys(providers).map(p=><div key={p} style={{position:'relative'}}>
                    {item(p,p,chevR,()=>setSubProvider(s=>s===p?null:p))}
                    {subProvider===p&&<div style={{position:'absolute',left:'calc(100% + 6px)',bottom:0,zIndex:42}}>
                      <Menu>
                        {(providers[p]||[]).map(m=>item(m,<span style={{fontFamily:'var(--font-mono)',fontSize:'var(--text-xs)'}}>{m}</span>,mdl===m&&<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>,()=>{setMdl(m);closeAll()}))}
                      </Menu>
                    </div>}
                  </div>)}
                </Menu>
              </div>}
            </div>
          </Menu>
        </div>}
      </div>
      <span style={{display:'inline-flex',alignItems:'center',gap:6,background:'var(--surface-sunken)',border:'1px solid var(--border)',borderRadius:'var(--radius-full)',padding:'3px 11px',fontFamily:'var(--font-mono)',fontSize:'var(--text-xs)',color:'var(--fg-muted)',whiteSpace:'nowrap'}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:'var(--accent)'}}></span>{mdl}</span>
      <div style={{flex:1}}></div>
      <button onClick={send} disabled={disabled||((!value||!value.trim())&&atts.length===0)} aria-label="Send"
        style={{width:36,height:36,borderRadius:'var(--radius-md)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
        background:(value&&value.trim())||atts.length?'var(--accent)':'var(--surface-sunken)',color:(value&&value.trim())||atts.length?'var(--accent-fg)':'var(--fg-subtle)',transition:'background var(--dur-fast) var(--ease-out)'}}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
      </button>
    </div>
  </div>;
}