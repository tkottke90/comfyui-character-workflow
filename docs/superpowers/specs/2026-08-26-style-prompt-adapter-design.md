# Style Prompt Adapter — Design

## Problem

The Style registry (`docs/superpowers/specs/2026-08-25-style-registry-design.md`)
guides mechanical generation choices — checkpoint, sampler, scheduler, cfg,
steps — but has no say over how the positive/negative prompt text itself is
structured. Today every character's prompt is built the same way regardless
of checkpoint: `compileIdentityBlock()` (`src/lib/character-logic.ts:43-66`)
always produces a natural-language phrase ("photo of a asian woman, 25 years
old, tan skin, ..."), and `negativePrompt` defaults to a fixed
photoreal-oriented string (`DEFAULT_NEGATIVE_PROMPT`,
`character-logic.ts:24-26`). But different base-model families expect very
different prompt conventions:

- **CLIP-only/dual-CLIP families** (SD1.5, SDXL, Illustrious, Pony) want
  comma-separated tags, front-loaded quality/count/score tags, and negative
  prompts that matter a lot — Illustrious wants a `1girl`-style count tag and
  Danbooru-vocabulary quality tags; Pony has its own well-documented
  `score_9, score_8_up, ...` positive/negative tag scheme.
- **T5/LLM-encoder families** (Flux, Qwen-Image, Wan) want natural-language
  or instruction-style prompts, and Flux in particular is commonly run
  without a functioning negative prompt at all (CFG-free/distilled sampling).

There's currently no way for a Style to express any of this — applying a
style only ever copies mechanical fields onto a character, never touches how
its prompt text gets assembled or wrapped.

## Current architecture (relevant parts)

- Style is a flat Markdown+YAML-frontmatter record
  (`src/schemas/style.schema.ts`), applied to a `Character` via a one-time
  snapshot copy (`applyStyleToCharacter()`, `character-logic.ts:231-241`) —
  never a live binding, per the existing Style registry design.
- `compileIdentityBlock()` (`character-logic.ts:43-66`) builds the positive
  prompt subject text from `Attributes` (free-text fields: ethnicity, sex,
  age, skin tone, face shape, eyes, eyebrows, hair, nose, lips, build,
  height, clothing), always in natural-language phrasing. This design does
  **not** change that function or the Attributes schema — attribute
  rendering stays exactly as-is.
- `Character.negativePrompt` is a free-text field, independently editable,
  defaulting to `DEFAULT_NEGATIVE_PROMPT`.
- `buildGraph()` in `src/services/execution.service.ts:412-472` splices
  resolved domain-field values into the cloned ComfyUI workflow JSON.
  `POSITIVE_PROMPT_SOURCE_VALUES` (`execution.service.ts:108-112`) flags
  `character.identityBlock`/`character.identityBlockFrozen` as "the positive
  prompt" so an optional per-phase prefix/suffix (`PhasePromptConfigSchema`,
  `src/schemas/config.schema.ts:19-22`, configured under `config.yaml`'s
  `phase-prompt` section) gets wrapped around it. `character.negativePrompt`
  gets no such wrapping today.
- App-level config (`src/config.ts`) is YAML-backed, one section per
  concern in `ConfigSchema` (`comfy-ui`, `character-attributes`,
  `phase-prompt`). `ensureConfigExists()`/`validateConfig()` write
  `ConfigSchema.parse({})` to `config.yaml` on first boot and auto-add any
  section missing on upgrade (`config.ts:53-110`). Sections like `comfy-ui`
  and `phase-prompt` default to a fully-specified value that gets serialized
  into the file as-is; `character-attributes` instead defaults to `{}` and
  supplements a code-level baseline (`DEFAULT_ATTRIBUTE_SUGGESTIONS`,
  `src/lib/character-attribute-defaults.ts`) rather than replacing it. This
  design follows the former pattern (fully-specified default, file becomes
  authoritative), not the latter.
- Config is read live per request via `app.config.get()`/`loadConfig()` —
  no restart required to pick up a `config.yaml` edit.

## Data model

New `src/schemas/prompt-adapter.schema.ts`:

```ts
export const PromptAdapterSchema = z.object({
  presetId: z.string().default(''),             // display-only, e.g. "illustrious" — like styleSourceName, never re-synced
  leadTags: z.string().default(''),              // e.g. "1girl" or "score_9, score_8_up, score_7_up, score_6_up"
  qualityTagsPositive: z.string().default(''),   // e.g. "masterpiece, best quality"
  negativeMode: z.enum(['template', 'suppressed']).default('template'),
  qualityTagsNegative: z.string().default(''),   // e.g. "worst quality, low quality, bad anatomy"
});
export type PromptAdapter = z.infer<typeof PromptAdapterSchema>;

export const PromptAdapterPresetSchema = PromptAdapterSchema
  .omit({ presetId: true })
  .extend({ label: z.string().min(1) });
export type PromptAdapterPreset = z.infer<typeof PromptAdapterPresetSchema>;
```

`StyleSchema` and `CharacterSchema` each get one new field:

```ts
promptAdapter: PromptAdapterSchema.default(() => PromptAdapterSchema.parse({}))
```

All fields default to empty/`template`, so an untouched Style or Character
renders byte-identical prompts to today — no data migration required.

`ConfigSchema` (`src/schemas/config.schema.ts`) gets one new section:

```ts
'prompt-adapter-presets': z
  .record(z.string(), PromptAdapterPresetSchema)
  .default(() => DEFAULT_PROMPT_ADAPTER_PRESETS)
```

`DEFAULT_PROMPT_ADAPTER_PRESETS` lives in `src/lib/prompt-adapter-defaults.ts`
(mirroring `character-attribute-defaults.ts`'s naming/location) and ships
one entry per researched model family:

```ts
export const DEFAULT_PROMPT_ADAPTER_PRESETS: Record<string, PromptAdapterPreset> = {
  sd15: {
    label: 'SD 1.5 (tags)',
    leadTags: '', qualityTagsPositive: 'masterpiece, best quality',
    negativeMode: 'template',
    qualityTagsNegative: 'lowres, bad anatomy, bad hands, missing fingers, extra digit, worst quality, low quality, jpeg artifacts, signature, watermark, blurry',
  },
  sdxl: {
    label: 'SDXL (base)',
    leadTags: '', qualityTagsPositive: '',
    negativeMode: 'template',
    qualityTagsNegative: 'worst quality, low quality, blurry, watermark, text',
  },
  illustrious: {
    label: 'Illustrious / NoobAI (Danbooru tags)',
    leadTags: '1girl', qualityTagsPositive: 'masterpiece, best quality, amazing quality',
    negativeMode: 'template',
    qualityTagsNegative: 'worst quality, low quality, bad anatomy, extra digits, jpeg artifacts, signature, watermark',
  },
  pony: {
    label: 'Pony Diffusion (score tags)',
    leadTags: 'score_9, score_8_up, score_7_up, score_6_up, source_anime',
    qualityTagsPositive: '',
    negativeMode: 'template',
    qualityTagsNegative: 'score_4, score_5, score_6, worst quality, low quality',
  },
  flux: {
    label: 'Flux (natural language, no negative)',
    leadTags: '', qualityTagsPositive: '',
    negativeMode: 'suppressed', qualityTagsNegative: '',
  },
  qwen: {
    label: 'Qwen-Image (natural language)',
    leadTags: '', qualityTagsPositive: '',
    negativeMode: 'template', qualityTagsNegative: '',
  },
  wan: {
    label: 'Wan (video, natural language)',
    leadTags: '', qualityTagsPositive: '',
    negativeMode: 'template', qualityTagsNegative: '',
  },
  custom: {
    label: 'Custom (blank)',
    leadTags: '', qualityTagsPositive: '',
    negativeMode: 'template', qualityTagsNegative: '',
  },
};
```

Because `qwen` and `wan` negative-prompt conventions are genuinely
under-documented (per research), both default to a harmless no-op
(`template` mode, empty tags) rather than asserting an unverified
`suppressed` behavior. `flux` is the one family where "drop negatives" is
well-established, so it's the only preset defaulting to `suppressed`.

Since the config section's default is this fully-specified object (not
`{}`), `ConfigSchema.parse({})` on first boot serializes all 8 presets in
full into `config.yaml` — the user sees the entire list immediately and can
hand-edit, delete, or add entries directly in the file, which is read live
per request (no restart needed).

## Design

### 1. Rendering: `applyPromptAdapter()`

New pure function, `src/lib/prompt-adapter.ts`:

```ts
export function applyPromptAdapter(
  value: string,
  adapter: PromptAdapter,
  kind: 'positive' | 'negative',
): string {
  if (kind === 'negative' && adapter.negativeMode === 'suppressed') return '';

  const segments = kind === 'positive'
    ? [adapter.leadTags, adapter.qualityTagsPositive, value]
    : [adapter.qualityTagsNegative, value];

  return segments.filter((s) => s.trim().length > 0).join(', ');
}
```

An all-default `PromptAdapter` (empty strings, `negativeMode: 'template'`)
makes this a no-op — `filter().join(', ')` over `['', '', value]` returns
`value` unchanged, guaranteeing every existing character/style renders
identically to today post-ship.

### 2. Hook point: `execution.service.ts` `buildGraph()`

`buildGraph()` (`execution.service.ts:412-472`) already special-cases
`POSITIVE_PROMPT_SOURCE_VALUES` to wrap `character.identityBlock`/
`identityBlockFrozen` with the phase-prompt prefix/suffix
(`execution.service.ts:460-465`). This design adds one more wrap **before**
that one:

- For sourceValues in `POSITIVE_PROMPT_SOURCE_VALUES`: call
  `applyPromptAdapter(value, character.promptAdapter, 'positive')` first,
  then apply the existing phase-prompt prefix/suffix around the result.
  Adapter segments sit innermost; a phase's own instruction (e.g. a
  Qwen-edit rotation phase's "now show her from the side" suffix) still
  lands outermost, unchanged from today.
- A new `NEGATIVE_PROMPT_SOURCE_VALUES` set containing
  `character.negativePrompt`, wrapped via
  `applyPromptAdapter(value, character.promptAdapter, 'negative')`. No
  phase-prompt wrapping applies here — that config section stays
  positive-only.

The two wrapping layers stay orthogonal: the adapter answers "what does this
model family expect," phase-prompt answers "what does this specific
workflow phase need appended regardless of family." Neither needs to know
about the other.

When `negativeMode` is `suppressed`, the resolved value for
`character.negativePrompt`'s node input becomes `''` — whatever ComfyUI node
consumes it (typically a `CLIPTextEncode` feeding negative conditioning)
receives an empty string, which is harmless for both CFG-based samplers
(empty negative conditioning is already common practice) and CFG-free/
distilled paths that ignore it entirely.

### 3. Style form UI

`src/templates/styles/form.njk` + `src/views/styles.views.ts`:

- New "Prompt Adapter" fieldset after the existing checkpoint/sampler/
  scheduler/cfg/steps fields:
  - **Preset** `<select>` — options built server-side from
    `app.config.get('prompt-adapter-presets')` (key + label).
  - **Lead Tags** (text input).
  - **Quality Tags (positive)** (text input).
  - **Negative Mode** (radio/select: "Use negative prompt" /
    "Suppress negative prompt").
  - **Quality Tags (negative)** (text input, disabled when Negative Mode is
    "Suppress").
- Picking a Preset client-side-fills the four fields (small inline script);
  all four stay freely editable afterward. Submitting persists whatever's
  in the fields — plus the chosen preset's key as `presetId` — into
  `StyleSchema`, validated server-side like every other field.
- Style library page: each row's summary line gets a short adapter badge,
  e.g. `Illustrious · negatives: template` or `Flux · negatives: suppressed`.

### 4. Character spec builder UI

`src/templates/characters/spec.njk` + `src/views/characters.views.ts`:

- Same four-field "Prompt Adapter" fieldset, placed near the existing
  Negative Prompt field.
- `applyStyleToCharacter()` copies `style.promptAdapter` onto
  `character.promptAdapter` alongside the mechanical fields it already
  copies — one-time snapshot, immediately hand-editable, consistent with
  every other style-applied field.
- When Negative Mode is "Suppress," the Negative Prompt field shows a small
  inline note ("not sent to ComfyUI with this prompt adapter") rather than
  being hidden — the text stays intact in the record and Markdown export,
  just excluded from the graph at generation time.
- A read-only "Final prompt preview" line shows the adapter-rendered
  positive and negative strings exactly as `applyPromptAdapter()` would
  produce them, so the user can see the Illustrious/Pony tag-soup effect (or
  a suppressed-negative state) before generating. This extends the existing
  identity-block preview the spec builder already has.

## Error handling & edge cases

- **Config missing `prompt-adapter-presets` section** (upgrade from an
  older `config.yaml`): `validateConfig()`'s existing per-section migration
  adds the full 8-preset default back.
- **Invalid preset entry in `config.yaml`** (e.g. an unrecognized
  `negativeMode` value): handled by the existing section-level
  `_.merge`-with-defaults-and-resave fallback in `validateConfig()`, same as
  any other malformed config section today.
- **Style/Character created before this feature ships**: `promptAdapter`
  defaults to all-empty/`template` on next read via Zod defaults, which
  renders identically to today (Section 1's no-op guarantee) — no migration
  script needed.
- **Negative Mode "Suppress" with existing `negativePrompt` text**: text is
  preserved in the record and Markdown export; only excluded from the
  ComfyUI graph while suppressed. Switching back to `template` immediately
  restores it with no data loss.
- **Style deleted after being applied to a character**: no effect, same as
  every other style field — applying a style is a one-time copy.
- **Preset edited or removed in `config.yaml` after being applied to
  characters/styles**: no retroactive effect. `presetId` is a display-only
  label captured at apply time (mirrors `styleSourceName`); the actual
  `leadTags`/`qualityTagsPositive`/`negativeMode`/`qualityTagsNegative`
  values were already copied.
- **Checkpoint doesn't obviously match any preset's intended family**: no
  validation ties `checkpoint` to `promptAdapter` — there's no reliable way
  to infer model family from a checkpoint filename, so the user is free to
  pick any preset (or "Custom") regardless of the checkpoint chosen.

## Testing

- **Unit tests** (`test/prompt-adapter.test.ts`): `applyPromptAdapter()` —
  positive segment ordering, empty-segment skipping (no stray leading/
  trailing commas), negative `template` join, negative `suppressed` always
  returns `''`, and the all-default-adapter-is-a-no-op case.
- **Schema tests**: `PromptAdapterSchema` defaults;
  `PromptAdapterPresetSchema` round-trips through `config.yaml`;
  `ConfigSchema.parse({})` produces all 8 default presets in full.
- **Config migration test**: an existing `config.yaml` missing the
  `prompt-adapter-presets` section gets it added on load (mirroring the
  existing missing-section migration test pattern for `phase-prompt`/
  `comfy-ui`, if one exists).
- **Style/Character schema tests**: `promptAdapter` field defaults and
  validation, mirroring existing `style.schema`/`character.schema` tests.
- **Route tests**: applying a style copies `promptAdapter` onto the
  character (extends the existing style-apply route test).
- **`execution.service.ts` test**: `buildGraph()` — identityBlock/
  negativePrompt sourceValues get adapter-wrapped before phase-prompt
  wrapping is applied; a suppressed negative resolves to `''` in the final
  graph.
- **Manual verification**: create an Illustrious-preset style, apply to a
  character, generate, and confirm the submitted graph's positive prompt
  reads `1girl, masterpiece, best quality, amazing quality, photo of a
  ...`; create a Flux-preset style and confirm the negative-prompt node
  input resolves to an empty string; edit `config.yaml` to add a new
  custom preset key and confirm it appears in the Style form dropdown on
  the next request (no restart needed, since config is read live).

## Explicitly out of scope

- Changing how `compileIdentityBlock()` renders `Attributes` into text —
  attribute rendering stays natural-language regardless of the chosen
  prompt adapter. A tag-based preset (Illustrious/Pony) will still produce
  a natural-language fragment inside the identity block; this is a
  documented secondary capability those models tolerate, not a broken
  state.
- Per-attribute template/placeholder ordering (e.g.
  `{face_shape}, {hair}, {skin_tone}`) — research didn't surface a
  well-established per-family convention for ordering individual
  descriptive attributes among themselves (only for where segments like
  quality/count/score tags sit relative to the whole description), so this
  isn't included.
- Any live/bound relationship between a Style's `promptAdapter` and a
  character's copy of it, or between a config preset and characters/styles
  that were seeded from it — all copies are one-time snapshots, consistent
  with the rest of the Style registry design.
- Auto-detecting or validating that a chosen `promptAdapter` matches the
  selected `checkpoint`'s actual model family — no such inference exists or
  is planned; the user chooses both independently.
