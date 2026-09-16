# Manual Workflow — Video & Audio Media Support — Design

## Problem

The Manual workflow's Images gallery (`manual/workspace/images.njk`, backed by
`ImageSchema`/`session.images`) only ever stores and displays images —
`storeManualImage` hardcodes an `imageSize()` call that will throw on a
non-image buffer, generation completion (`manual-execution.service.ts`) only
ever reads a node's `images` output array from ComfyUI's history response,
and every rendering surface (the gallery grid, the detail page's recent-media
grid, the Generation tab's Outputs strip, the click-to-preview modal) assumes
a single `<img>`. But ComfyUI workflows can just as easily produce video
(e.g. ComfyUI-VideoHelperSuite's `VHS_VideoCombine`, whose output — despite
being a video file — is emitted under a `gifs` key) or audio (various
third-party audio-save nodes, typically emitted under an `audio` key). We
want a Manual workflow session to be able to generate, browse, lock, mark
NSFW (video only — audio has no visual content to flag), delete, and
bulk-act-on video and audio results the same way it already does for images
today.

This is explicitly scoped to **output-side** support: browsing what a
generation produced. Using video/audio as workflow *input* field types
(uploading a video/audio and mapping it into a ComfyUI loader node) is a
separate, larger effort — ComfyUI has no universal `/upload/video` endpoint
the way it does `/upload/image`, and different video/audio loader node packs
expect files delivered differently. That's out of scope here.

## Current implementation

- **`ImageSchema`** (`src/services/manual-workflow.service.ts:11-20`):
  `{ id, filename, size: {width, height}, parent?, createdAt, final, nsfw,
  locked }`. `ManualImage` type alias at line 102. Stored in
  `ManualWorkflowSessionSchema.images: z.array(ImageSchema)` (line 71).
- **`storeManualImage`** (`src/lib/manual-image-store.ts:13-37`) is the one
  choke point that creates a `ManualImage` record: it calls
  `imageSize(buffer)` (the `image-size` npm package, which sniffs the
  buffer's own header bytes) unconditionally to populate `size`, generates a
  `<uuid>.<extension>` filename, and persists via
  `manualWorkflows.updateSession`. Used by both the manual upload route
  (`POST /api/v1/manual/:id/images`, `manual.ts:303-323`) and generation
  completion.
- **Generation completion** — `manual-execution.service.ts`'s
  `completeSingle` (~line 239) and `completeBatchSubJob` (~line 283) both
  call `storeManualImage(..., bytes, 'png')`, hardcoding the extension.
  `fetchResultImage` (`manual-execution.service.ts:192-202`) is what fetches
  those bytes:
  ```ts
  async function fetchResultImage(sessionId: string, promptId: string): Promise<Buffer | undefined> {
    const session = await manualWorkflows.getSession(sessionId);
    const resultOutput = session.resultOutput;
    if (!resultOutput) return undefined;

    const historyEntry = await comfyClient.getHistoryEntry(promptId);
    const image = historyEntry?.outputs[resultOutput.nodeId]?.images?.[resultOutput.outputIndex];
    if (!historyEntry || !image) return undefined;

    return comfyClient.viewImage(image.filename, image.subfolder, image.type);
  }
  ```
  This only ever reads the `.images` key. `HistoryEntry` is typed accordingly
  in `comfyui-client.service.ts:62-72`:
  ```ts
  export interface HistoryEntry {
    outputs: Record<string, { images?: HistoryOutputImage[] }>;
    ...
  }
  export interface HistoryOutputImage { filename: string; subfolder: string; type: string; }
  ```
  `comfyClient.viewImage(filename, subfolder, type)` (`comfyui-client.service.ts:297-308`)
  just hits ComfyUI's generic `/view` endpoint — already fully generic
  regardless of file type.
- **`resultOutput: { nodeId, outputIndex }`** (`manual-workflow.service.ts:68`)
  is already a generic pointer, not image-specific.
- **Node candidate picker** — `candidateOutputNodes`
  (`src/lib/workflow-mapping-logic.ts:117-148`) does a keyword match over
  each node's `classType`/title against `OUTPUT_NODE_KEYWORDS = ['save',
  'preview']` to decide which nodes are selectable as `resultOutput` in the
  Configuration tab. This misses class types like `VHS_VideoCombine` (no
  "save"/"preview" substring).
- **Asset serving** (`GET /:id/assets/:filename`, `manual.views.ts:144-151`)
  is already fully generic — `res.sendFile` derives `Content-Type` from the
  file extension and supports range requests, so an `.mp4`/`.webm`/`.mp3`/
  `.wav` file is already served correctly today with zero changes.
- **Gallery grid** (`manual/workspace/images.njk`) — tiles built around a
  hardcoded `<img data-viewer-trigger>`, an NSFW blur/badge wrapper
  (`data-nsfw-target`), and per-tile Delete/Copy URL/Set NSFW/Lock actions,
  plus the Multiselect bulk-action bar (`data-select-bar`, from the prior
  design). `public/nsfw-toggle.js`, `public/lock-toggle.js`, and
  `public/bulk-select.js` are already fully content-agnostic — they only
  ever key off `[data-image-tile]`, `[data-image-id]`, `[data-nsfw-target]`,
  `[data-nsfw-toggle]`, `[data-lock-toggle]`, `[data-select-checkbox]`, never
  touching `<img>` internals.
- **NSFW blur CSS** (`app.css`): `[data-nsfw-enabled] img { filter: blur(...) }`
  — scoped to `img` only.
- **Click-to-preview modal** (`partials/image-viewer.njk` +
  `public/image-viewer.js`, 192 lines) hardcodes a single
  `<img data-viewer-image>`. `resolveImageUrl` (lines 49-59) special-cases
  `trigger.tagName === 'IMG'`, otherwise falls back to
  `scope.querySelector('img')` — no video/audio path exists. `showTrigger`
  (line 61-63) does `image.src = resolveImageUrl(trigger)` directly. The
  trigger/group/step/checklist-slot machinery around this (`data-viewer-
  trigger`, `data-viewer-group`, prev/next stepping) is otherwise fully
  generic.
- **Other hardcoded `<img>` sites**: `manual-generation-outputs.njk` (the
  Generation tab's Outputs strip, lines ~4 and ~15) and `manual/detail.njk`'s
  `recentImages` grid (lines 58-83), which also displays `image.size.width`/
  `height` (line 74).
- **Upload MIME allowlist** (`src/lib/data-url.ts`,
  `MIME_EXTENSIONS`) only maps `image/png`, `image/jpeg`, `image/jpg`,
  `image/webp` — irrelevant here since this feature adds no new upload path
  (creation is generation-completion only), but is why the existing upload
  route can't already accept video/audio.

## Design

### Data model

Extend `ImageSchema` in place (`manual-workflow.service.ts:11-20`) rather
than introduce a parallel collection — this avoids migrating any existing
`session.images` data on disk or renaming a field referenced across the
codebase:

```ts
export const MediaKindSchema = z.enum(['image', 'video', 'audio']);

export const ImageSchema = z.object({
  id: z.string(),
  kind: MediaKindSchema.default('image'),
  filename: z.string(),
  size: z.object({ width: z.number(), height: z.number() }).optional(),
  parent: z.string().optional(),
  createdAt: z.coerce.date().default(() => new Date()),
  final: z.boolean().default(false),
  nsfw: z.boolean().default(false),
  locked: z.boolean().default(false)
});
```

`kind.default('image')` means every existing persisted record (none of which
have a `kind` field) parses as `'image'` with no migration step. `size`
becomes `.optional()` since it's only ever computed for images — video/audio
metadata extraction (duration, resolution) is out of scope for this pass, no
new dependency (e.g. an ffprobe wrapper) is introduced.

`nsfw` stays a schema-level field on every kind (default `false`, unused for
audio) rather than being conditionally absent, so `setImageNsfw`/
`bulkEditImages` remain fully generic with zero per-kind branching — it's the
*template* layer that decides not to render an NSFW toggle/badge for audio
tiles. `locked`/delete are already fully kind-agnostic and need no changes.

### Storage: `storeManualImage`

`src/lib/manual-image-store.ts` gains a `kind: MediaKind` parameter; the
`imageSize(buffer)` call (and the resulting `size` field) is skipped unless
`kind === 'image'`:

```ts
export async function storeManualImage(
  manualWorkflows, sessionId, workflowDir, buffer, extension, kind: MediaKind = 'image'
): Promise<ManualImage> {
  const size = kind === 'image' ? imageSize(buffer) : undefined;
  const id = crypto.randomUUID();
  const filename = `${id}.${extension}`;
  ...
  const image = ImageSchema.parse({ id, kind, filename, size });
  await manualWorkflows.updateSession(sessionId, (current) => ({ images: [...current.images, image] }));
  return image;
}
```

The manual upload route (`POST /api/v1/manual/:id/images`) keeps calling this
with the default `kind: 'image'` — unaffected.

### Result-output resolution & generation completion

`HistoryEntry.outputs` (`comfyui-client.service.ts:62-72`) widens to include
the other two known ComfyUI output-array keys, using the same per-item shape:

```ts
export interface HistoryEntry {
  outputs: Record<string, { images?: HistoryOutputImage[]; gifs?: HistoryOutputImage[]; audio?: HistoryOutputImage[] }>;
  ...
}
```

`fetchResultImage` (renamed `fetchResultMedia`) tries each key in a fixed
priority order and reports which kind matched, plus derives the extension
from ComfyUI's own returned filename instead of the current hardcoded
`'png'`:

```ts
const OUTPUT_KEY_TO_KIND: Record<string, MediaKind> = {
  images: 'image',
  gifs: 'video',   // ComfyUI-VideoHelperSuite emits video files under `gifs`
  audio: 'audio',
};

async function fetchResultMedia(sessionId: string, promptId: string): Promise<{ buffer: Buffer; kind: MediaKind; extension: string } | undefined> {
  const session = await manualWorkflows.getSession(sessionId);
  const resultOutput = session.resultOutput;
  if (!resultOutput) return undefined;

  const historyEntry = await comfyClient.getHistoryEntry(promptId);
  const nodeOutputs = historyEntry?.outputs[resultOutput.nodeId];
  if (!historyEntry || !nodeOutputs) return undefined;

  for (const [key, kind] of Object.entries(OUTPUT_KEY_TO_KIND)) {
    const item = nodeOutputs[key]?.[resultOutput.outputIndex];
    if (!item) continue;
    const buffer = await comfyClient.viewImage(item.filename, item.subfolder, item.type);
    return { buffer, kind, extension: path.extname(item.filename).slice(1) || 'bin' };
  }
  return undefined;
}
```

`completeSingle`/`completeBatchSubJob` call `storeManualImage(manualWorkflows,
session.id, session.workflowDir, buffer, extension, kind)` with the values
returned from `fetchResultMedia`, instead of the current hardcoded
`storeManualImage(..., bytes, 'png')`.

**Node candidate picker**: `OUTPUT_NODE_KEYWORDS` in
`src/lib/workflow-mapping-logic.ts` broadens from `['save', 'preview']` to
`['save', 'preview', 'combine', 'video', 'audio', 'export']`, so
video/audio-producing nodes (e.g. `VHS_VideoCombine`) actually appear as
selectable `resultOutput` candidates in the Configuration tab. Without this,
a user could never point a workflow's result output at a video node in the
first place.

### Shared thumbnail rendering

A new macro in `src/templates/macros.njk`, used by the gallery grid, the
Generation tab's Outputs strip, and the detail page's recent-media grid, so
the per-kind conditional markup lives in exactly one place:

```njk
{% macro mediaThumb(url, kind, viewerGroup) %}
  {% if kind == 'video' %}
    <video src="{{ url }}" preload="metadata" muted playsinline
      data-viewer-trigger data-viewer-kind="video" data-viewer-group="{{ viewerGroup }}"
      class="absolute inset-0 w-full h-full object-cover"></video>
  {% elif kind == 'audio' %}
    <div data-viewer-trigger data-viewer-kind="audio" data-viewer-src="{{ url }}" data-viewer-group="{{ viewerGroup }}"
      class="absolute inset-0 flex flex-col items-center justify-center gap-1 cursor-pointer text-steel-400">
      <span class="text-2xl">&#9834;</span>
      <span class="text-[11px]">Audio</span>
    </div>
  {% else %}
    <img src="{{ url }}" data-viewer-trigger data-viewer-group="{{ viewerGroup }}"
      class="absolute inset-0 w-full h-full object-cover" alt="" />
  {% endif %}
{% endmacro %}
```

Video tiles show a static first-frame preview (`preload="metadata"`, no
`controls` — deliberately not interactive, see "Tile interaction" below);
audio tiles show a simple icon placeholder. Both carry either a native `src`
(video) or an explicit `data-viewer-src` (audio, which has no underlying
media element in the grid) so the preview modal can resolve a URL without
assuming an `<img>`.

**Tile interaction**: tiles for every kind remain purely static — no native
`<video controls>`/`<audio controls>` in the grid. This was a deliberate
resolution of a real conflict: inline native controls and "click the tile to
open the preview modal" compete for the same click, and inline controls
would also fight with Multiselect's "click anywhere on the tile to select"
behavior. Keeping tiles static (exactly like images today) means clicking
always opens the modal, where the real controls live, and Select mode's
existing capture-phase click interceptor (`bulk-select.js`) needs no changes
at all.

### Gallery grid, detail page, Outputs strip

`manual/workspace/images.njk` → renamed `manual/workspace/media.njk`, route
`/:id/workspace/images` → `/:id/workspace/media`, subnav tab label "Images"
→ "Media" (`partials/manual-workspace-subnav.njk`). This is a local,
personal-use app with no external bookmarks to preserve, so the rename
happens now rather than leaving a misleading URL/label behind.

The tile wrapper uses `ui.mediaThumb(url, image.kind, 'workspace-media')`
instead of the hardcoded `<img>`. Per the approved tile-layout mockup, audio
tiles are short, content-sized cards rather than the tall `aspect-[3/4]` box
image/video tiles use — the grid container gets `items-start` so uneven row
heights don't stretch neighboring cells. The NSFW toggle button and blur/
badge wrapper only render when `image.kind !== 'audio'`. Lock/Delete/Copy
URL and the Multiselect bulk-action bar are unchanged and apply identically
across all three kinds — `bulkDeleteImages`, `bulkEditImages`,
`setImageLocked`, `setImageNsfw` need no code changes.

`manual-generation-outputs.njk` and `manual/detail.njk`'s `recentImages` grid
both switch their hardcoded `<img>` to `ui.mediaThumb(...)`.  `detail.njk`'s
`image.size.width`/`height` display becomes conditional on `item.size` being
present, since only images have it.

### CSS

`app.css`'s NSFW blur rule widens from `[data-nsfw-enabled] img` to
`[data-nsfw-enabled] img, [data-nsfw-enabled] video` — audio is excluded
since it has no visual content to blur.

### Preview modal generalization

`partials/image-viewer.njk` gains sibling elements alongside the existing
`<img data-viewer-image>`, each hidden by default:

```njk
<img data-viewer-image class="hidden max-h-[80vh] max-w-full" alt="" />
<video data-viewer-video controls class="hidden max-h-[80vh] max-w-full"></video>
<audio data-viewer-audio controls class="hidden w-full"></audio>
```

`public/image-viewer.js` changes, all contained to this one file:

- `resolveImageUrl` → `resolveMediaUrl`: prefers an explicit `data-viewer-src`
  attribute on the trigger (used by the audio placeholder); otherwise falls
  back to `trigger.currentSrc`/`src` for `<img>`/`<video>` triggers, then the
  nearest `img, video, audio` within the enclosing tile — a superset of
  today's `<img>`-only logic, so existing image-only callers
  (`characters/images.njk`, etc.) are unaffected.
- `showTrigger` reads `trigger.getAttribute('data-viewer-kind') || 'image'`,
  pauses whichever of `<video>`/`<audio>` is currently active, hides all
  three elements, then unhides and sets `.src` on the one matching kind.
  `step()` (prev/next) already calls `showTrigger` per step, so mixed-kind
  groups (e.g. stepping from an image to a video within the same
  `data-viewer-group`) work with no separate step logic.
- The dialog's `close` handler also pauses `<video>`/`<audio>`, in addition
  to the existing `image.src = ''` reset, so closing or navigating away never
  leaves audio/video playing in the background.
- No autoplay — video/audio open paused with controls visible.

## Error handling & edge cases

- A result node whose output isn't under `images`/`gifs`/`audio`:
  `fetchResultMedia` returns `undefined`, the same "no result found" error
  path generation completion already has today — no new failure mode.
- Existing sessions/persisted data: `kind` defaults to `'image'` on load,
  `size` stays present for old image entries — fully backward compatible,
  no migration step required.
- `nsfw` remains settable on audio records via the generic bulk/single edit
  methods but is never rendered or toggleable in the UI for audio — harmless,
  not a bug.
- Video's static preview (`preload="metadata"`, no dedicated thumbnail
  generation) may show a blank/black frame in some browsers until enough
  data loads — accepted limitation for v1.
- Deleting/locking/bulk-acting on any kind reuses the existing generic
  id/filename-based logic untouched.
- A node emitting under more than one of the three known keys (unlikely but
  possible): priority order `images` > `gifs` > `audio` picks the first
  match.

## Explicitly out of scope

- Video/audio as workflow *input* field types — a separate, larger future
  effort blocked on researching how target ComfyUI loader nodes expect files
  delivered.
- A manual upload endpoint for video/audio — creation is generation-
  completion only.
- Video/audio metadata extraction (dimensions/duration) — no ffprobe or
  similar dependency added.
- Audio NSFW marking/blur in the UI.
- Dedicated video poster/thumbnail generation.
- Migrating `session.images` to a renamed field or separate collection.

## Testing

- **Service**: `storeManualImage` skips `imageSize()` and omits `size` for
  `kind: 'video'|'audio'`, still computes it for `kind: 'image'`;
  `fetchResultMedia` resolves `images`/`gifs`/`audio` output keys to the
  correct kind and uses ComfyUI's own filename extension rather than a
  hardcoded one.
- `candidateOutputNodes`: the broadened keyword list picks up a
  `VHS_VideoCombine`-style class type as a candidate result-output node.
- **Route**: existing image upload/PATCH/delete/bulk-action routes are
  unaffected — no route changes are introduced by this feature.
- **Manual verification** via the `run` skill: configure a workflow whose
  result-output is a video-combine node, run a generation, confirm the Media
  gallery shows a static video tile that opens a working `<video controls>`
  player in the modal, and that Lock/Delete/Multiselect all work on it;
  repeat for an audio-save node result (icon tile → `<audio controls>` in
  modal); confirm existing image generations are visually and functionally
  unchanged; confirm the detail page and Generation tab's Outputs strip
  render video/audio results correctly too.
