Enclosed tabs: bordered folders on a baseline, active tab merges with the panel and carries a green top bar.

```jsx
<Tabs tabs={['Overview','Activity','Settings']} active={tab} onChange={setTab} />
```

Render the panel directly below inside a Card or bordered container so the active tab connects to it.