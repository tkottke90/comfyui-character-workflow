Notification card with a 4px tone-colored left edge; springy rise-in. Always mount inside `ToastStack` (fixed bottom-right).

```jsx
<ToastStack>
  <Toast tone="success" title="Changes saved" onDismiss={pop} />
  <Toast tone="danger" title="Upload failed" message="File exceeds 10 MB." />
</ToastStack>
```