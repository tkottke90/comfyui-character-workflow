Label-above wrapper for form controls — TDK forms always place labels above fields.

```jsx
<Field label="Email" hint="We never share this" required htmlFor="em">
  <Input id="em" type="email" placeholder="you@example.com" />
</Field>
```

`error` replaces the hint in chestnut rose. Wrap Input, Select, Textarea — Checkbox/Radio/Switch carry their own inline labels.