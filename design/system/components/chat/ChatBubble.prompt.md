Structured chat message. Grid: time row on top (outgoing = top-left, incoming = top-right), colored content block, bottom row with actions (bottom-right, all kinds) and metrics (bottom-left, AI only).

```jsx
<ChatBubble from="other" author="Sam" timestamp={Date.now()-5*60000}>How's the garden?</ChatBubble>
<ChatBubble from="self" timestamp={Date.now()} actions={<IconButton size="sm" label="Copy">…</IconButton>}
  images={[{src:'photo.jpg'},{src:'risky.jpg',nsfw:true}]}>Tomatoes are in!</ChatBubble>
<ChatBubble from="ai" author="Assistant" timestamp="2024-08-04T08:43:00"
  metrics={{time:'1.24s',tps:'38 tok/s',cost:'$0.003'}}
  actions={<><IconButton size="sm" label="Like">…</IconButton><IconButton size="sm" label="Dislike">…</IconButton></>}
  file={{name:'report.pdf',size:'1.2 MB'}} audio={{name:'reply.mp3',duration:'0:42'}}>
  Here's the summary you asked for.
</ChatBubble>
```

- `timestamp` renders relative when the date is today ("5 mins ago"), locale date/time otherwise ("8/4/2024 8:43 AM").
- Attachments: `file` chip at the top of the content (`files: [...]` for several), `images` inline (per-image `nsfw: true` blurs behind a reveal toggle), `audio` row at the bottom.
- `metrics` (AI only): execution time, tokens/sec, cost — mono, bottom-left.
- `ChatToolCall` — collapsible tool-call row for AI messages. Place inline in children, in chronological call order, with text before (intent) and after (conclusion):

```jsx
<ChatBubble from="ai" author="Assistant" metrics={{time:'3.02s'}}>
  <div style={{display:'flex',flexDirection:'column',gap:8}}>
    <div>Let me check the weather first.</div>
    <ChatToolCall name="get_weather" input='{ "zip": "97210" }' result="82°F, clear" duration="0.31s"/>
    <div>It's hot — water tonight.</div>
  </div>
</ChatBubble>
```

`status="running"` shows a live state; `status="error"` tints the row rose. Click expands the result.
- `ChatComposer` — structured container: attachment-preview row on top (image thumbs / file chips, hover shows a × remove circle), message textarea, bottom row with a `+` menu (Add a file → native file picker; Provider ›), the current-model chip, and the green send button. The Provider item opens a cascading flyout beside the menu — providers (OpenAI/Anthropic) → that provider's models — never swapping the parent menu. `onSend(text, attachments)`; Enter sends. Pass `providers={{MyProvider:['model-a']}}` to customize.