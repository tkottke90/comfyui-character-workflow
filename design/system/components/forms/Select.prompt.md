Native dropdown styled like Input, with a steel-blue Lucide chevron.

```jsx
<Select options={['Small','Medium','Large']} value={size} onChange={e=>setSize(e.target.value)} />
```

Options may be strings or `{value, label}` objects; `<option>` children also pass through.