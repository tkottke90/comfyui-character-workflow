Checkbox and Radio share one file — green fill when selected, springy transition, inline label.

```jsx
<Checkbox label="Email me updates" checked={c} onChange={setC} />
<Radio name="plan" value="pro" label="Pro" checked={plan==='pro'} onChange={setPlan} />
```