Action button: `variant` sets the fill style, `tone` sets the color role.

```jsx
<Button variant="raised" tone="primary">Save changes</Button>
<Button variant="outlined" tone="secondary">Preview</Button>
<Button variant="text" tone="warning">Discard</Button>
<Button variant="raised" tone="primary"><SaveIcon/> Save</Button>
```

- Variants: **raised** (solid fill + `--shadow-raised`, flattens on press), **outlined** (2px tone border, transparent background, soft tint on hover), **text** (chrome-free, soft tint on hover).
- Tones: **primary** apple green · **secondary** steel blue · **warning** chestnut rose.
- Icons: prepend an inline Lucide SVG (2px stroke, `currentColor`) before the label.
- Legacy `variant` values (primary/secondary/ghost/danger) still map for back-compat.
- Sizes sm/md/lg; `fullWidth` for single-action layouts; press scales to 97% with the springy ease.