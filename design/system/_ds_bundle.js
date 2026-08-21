/* @ds-bundle: {"format":4,"namespace":"TDKDesignSystem_abba7a","components":[{"name":"ChatToolCall","sourcePath":"components/chat/ChatBubble.jsx"},{"name":"ChatBubble","sourcePath":"components/chat/ChatBubble.jsx"},{"name":"ChatComposer","sourcePath":"components/chat/ChatBubble.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"ProgressBar","sourcePath":"components/feedback/ProgressBar.jsx"},{"name":"Stepper","sourcePath":"components/feedback/Stepper.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"ToastStack","sourcePath":"components/feedback/Toast.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Radio","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Breadcrumbs","sourcePath":"components/navigation/Breadcrumbs.jsx"},{"name":"SidebarNav","sourcePath":"components/navigation/SidebarNav.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"Card","sourcePath":"components/surfaces/Card.jsx"},{"name":"Dialog","sourcePath":"components/surfaces/Dialog.jsx"},{"name":"Drawer","sourcePath":"components/surfaces/Drawer.jsx"}],"sourceHashes":{"components/chat/ChatBubble.jsx":"aad4114c9d52","components/core/Badge.jsx":"231142dc02a1","components/core/Button.jsx":"16776a48ea42","components/core/IconButton.jsx":"2dcb83c5dcb0","components/feedback/ProgressBar.jsx":"b3a91312e4df","components/feedback/Stepper.jsx":"bd891d522afc","components/feedback/Toast.jsx":"05beb6a2250c","components/forms/Checkbox.jsx":"728cd76e324d","components/forms/Field.jsx":"ec188e513f13","components/forms/Input.jsx":"88a9c65594ad","components/forms/Select.jsx":"fff2dd429b8a","components/forms/Switch.jsx":"0626ae6e6bcc","components/forms/Textarea.jsx":"97b79245362f","components/navigation/Breadcrumbs.jsx":"c3546519fb37","components/navigation/SidebarNav.jsx":"e2c51b1a69f5","components/navigation/Tabs.jsx":"32f2ca93f3a1","components/surfaces/Card.jsx":"7b64b4ffaf63","components/surfaces/Dialog.jsx":"432e3f4ffa83","components/surfaces/Drawer.jsx":"49a024887be7"},"inlinedExternals":[],"unexposedExports":[{"name":"formatChatTime","sourcePath":"components/chat/ChatBubble.jsx"},{"name":"inputBaseStyle","sourcePath":"components/forms/Input.jsx"}]} */

(() => {

const __ds_ns = (window.TDKDesignSystem_abba7a = window.TDKDesignSystem_abba7a || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
const tones = {
  neutral: {
    bg: 'var(--surface-sunken)',
    fg: 'var(--fg-muted)',
    bd: 'var(--border)'
  },
  green: {
    bg: 'var(--accent-soft-bg)',
    fg: 'var(--accent-soft-fg)',
    bd: 'var(--accent-soft-border)'
  },
  blue: {
    bg: 'var(--info-soft-bg)',
    fg: 'var(--info-soft-fg)',
    bd: 'transparent'
  },
  success: {
    bg: 'var(--success-soft-bg)',
    fg: 'var(--success-soft-fg)',
    bd: 'transparent'
  },
  warning: {
    bg: 'var(--warning-soft-bg)',
    fg: 'var(--warning-soft-fg)',
    bd: 'var(--danger-soft-border)'
  },
  danger: {
    bg: 'var(--danger-soft-bg)',
    fg: 'var(--danger-soft-fg)',
    bd: 'var(--danger-soft-border)'
  }
};
function Badge({
  tone = 'neutral',
  children,
  style
}) {
  const t = tones[tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-1)',
      background: t.bg,
      color: t.fg,
      border: `1px solid ${t.bd}`,
      borderRadius: 'var(--radius-full)',
      padding: '2px 10px',
      fontSize: 'var(--text-xs)',
      fontWeight: 'var(--weight-bold)',
      fontFamily: 'var(--font-sans)',
      letterSpacing: '.02em',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
const TONES = {
  primary: {
    main: 'var(--accent)',
    hoverMain: 'var(--accent-hover)',
    onMain: 'var(--accent-fg)',
    text: 'var(--accent-soft-fg)',
    softBg: 'var(--accent-soft-bg)',
    border: 'var(--accent-soft-border)'
  },
  secondary: {
    main: 'var(--color-steel-blue-600)',
    hoverMain: 'var(--color-steel-blue-700)',
    onMain: '#ffffff',
    text: 'var(--secondary-action-fg)',
    softBg: 'var(--info-soft-bg)',
    border: 'var(--secondary-action-fg)'
  },
  warning: {
    main: 'var(--danger)',
    hoverMain: 'var(--danger-hover)',
    onMain: 'var(--danger-fg)',
    text: 'var(--danger-soft-fg)',
    softBg: 'var(--danger-soft-bg)',
    border: 'var(--danger-soft-border)'
  }
};
const LEGACY = {
  primary: ['raised', 'primary'],
  secondary: ['outlined', 'primary'],
  ghost: ['text', 'secondary'],
  danger: ['raised', 'warning']
};
const SIZES = {
  sm: {
    fontSize: 'var(--text-sm)',
    padding: '6px 12px'
  },
  md: {
    fontSize: 'var(--text-base)',
    padding: '9px 18px'
  },
  lg: {
    fontSize: 'var(--text-md)',
    padding: '12px 24px'
  }
};
const adjustPad = p => p.split(' ').map(v => Math.max(0, parseInt(v) - 1) + 'px').join(' ');
function Button({
  variant = 'raised',
  tone = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  children,
  onClick,
  type = 'button',
  style
}) {
  const [hov, setHov] = React.useState(false),
    [act, setAct] = React.useState(false);
  let v = variant,
    t = tone;
  if (LEGACY[variant]) {
    [v, t] = LEGACY[variant];
  }
  const c = TONES[t] || TONES.primary;
  const variants = {
    raised: {
      background: hov ? c.hoverMain : c.main,
      color: c.onMain,
      boxShadow: act ? 'var(--shadow-card)' : 'var(--shadow-raised)'
    },
    outlined: {
      background: hov ? c.softBg : 'transparent',
      color: c.text,
      borderColor: c.border,
      borderWidth: 2,
      padding: SIZES[size] ? adjustPad(SIZES[size].padding) : undefined
    },
    text: {
      background: hov ? c.softBg : 'transparent',
      color: c.text
    }
  };
  const st = {
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--weight-bold)',
    border: '1px solid transparent',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    transition: 'background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-spring), box-shadow var(--dur-fast) var(--ease-out)',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    ...SIZES[size],
    ...(variants[v] || variants.raised),
    ...(act && !disabled ? {
      transform: 'scale(.97)'
    } : null),
    ...(disabled ? {
      opacity: .5,
      cursor: 'not-allowed'
    } : null),
    ...(fullWidth ? {
      width: '100%'
    } : null),
    ...style
  };
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    disabled: disabled,
    onClick: onClick,
    style: st,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => {
      setHov(false);
      setAct(false);
    },
    onMouseDown: () => setAct(true),
    onMouseUp: () => setAct(false)
  }, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function IconButton({
  label,
  size = 'md',
  variant = 'ghost',
  disabled = false,
  onClick,
  children,
  style
}) {
  const dim = {
    sm: 28,
    md: 36,
    lg: 44
  }[size];
  const [hov, setHov] = React.useState(false),
    [act, setAct] = React.useState(false);
  const variants = {
    ghost: {
      background: hov ? 'var(--surface-sunken)' : 'transparent',
      color: 'var(--fg-muted)'
    },
    primary: {
      background: hov ? 'var(--accent-hover)' : 'var(--accent)',
      color: 'var(--accent-fg)'
    },
    outline: {
      background: hov ? 'var(--surface-sunken)' : 'var(--surface-card)',
      color: 'var(--fg-muted)',
      border: '1px solid var(--border)'
    }
  };
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": label,
    title: label,
    disabled: disabled,
    onClick: onClick,
    style: {
      width: dim,
      height: dim,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '1px solid transparent',
      borderRadius: 'var(--radius-md)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      transition: 'background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-spring)',
      transform: act && !disabled ? 'scale(.94)' : 'none',
      ...variants[variant],
      ...style
    },
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => {
      setHov(false);
      setAct(false);
    },
    onMouseDown: () => setAct(true),
    onMouseUp: () => setAct(false)
  }, children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/chat/ChatBubble.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function formatChatTime(t) {
  if (t == null) return '';
  if (typeof t === 'string' && isNaN(Date.parse(t))) return t;
  const d = t instanceof Date ? t : new Date(t);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    const m = Math.max(0, Math.round((now - d) / 60000));
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`;
    const h = Math.round(m / 60);
    return `${h} hr${h === 1 ? '' : 's'} ago`;
  }
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
}
function NsfwImage({
  src,
  alt,
  nsfw
}) {
  const [revealed, setRevealed] = React.useState(false);
  const blurred = nsfw && !revealed;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      maxWidth: 280
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: alt || '',
    style: {
      display: 'block',
      width: '100%',
      filter: blurred ? 'blur(22px)' : 'none',
      transform: blurred ? 'scale(1.1)' : 'none',
      transition: 'filter var(--dur-base) var(--ease-out)'
    }
  }), nsfw && /*#__PURE__*/React.createElement("button", {
    onClick: () => setRevealed(r => !r),
    style: {
      position: 'absolute',
      ...(blurred ? {
        inset: 0
      } : {
        right: 6,
        bottom: 6
      }),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      border: 'none',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      fontSize: 'var(--text-xs)',
      background: blurred ? 'rgba(29,38,52,.35)' : 'rgba(29,38,52,.65)',
      color: '#fff',
      padding: blurred ? 0 : '4px 10px',
      borderRadius: blurred ? 0 : 'var(--radius-full)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, blurred ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  })) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M9.88 9.88a3 3 0 1 0 4.24 4.24"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.73 5.08A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m2 2 20 20"
  }))), blurred ? 'NSFW — show' : 'Hide'));
}
function FileChip({
  name,
  size,
  self
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: self ? 'rgba(255,255,255,.55)' : 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '7px 10px',
      fontSize: 'var(--text-sm)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--fg-muted)",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 2v4a2 2 0 0 0 2 2h4"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, name), size && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--fg-subtle)',
      fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-mono)',
      flexShrink: 0
    }
  }, size));
}
function AudioRow({
  name,
  duration,
  src,
  self
}) {
  const [playing, setPlaying] = React.useState(false);
  const ref = React.useRef(null);
  const toggle = () => {
    if (!ref.current) return setPlaying(p => !p);
    playing ? ref.current.pause() : ref.current.play();
    setPlaying(!playing);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: self ? 'rgba(255,255,255,.55)' : 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-full)',
      padding: '6px 12px 6px 6px',
      fontSize: 'var(--text-sm)'
    }
  }, src && /*#__PURE__*/React.createElement("audio", {
    ref: ref,
    src: src,
    onEnded: () => setPlaying(false),
    style: {
      display: 'none'
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: toggle,
    "aria-label": playing ? 'Pause' : 'Play',
    style: {
      width: 28,
      height: 28,
      borderRadius: '50%',
      border: 'none',
      cursor: 'pointer',
      background: 'var(--accent)',
      color: 'var(--accent-fg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, playing ? /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "6",
    y: "4",
    width: "4",
    height: "16",
    rx: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "4",
    width: "4",
    height: "16",
    rx: "1"
  })) : /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 4.5v15l13-7.5z"
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      minWidth: 60
    },
    "aria-hidden": "true"
  }, [5, 9, 13, 8, 11, 6, 10, 14, 9, 6, 12, 8, 5, 9, 7].map((h, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      width: 2.5,
      height: h,
      borderRadius: 2,
      background: 'var(--fg-subtle)'
    }
  }))), name && /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      fontSize: 'var(--text-xs)',
      color: 'var(--fg-muted)'
    }
  }, name), duration && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      color: 'var(--fg-subtle)'
    }
  }, duration));
}
function ChatToolCall({
  name,
  input,
  result,
  status = 'done',
  duration,
  style
}) {
  const [open, setOpen] = React.useState(false);
  const running = status === 'running',
    err = status === 'error';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      fontSize: 'var(--text-sm)',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(o => !o),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      font: 'inherit',
      padding: '7px 10px',
      textAlign: 'left',
      color: 'var(--fg)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: err ? 'var(--danger)' : running ? 'var(--info)' : 'var(--success)',
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontWeight: 600,
      fontSize: 'var(--text-xs)'
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      color: 'var(--fg-subtle)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, input), running ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--info)',
      fontSize: 'var(--text-xs)',
      fontWeight: 700,
      flexShrink: 0
    }
  }, "running\u2026") : /*#__PURE__*/React.createElement("span", {
    style: {
      color: err ? 'var(--danger)' : 'var(--fg-subtle)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      flexShrink: 0
    }
  }, err ? 'error' : duration), /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--fg-subtle)",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flexShrink: 0,
      transform: open ? 'rotate(180deg)' : 'none',
      transition: 'transform var(--dur-fast) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "m6 9 6 6 6-6"
  }))), open && result && /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid var(--border)',
      padding: '7px 10px',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      color: 'var(--fg-muted)',
      background: 'var(--surface-sunken)',
      whiteSpace: 'pre-wrap'
    }
  }, result));
}
function ChatBubble({
  from = 'other',
  author,
  time,
  timestamp,
  actions,
  metrics,
  images,
  audio,
  file,
  files,
  children,
  style
}) {
  const self = from === 'self',
    ai = from === 'ai';
  const fileList = files || (file ? [file] : null);
  const when = formatChatTime(timestamp != null ? timestamp : time);
  const bg = self ? 'var(--chat-bubble-self-bg)' : 'var(--chat-bubble-other-bg)';
  const fg = self ? 'var(--chat-bubble-self-fg)' : 'var(--chat-bubble-other-fg)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: self ? 'flex-end' : 'flex-start',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '75%',
      minWidth: 180,
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: '3px 8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: self ? '1' : '3',
      gridRow: 1,
      display: 'flex',
      gap: 6,
      alignItems: 'baseline'
    }
  }, author && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      fontWeight: 'var(--weight-bold)',
      color: 'var(--fg-muted)'
    }
  }, author), when && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--fg-subtle)'
    }
  }, when)), /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: '1 / -1',
      gridRow: 2,
      background: bg,
      color: fg,
      borderRadius: self ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
      padding: '10px 14px',
      fontSize: 'var(--text-base)',
      lineHeight: 'var(--leading-snug)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, fileList && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, fileList.map((f, i) => /*#__PURE__*/React.createElement(FileChip, _extends({
    key: i
  }, f, {
    self: self
  })))), children && /*#__PURE__*/React.createElement("div", null, children), images && images.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8
    }
  }, images.map((im, i) => /*#__PURE__*/React.createElement(NsfwImage, _extends({
    key: i
  }, im)))), audio && /*#__PURE__*/React.createElement(AudioRow, _extends({}, audio, {
    self: self
  }))), ai && metrics && /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: '1',
      gridRow: 3,
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      color: 'var(--fg-subtle)',
      padding: '2px 4px'
    }
  }, metrics.time && /*#__PURE__*/React.createElement("span", null, metrics.time), metrics.tps && /*#__PURE__*/React.createElement("span", null, metrics.tps), metrics.cost && /*#__PURE__*/React.createElement("span", null, metrics.cost)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: '3',
      gridRow: 3,
      display: 'flex',
      gap: 2,
      justifyContent: 'flex-end'
    }
  }, actions)));
}
const DEFAULT_PROVIDERS = {
  OpenAI: ['gpt-5.2', 'gpt-5.2-mini', 'o4'],
  Anthropic: ['claude-opus-4.5', 'claude-sonnet-4.5', 'claude-haiku-4.5']
};
function AttachmentPreview({
  att,
  onRemove
}) {
  const [hov, setHov] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
    style: {
      position: 'relative',
      flexShrink: 0
    }
  }, att.kind === 'image' && att.src ? /*#__PURE__*/React.createElement("img", {
    src: att.src,
    alt: att.name || '',
    style: {
      display: 'block',
      width: 56,
      height: 56,
      objectFit: 'cover',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)'
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'var(--surface-sunken)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '8px 12px',
      maxWidth: 200
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--fg-muted)",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 2v4a2 2 0 0 0 2 2h4"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      fontWeight: 600,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, att.name), att.size && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-mono)',
      color: 'var(--fg-subtle)',
      flexShrink: 0
    }
  }, att.size)), hov && /*#__PURE__*/React.createElement("button", {
    onClick: onRemove,
    "aria-label": `Remove ${att.name || 'attachment'}`,
    style: {
      position: 'absolute',
      top: -7,
      right: -7,
      width: 20,
      height: 20,
      borderRadius: '50%',
      border: '2px solid var(--surface-card)',
      background: 'var(--fg)',
      color: 'var(--surface-card)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "10",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "3",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  }))));
}
const menuItemStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  width: '100%',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  color: 'var(--fg)',
  padding: '8px 12px',
  textAlign: 'left',
  borderRadius: 'var(--radius-sm)'
};
function Menu({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 170,
      background: 'var(--surface-raised)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-overlay)',
      padding: 4,
      zIndex: 40,
      animation: 'tdk-menu-in var(--dur-base) var(--ease-spring)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("style", null, '@keyframes tdk-menu-in{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}'), children);
}
function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder = 'Write a message…',
  disabled = false,
  attachments,
  onAttachmentsChange,
  model,
  onModelChange,
  providers = DEFAULT_PROVIDERS,
  style
}) {
  const [focus, setFocus] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const [subProvider, setSubProvider] = React.useState(null); // provider name whose models flyout is open
  const [provOpen, setProvOpen] = React.useState(false);
  const [hovItem, setHovItem] = React.useState(null);
  const [selfAtts, setSelfAtts] = React.useState([]);
  const [selfModel, setSelfModel] = React.useState('claude-sonnet-4.5');
  const atts = attachments != null ? attachments : selfAtts;
  const setAtts = a => {
    onAttachmentsChange ? onAttachmentsChange(a) : setSelfAtts(a);
  };
  const mdl = model != null ? model : selfModel;
  const setMdl = m => {
    onModelChange ? onModelChange(m) : setSelfModel(m);
  };
  const fileRef = React.useRef(null);
  const rootRef = React.useRef(null);
  React.useEffect(() => {
    if (!menu) return;
    const close = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setMenu(false);
        setProvOpen(false);
        setSubProvider(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);
  const send = () => {
    if (disabled) return;
    const t = (value || '').trim();
    if (!t && atts.length === 0) return;
    onSend && onSend(t, atts);
    setAtts([]);
  };
  const addFiles = list => {
    const next = [...atts];
    for (const f of list) next.push({
      kind: f.type && f.type.startsWith('image/') ? 'image' : 'file',
      name: f.name,
      size: f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB',
      src: f.type && f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined
    });
    setAtts(next);
  };
  const closeAll = () => {
    setMenu(false);
    setProvOpen(false);
    setSubProvider(null);
  };
  const chevR = /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--fg-subtle)",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "m9 18 6-6-6-6"
  }));
  const item = (key, label, extra, onClick) => /*#__PURE__*/React.createElement("button", {
    key: key,
    style: {
      ...menuItemStyle,
      background: hovItem === key ? 'var(--surface-sunken)' : 'none'
    },
    onMouseEnter: () => setHovItem(key),
    onMouseLeave: () => setHovItem(null),
    onClick: onClick
  }, /*#__PURE__*/React.createElement("span", null, label), extra);
  return /*#__PURE__*/React.createElement("div", {
    ref: rootRef,
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)',
      padding: 'var(--space-3)',
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-card)',
      ...(focus ? {
        borderColor: 'var(--focus-ring)'
      } : null),
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    ref: fileRef,
    type: "file",
    multiple: true,
    style: {
      display: 'none'
    },
    onChange: e => {
      addFiles(e.target.files);
      e.target.value = '';
    }
  }), atts.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
      paddingTop: 4
    }
  }, atts.map((a, i) => /*#__PURE__*/React.createElement(AttachmentPreview, {
    key: i,
    att: a,
    onRemove: () => setAtts(atts.filter((_, j) => j !== i))
  }))), /*#__PURE__*/React.createElement("textarea", {
    rows: 1,
    value: value,
    placeholder: placeholder,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      border: 'none',
      outline: 'none',
      resize: 'none',
      font: 'inherit',
      fontSize: 'var(--text-base)',
      background: 'transparent',
      color: 'var(--fg)',
      lineHeight: 'var(--leading-snug)',
      padding: '2px 4px',
      width: '100%'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    "aria-label": "Add",
    "aria-expanded": menu,
    onClick: () => {
      menu ? closeAll() : setMenu(true);
    },
    style: {
      width: 30,
      height: 30,
      borderRadius: '50%',
      border: '1px solid var(--border-strong)',
      background: menu ? 'var(--surface-sunken)' : 'var(--surface-card)',
      color: 'var(--fg-muted)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'transform var(--dur-fast) var(--ease-spring)',
      transform: menu ? 'rotate(45deg)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14M5 12h14"
  }))), menu && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 'calc(100% + 6px)',
      left: 0,
      zIndex: 40
    }
  }, /*#__PURE__*/React.createElement(Menu, null, item('add', 'Add a file', null, () => {
    closeAll();
    fileRef.current && fileRef.current.click();
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, item('prov', 'Provider', chevR, () => {
    setProvOpen(o => !o);
    setSubProvider(null);
  }), provOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 'calc(100% + 6px)',
      bottom: 0,
      zIndex: 41
    }
  }, /*#__PURE__*/React.createElement(Menu, null, Object.keys(providers).map(p => /*#__PURE__*/React.createElement("div", {
    key: p,
    style: {
      position: 'relative'
    }
  }, item(p, p, chevR, () => setSubProvider(s => s === p ? null : p)), subProvider === p && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 'calc(100% + 6px)',
      bottom: 0,
      zIndex: 42
    }
  }, /*#__PURE__*/React.createElement(Menu, null, (providers[p] || []).map(m => item(m, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)'
    }
  }, m), mdl === m && /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--accent)",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  })), () => {
    setMdl(m);
    closeAll();
  })))))))))))), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: 'var(--surface-sunken)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-full)',
      padding: '3px 11px',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      color: 'var(--fg-muted)',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--accent)'
    }
  }), mdl), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: send,
    disabled: disabled || (!value || !value.trim()) && atts.length === 0,
    "aria-label": "Send",
    style: {
      width: 36,
      height: 36,
      borderRadius: 'var(--radius-md)',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      background: value && value.trim() || atts.length ? 'var(--accent)' : 'var(--surface-sunken)',
      color: value && value.trim() || atts.length ? 'var(--accent-fg)' : 'var(--fg-subtle)',
      transition: 'background var(--dur-fast) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "17",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "m22 2-7 20-4-9-9-4Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M22 2 11 13"
  })))));
}
Object.assign(__ds_scope, { formatChatTime, ChatToolCall, ChatBubble, ChatComposer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chat/ChatBubble.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ProgressBar.jsx
try { (() => {
function ProgressBar({
  value = 0,
  max = 100,
  label,
  showValue = false,
  tone = 'green',
  style
}) {
  const pct = Math.min(100, Math.max(0, value / max * 100));
  const color = tone === 'blue' ? 'var(--info)' : 'var(--accent)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      color: 'var(--fg)',
      ...style
    }
  }, (label || showValue) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 'var(--text-sm)',
      fontWeight: 'var(--weight-medium)',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", null, label), showValue && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--fg-muted)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)'
    }
  }, Math.round(pct), "%")), /*#__PURE__*/React.createElement("div", {
    role: "progressbar",
    "aria-valuenow": value,
    "aria-valuemax": max,
    style: {
      height: 8,
      background: 'var(--surface-sunken)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-full)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${pct}%`,
      height: '100%',
      background: color,
      borderRadius: 'var(--radius-full)',
      transition: 'width var(--dur-slow) var(--ease-out)'
    }
  })));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Stepper.jsx
try { (() => {
function Stepper({
  steps = [],
  current = 0,
  style
}) {
  return /*#__PURE__*/React.createElement("ol", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      listStyle: 'none',
      margin: 0,
      padding: 0,
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, steps.map((s, i) => {
    const done = i < current,
      active = i === current;
    return /*#__PURE__*/React.createElement("li", {
      key: i,
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        flex: i < steps.length - 1 ? 1 : '0 0 auto',
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        minWidth: 64
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 30,
        height: 30,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'var(--weight-bold)',
        fontSize: 'var(--text-sm)',
        flexShrink: 0,
        transition: 'all var(--dur-base) var(--ease-spring)',
        background: done ? 'var(--accent)' : active ? 'var(--surface-card)' : 'var(--surface-sunken)',
        color: done ? 'var(--accent-fg)' : active ? 'var(--accent)' : 'var(--fg-subtle)',
        border: `2px solid ${done || active ? 'var(--accent)' : 'var(--border-strong)'}`
      }
    }, done ? /*#__PURE__*/React.createElement("svg", {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "3",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M20 6 9 17l-5-5"
    })) : i + 1), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-xs)',
        fontWeight: active ? 'var(--weight-bold)' : 'var(--weight-medium)',
        color: active ? 'var(--fg)' : 'var(--fg-muted)',
        textAlign: 'center',
        maxWidth: 96
      }
    }, s)), i < steps.length - 1 && /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 2,
        background: done ? 'var(--accent)' : 'var(--border)',
        margin: '14px 4px 0',
        borderRadius: 1,
        transition: 'background var(--dur-base) var(--ease-out)'
      }
    }));
  }));
}
Object.assign(__ds_scope, { Stepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Stepper.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const toneAccents = {
  success: 'var(--success)',
  info: 'var(--info)',
  warning: 'var(--warning)',
  danger: 'var(--danger)'
};
function Toast({
  tone = 'success',
  title,
  message,
  onDismiss,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-3)',
      background: 'var(--surface-raised)',
      border: '1px solid var(--border)',
      borderLeft: `4px solid ${toneAccents[tone]}`,
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-toast)',
      padding: 'var(--space-3) var(--space-4)',
      fontFamily: 'var(--font-sans)',
      color: 'var(--fg)',
      minWidth: 260,
      maxWidth: 380,
      animation: 'tdk-toast-in var(--dur-slow) var(--ease-spring)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("style", null, '@keyframes tdk-toast-in{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}'), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-sm)'
    }
  }, title), message && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--fg-muted)',
      marginTop: 2
    }
  }, message)), onDismiss && /*#__PURE__*/React.createElement("button", {
    onClick: onDismiss,
    "aria-label": "Dismiss",
    style: {
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      color: 'var(--fg-subtle)',
      padding: 2,
      lineHeight: 1,
      fontSize: 16
    }
  }, "\xD7"));
}
function ToastStack({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 'var(--space-5)',
      right: 'var(--space-5)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)',
      zIndex: 'var(--z-toast, 30)',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Toast, ToastStack });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function Box({
  checked,
  radio = false
}) {
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 18,
      height: 18,
      flexShrink: 0,
      borderRadius: radio ? '50%' : 'var(--radius-sm)',
      border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border-strong)'}`,
      background: checked ? 'var(--accent)' : 'var(--surface-card)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all var(--dur-fast) var(--ease-spring)'
    }
  }, checked && (radio ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: 'var(--accent-fg)'
    }
  }) : /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--accent-fg)",
    strokeWidth: "3.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  }))));
}
function Checkbox({
  label,
  checked = false,
  onChange,
  disabled = false,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-base)',
      color: 'var(--fg)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked),
    style: {
      position: 'absolute',
      opacity: 0,
      width: 1,
      height: 1
    }
  }), /*#__PURE__*/React.createElement(Box, {
    checked: checked
  }), label);
}
function Radio({
  label,
  checked = false,
  onChange,
  name,
  value,
  disabled = false,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-base)',
      color: 'var(--fg)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: name,
    value: value,
    checked: checked,
    disabled: disabled,
    onChange: () => onChange && onChange(value),
    style: {
      position: 'absolute',
      opacity: 0,
      width: 1,
      height: 1
    }
  }), /*#__PURE__*/React.createElement(Box, {
    checked: checked,
    radio: true
  }), label);
}
Object.assign(__ds_scope, { Checkbox, Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function Field({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("label", {
    htmlFor: htmlFor,
    style: {
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-sm)',
      color: 'var(--fg)'
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--danger)'
    }
  }, " *")), children, error ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--danger)',
      fontWeight: 'var(--weight-medium)'
    }
  }, error) : hint ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--fg-muted)'
    }
  }, hint) : null);
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const inputBaseStyle = {
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-base)',
  padding: '9px 12px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface-card)',
  color: 'var(--fg)',
  transition: 'border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
  width: '100%'
};
function Input({
  invalid = false,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("input", _extends({}, rest, {
    style: {
      ...inputBaseStyle,
      ...(invalid ? {
        borderColor: 'var(--danger)'
      } : null),
      ...(focus ? {
        outline: '2px solid var(--focus-ring)',
        outlineOffset: '1px',
        borderColor: 'var(--focus-ring)'
      } : null),
      ...style
    },
    onFocus: e => {
      setFocus(true);
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      rest.onBlur && rest.onBlur(e);
    }
  }));
}
Object.assign(__ds_scope, { inputBaseStyle, Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Select({
  options = [],
  invalid = false,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("select", _extends({}, rest, {
    style: {
      ...__ds_scope.inputBaseStyle,
      appearance: 'none',
      WebkitAppearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23587fa7' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 10px center',
      paddingRight: '32px',
      cursor: 'pointer',
      ...(invalid ? {
        borderColor: 'var(--danger)'
      } : null),
      ...(focus ? {
        outline: '2px solid var(--focus-ring)',
        outlineOffset: '1px'
      } : null),
      ...style
    },
    onFocus: e => {
      setFocus(true);
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      rest.onBlur && rest.onBlur(e);
    }
  }), options.map(o => typeof o === 'string' ? /*#__PURE__*/React.createElement("option", {
    key: o,
    value: o
  }, o) : /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label)), rest.children);
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function Switch({
  label,
  checked = false,
  onChange,
  disabled = false,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-base)',
      color: 'var(--fg)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    role: "switch",
    checked: checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked),
    style: {
      position: 'absolute',
      opacity: 0,
      width: 1,
      height: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 38,
      height: 22,
      borderRadius: 'var(--radius-full)',
      background: checked ? 'var(--accent)' : 'var(--border-strong)',
      position: 'relative',
      flexShrink: 0,
      transition: 'background var(--dur-base) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 3,
      left: checked ? 19 : 3,
      width: 16,
      height: 16,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: '0 1px 2px rgba(29,38,52,.2)',
      transition: 'left var(--dur-base) var(--ease-spring)'
    }
  })), label);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Textarea({
  invalid = false,
  rows = 4,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("textarea", _extends({
    rows: rows
  }, rest, {
    style: {
      ...__ds_scope.inputBaseStyle,
      resize: 'vertical',
      lineHeight: 'var(--leading-normal)',
      ...(invalid ? {
        borderColor: 'var(--danger)'
      } : null),
      ...(focus ? {
        outline: '2px solid var(--focus-ring)',
        outlineOffset: '1px',
        borderColor: 'var(--focus-ring)'
      } : null),
      ...style
    },
    onFocus: e => {
      setFocus(true);
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      rest.onBlur && rest.onBlur(e);
    }
  }));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Breadcrumbs.jsx
try { (() => {
function Breadcrumbs({
  items = [],
  style
}) {
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Breadcrumb",
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-sm)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("ol", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      listStyle: 'none',
      margin: 0,
      padding: 0,
      flexWrap: 'wrap'
    }
  }, items.map((it, i) => {
    const last = i === items.length - 1;
    return /*#__PURE__*/React.createElement("li", {
      key: i,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)'
      }
    }, last || !it.href ? /*#__PURE__*/React.createElement("span", {
      "aria-current": last ? 'page' : undefined,
      style: {
        color: last ? 'var(--fg)' : 'var(--fg-muted)',
        fontWeight: last ? 'var(--weight-bold)' : 'var(--weight-body)'
      }
    }, it.label) : /*#__PURE__*/React.createElement("a", {
      href: it.href,
      onClick: it.onClick,
      style: {
        color: 'var(--fg-muted)',
        textDecoration: 'none'
      }
    }, it.label), !last && /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        color: 'var(--fg-subtle)'
      }
    }, "\u203A"));
  })));
}
Object.assign(__ds_scope, { Breadcrumbs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Breadcrumbs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SidebarNav.jsx
try { (() => {
function SidebarNav({
  brand = 'TDK_Design',
  logoSrc,
  items = [],
  actionItems = [],
  activeId,
  onSelect,
  actions,
  footer,
  style
}) {
  const [hov, setHov] = React.useState(null);
  const link = it => {
    const on = it.id === activeId;
    return /*#__PURE__*/React.createElement("a", {
      key: it.id,
      href: it.href || '#',
      onClick: e => {
        if (onSelect) {
          e.preventDefault();
          onSelect(it.id);
        }
      },
      onMouseEnter: () => setHov(it.id),
      onMouseLeave: () => setHov(null),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '9px 12px',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        fontWeight: 'var(--weight-medium)',
        fontSize: 'var(--text-sm)',
        transition: 'background var(--dur-fast) var(--ease-out)',
        background: on ? 'var(--sidebar-active-bg)' : hov === it.id ? 'var(--sidebar-hover-bg)' : 'transparent',
        color: on ? 'var(--sidebar-active-fg, #fff)' : 'var(--sidebar-fg-muted)'
      }
    }, it.icon, it.label);
  };
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 'var(--sidebar-width)',
      minHeight: '100%',
      background: 'var(--sidebar-bg)',
      color: 'var(--sidebar-fg)',
      padding: 'var(--space-5) var(--space-3)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)',
      fontFamily: 'var(--font-sans)',
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      padding: '0 var(--space-3)',
      flexShrink: 0
    }
  }, logoSrc && /*#__PURE__*/React.createElement("img", {
    src: logoSrc,
    alt: "",
    style: {
      width: 26,
      height: 26,
      filter: 'var(--sidebar-logo-filter, brightness(0) invert(1))'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--weight-heading)',
      fontSize: 'var(--text-md)',
      color: 'var(--sidebar-fg)',
      letterSpacing: '.02em'
    }
  }, brand)), /*#__PURE__*/React.createElement("nav", {
    style: {
      flexGrow: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1)',
      minHeight: 0,
      overflowY: 'auto'
    }
  }, items.map(link)), (actionItems.length > 0 || actions || footer) && /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1)'
    }
  }, actionItems.map(link), actions || footer));
}
Object.assign(__ds_scope, { SidebarNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SidebarNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function Tabs({
  tabs = [],
  active = 0,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    style: {
      display: 'flex',
      gap: 2,
      borderBottom: '1px solid var(--border)',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, tabs.map((t, i) => {
    const on = i === active;
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      role: "tab",
      "aria-selected": on,
      onClick: () => onChange && onChange(i),
      style: {
        font: 'inherit',
        fontWeight: 'var(--weight-medium)',
        fontSize: 'var(--text-sm)',
        padding: '8px 16px',
        cursor: 'pointer',
        border: '1px solid var(--border)',
        borderBottom: 'none',
        borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
        background: on ? 'var(--surface-card)' : 'var(--surface-sunken)',
        color: on ? 'var(--fg)' : 'var(--fg-muted)',
        position: 'relative',
        top: 1,
        transition: 'background var(--dur-fast) var(--ease-out)',
        boxShadow: on ? 'inset 0 2px 0 var(--accent)' : 'none'
      }
    }, t);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Card.jsx
try { (() => {
function Card({
  title,
  actions,
  image,
  imageAlt = '',
  imageHeight = 160,
  padded = true,
  raised = false,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: raised ? 'var(--shadow-raised)' : 'var(--shadow-card)',
      fontFamily: 'var(--font-sans)',
      color: 'var(--fg)',
      overflow: 'hidden',
      ...style
    }
  }, image && /*#__PURE__*/React.createElement("img", {
    src: image,
    alt: imageAlt,
    style: {
      display: 'block',
      width: '100%',
      height: imageHeight,
      objectFit: 'cover',
      borderBottom: '1px solid var(--border)'
    }
  }), (title || actions) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-3)',
      padding: 'var(--space-4) var(--space-5)',
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--weight-heading)',
      fontSize: 'var(--text-md)',
      letterSpacing: 'var(--tracking-heading)'
    }
  }, title), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-2)'
    }
  }, actions)), /*#__PURE__*/React.createElement("div", {
    style: padded ? {
      padding: 'var(--space-5)'
    } : null
  }, children));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Card.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Dialog.jsx
try { (() => {
function Dialog({
  open,
  title,
  onClose,
  actions,
  footer,
  children,
  width = 440,
  style
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();else if (!open && d.open) d.close();
  }, [open]);
  return /*#__PURE__*/React.createElement("dialog", {
    ref: ref,
    className: "tdk-dialog",
    onCancel: e => {
      e.preventDefault();
      onClose && onClose();
    },
    onClick: e => {
      if (e.target === ref.current) onClose && onClose();
    },
    style: {
      background: 'var(--surface-raised)',
      color: 'var(--fg)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-overlay)',
      width: 'calc(100% - 32px)',
      maxWidth: width,
      padding: 0,
      fontFamily: 'var(--font-sans)',
      zIndex: 'var(--z-overlay, 40)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("style", null, '@keyframes tdk-dialog-in{from{opacity:0;transform:scale(.94) translateY(8px)}to{opacity:1;transform:none}}.tdk-dialog[open]{animation:tdk-dialog-in var(--dur-slow) var(--ease-spring)}.tdk-dialog::backdrop{background:rgba(34,34,34,.33);backdrop-filter:blur(3px)}'), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'center',
      gap: 'var(--space-3)',
      padding: 'var(--space-4) var(--space-5)',
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--weight-heading)',
      fontSize: 'var(--text-lg)',
      letterSpacing: 'var(--tracking-heading)'
    }
  }, title), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    label: "Close",
    size: "sm",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-5)'
    }
  }, children), actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'row-reverse',
      gap: 'var(--space-2)',
      padding: 'var(--space-3) var(--space-5) var(--space-5)'
    }
  }, actions) : footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 'var(--space-2)',
      padding: 'var(--space-3) var(--space-5) var(--space-5)'
    }
  }, footer) : null);
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Drawer.jsx
try { (() => {
function Drawer({
  open,
  side = 'right',
  title,
  onClose,
  actions,
  children,
  width = 360,
  style
}) {
  const ref = React.useRef(null);
  const [closing, setClosing] = React.useState(false);
  React.useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      setClosing(false);
      if (!d.open) d.showModal();
    } else if (d.open) {
      setClosing(true);
      const t = setTimeout(() => {
        d.open && d.close();
        setClosing(false);
      }, 320);
      return () => clearTimeout(t);
    }
  }, [open]);
  const requestClose = () => {
    onClose && onClose();
  };
  return /*#__PURE__*/React.createElement("dialog", {
    ref: ref,
    className: 'tdk-drawer tdk-drawer-' + side + (closing ? ' tdk-drawer-closing' : ''),
    onCancel: e => {
      e.preventDefault();
      requestClose();
    },
    onClick: e => {
      if (e.target === ref.current) requestClose();
    },
    style: {
      background: 'var(--surface-raised)',
      color: 'var(--fg)',
      border: 'none',
      borderRadius: 0,
      boxShadow: 'var(--shadow-overlay)',
      width: 'calc(100% - 48px)',
      maxWidth: width,
      height: '100%',
      maxHeight: '100%',
      margin: 0,
      padding: 0,
      position: 'fixed',
      top: 0,
      [side]: 0,
      [side === 'right' ? 'left' : 'right']: 'auto',
      fontFamily: 'var(--font-sans)',
      zIndex: 'var(--z-overlay, 40)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("style", null, '@keyframes tdk-drawer-in-right{from{transform:translateX(100%)}to{transform:none}}@keyframes tdk-drawer-in-left{from{transform:translateX(-100%)}to{transform:none}}@keyframes tdk-drawer-out-right{from{transform:none}to{transform:translateX(100%)}}@keyframes tdk-drawer-out-left{from{transform:none}to{transform:translateX(-100%)}}@keyframes tdk-backdrop-out{from{opacity:1}to{opacity:0}}.tdk-drawer[open]{display:flex;flex-direction:column;animation:tdk-drawer-in-right var(--dur-slow) var(--ease-out)}.tdk-drawer-left[open]{animation-name:tdk-drawer-in-left}.tdk-drawer-closing[open]{animation:tdk-drawer-out-right var(--dur-slow) var(--ease-out) forwards}.tdk-drawer-left.tdk-drawer-closing[open]{animation-name:tdk-drawer-out-left}.tdk-drawer::backdrop{background:rgba(34,34,34,.33);backdrop-filter:blur(3px)}.tdk-drawer-closing::backdrop{animation:tdk-backdrop-out var(--dur-slow) var(--ease-out) forwards}'), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'center',
      gap: 'var(--space-3)',
      padding: 'var(--space-4) var(--space-5)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--weight-heading)',
      fontSize: 'var(--text-lg)',
      letterSpacing: 'var(--tracking-heading)'
    }
  }, title), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    label: "Close",
    size: "sm",
    onClick: requestClose
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-5)',
      overflowY: 'auto',
      flex: 1
    }
  }, children), actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'row-reverse',
      gap: 'var(--space-2)',
      padding: 'var(--space-4) var(--space-5)',
      borderTop: '1px solid var(--border)',
      flexShrink: 0
    }
  }, actions) : null);
}
Object.assign(__ds_scope, { Drawer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Drawer.jsx", error: String((e && e.message) || e) }); }

__ds_ns.ChatToolCall = __ds_scope.ChatToolCall;

__ds_ns.ChatBubble = __ds_scope.ChatBubble;

__ds_ns.ChatComposer = __ds_scope.ChatComposer;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.Stepper = __ds_scope.Stepper;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.ToastStack = __ds_scope.ToastStack;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Breadcrumbs = __ds_scope.Breadcrumbs;

__ds_ns.SidebarNav = __ds_scope.SidebarNav;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Drawer = __ds_scope.Drawer;

})();
