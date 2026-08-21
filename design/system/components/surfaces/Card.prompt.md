Primary content surface: white, 1px steel-blue border, 10px radius, faint shadow (border-first elevation).

```jsx
<Card title="Recent activity" actions={<Button size="sm" variant="ghost">View all</Button>}>
  …content…
</Card>
```

`padded={false}` for tables/lists that go edge-to-edge; `raised` for hover/featured emphasis.

Table card — `padded={false}` + a plain `<table>`: sunken uppercase header row, 1px row dividers, numeric columns right-aligned in mono, status as Badges.

Media card — `image` renders a full-bleed cover above the content:

```jsx
<Card image="photo.jpg" imageAlt="Crowd at a concert">
  <h3 style={{margin:0}}>Glass Souls' World Tour</h3>
  <p style={{color:'var(--fg-muted)'}}>From your recent favorites</p>
  <Button>Buy tickets</Button>
</Card>
```