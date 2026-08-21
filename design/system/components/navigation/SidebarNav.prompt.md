The brand's signature green nav aside (apple-700 light / apple-900 dark), 240px wide, for the two-column sidebar layout.

Enforced structure — a 3-row flex column (`<aside>` with `flex-direction:column`):
1. **header** — logo + title
2. **navigation** — page links; has `flex-grow:1`, pushing header/actions to the top and bottom edges
3. **actions** — secondary nav: settings, user avatars, toggles

```jsx
<SidebarNav brand="TDK_Design" logoSrc="assets/logo.svg" activeId="home" onSelect={go}
  items={[{id:'home',label:'Dashboard'},{id:'projects',label:'Projects'}]}
  actionItems={[{id:'settings',label:'Settings'}]}
  actions={<Switch label="Dark" checked={dark} onChange={setDark} />} />
```

Pass Lucide icons via `icon`. `actionItems` render as links in the bottom actions row (settings, account); `actions` fills the same row with arbitrary nodes (`footer` is a legacy alias).
