Icon-only square button (28/36/44px) — always pass `label` for accessibility; pass a Lucide icon as the child.

```jsx
<IconButton label="Settings" onClick={openSettings}><i data-lucide="settings"></i></IconButton>
```

Variants: ghost (default, transparent), outline (bordered), primary (green fill). lg (44px) meets mobile hit-target minimums.