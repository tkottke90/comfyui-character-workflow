Single-line text input; passes through all native props. Blue focus ring, `invalid` for error state.

```jsx
<Input placeholder="Project name" value={v} onChange={e=>setV(e.target.value)} />
<Input type="password" invalid />
```