# TDK_Design — Personal Design System (v1)

Personal branding system for TDK's own tools, websites, and projects. Not a company product: one person's brand, applied to anything they build — dashboards, utilities, marketing pages, chat tools. Built from scratch in this project (no external codebase or Figma source); colors were provided by the owner, all other decisions were made interactively with them (Aug 2026). **Accepted as V1 on Aug 21, 2026.**

**Sources:** owner-provided color palette (apple green / steel blue / chestnut rose ramps), owner-uploaded logo SVG (`assets/logo.svg`, "treemotif"). No Figma files, repos, or decks were provided.

## Content fundamentals

- **Voice:** friendly & casual, but technically precise — short declarative sentences, contractions welcome ("This can't be undone."), exact numbers and units when they matter ("File exceeds 10 MB.").
- **Person:** the product speaks to *you* ("your dashboard"); first person only in the owner's own voice on marketing pages.
- **Casing:** sentence case everywhere — headings, buttons, labels. Never Title Case or ALL CAPS (except tiny mono token labels).
- **Buttons:** verb-first, specific: "Save changes", "Delete project" — not "OK"/"Submit".
- **Errors:** plain and human: "That doesn't look like an email" — never codes or blame.
- **Emoji:** not used in UI. A ✓ or × glyph inside a styled element is fine; emoji characters are not.
- **Vibe:** a well-tended garden — calm, organic, orderly.

## Visual foundations

- **Color:** apple green is the brand: sidebar (light `apple-200` / dark `apple-900`), headers (`--header-*`: light `apple-50`; dark `apple-800` — lighter than the main surface so the header reads as the upper layer), primary buttons (`--accent`), selection, checked states. Steel blue is the neutral backbone: page bg (`steel-blue-50`/`950`), borders, muted text, **links and focus rings (blue, deliberately not green)**. Chestnut rose = warning/danger only. Success is a *distinct* cooler green (`#22824a`) so status never reads as brand. Max two background colors per view (page bg + white cards).
- **Themes:** light default; dark via `[data-theme="dark"]` on `<html>`. Owner preference is system-following — set the attribute from `prefers-color-scheme`. Dark keeps the green sidebar ("Dark 1"), navy card surfaces `steel-blue-900`. Sidebar text/logo colors come from `--sidebar-fg` / `--sidebar-logo-filter` — never hardcode white.
- **Type:** Source Sans 3 only, headings differ by **weight (Black 900)** with -0.01em tracking, body 400 @ 15px/1.55. Source Code Pro for code, tokens, numeric readouts. Both from Google Fonts (see caveat in Iconography/fonts note).
- **Spacing:** 4px base scale, comfortable density; content column max 960px; sidebar 240px; single-action card max 400px.
- **Corners:** soft — 6/8/10/14px (`sm/md/lg/xl`); pills for badges and switch.
- **Elevation:** border-first. Every surface keeps a 1px `--border` line; shadows are crisp and faint (`--shadow-card` → `--shadow-overlay`). No heavy blur, no glow.
- **Layer stack (highest → lowest):** Drawers & Dialogs (`--z-overlay`) → Toasts (`--z-toast`) → Headers (`--z-header`) → Main Content (`--z-main`) → Sidebars (`--z-sidebar`). Each layer casts a shadow onto the one below so the stacking reads visually: main content floats above the sidebar (`--shadow-layer-main`, cast left onto the aside), headers float above main content (`--shadow-layer-header`, cast down). Dialog and ToastStack consume these z tokens.
- **Backgrounds:** flat token colors only. No gradients, no textures, no background imagery.
- **Motion:** smooth + springy — entrances scale/rise with `--ease-spring` (overshoot), exits slide/fade with `--ease-out` (drawer dismiss), presses scale to .97, color changes use `--ease-out`; 120/200/320ms. No bounces on exit. Planned (see Motion & Focus card): toast enter/exit, dialog exit, tab indicator slide, switch travel, expand/collapse, loading shimmer, `prefers-reduced-motion` support.
- **Hover:** background shifts one step (darker on green fills, sunken tint on neutrals). Press: scale .97. Focus: 2px steel-blue outline offset 2px.
- **Transparency/blur:** essentially none — only the dialog scrim (`--scrim`) and the sidebar's white-at-8% hover.
- **Cards:** white (navy in dark), 1px border, 10px radius, faint shadow, 20px padding; optional divided header row with 900-weight title.
- **Layout:** preferred shell is the two-column sidebar layout (green nav aside + main). Responsive Mobile→Desktop: sidebar collapses to a horizontal top bar under 720px.
- **Imagery:** none baked into the brand yet — no photography treatment defined. Ask the owner before adding imagery.

## Iconography

- **Icon set: Lucide** (owner's pick), 2px stroke, `stroke="currentColor"`, no fill. Components embed the handful they need as inline SVG paths (check, chevron, send, x) so nothing external is required; for larger icon needs load Lucide from CDN (`https://unpkg.com/lucide@latest`) or copy individual SVGs from `lucide-static`. Match 2px stroke weight — don't mix filled icon sets in.
- No icon font. No emoji-as-icons. Unicode glyphs only for chevrons (›) in breadcrumbs and × dismiss affordances.
- **Logo:** `assets/logo.svg` — a full-color tree motif (circuit-branch lines in blue-grey `#4b636e`, leaf greens `#689f38/#99d066/#387002`, brown trunk). Use full color on light surfaces; on green or dark backgrounds flatten to a white silhouette via `filter:brightness(0) invert(1)`. The upload arrived with its stylesheet stripped; the owner supplied the original defs, now restored verbatim. No other marks exist; where a mark is unavailable, set "TDK_Design" in Source Sans 3 Black.

## Intentional additions

No source defined a component inventory, so a standard set was authored to the owner's brief (buttons, elevated surfaces, toasts, forms, chat, tabs, breadcrumbs, progress). `SidebarNav` and `Field` were added beyond the brief as load-bearing pieces of the two-column layout and label-above form rule.

## Components

Core: `Button`, `IconButton`, `Badge` · Forms: `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch` · Surfaces: `Card`, `Dialog`, `Drawer` · Feedback: `Toast`, `ToastStack`, `ProgressBar`, `Stepper` · Navigation: `SidebarNav`, `Tabs`, `Breadcrumbs` · Chat: `ChatBubble`, `ChatToolCall`, `ChatComposer`

`Dialog` and `Drawer` are both built on native `<dialog>` and share the blurred #222/33% backdrop; Drawer slides from left/right with ease-out. `SidebarNav` enforces a 3-row aside: header (logo + title), navigation (flex-grow page links), actions (`actionItems` links + arbitrary `actions` nodes, e.g. settings, avatars, toggles).

## Index

- `styles.css` → `tokens/` (`colors.css`, `typography.css`, `layout.css`, `base.css`) — all tokens; fonts via Google Fonts `@import`.
- `components/{core,forms,surfaces,feedback,navigation,chat}/` — the 22 components above, each with `.d.ts` + `.prompt.md`; specimen cards per group.
- `guidelines/` — foundation specimen cards (color ramps, themes, type, spacing, radii, elevation, motion doctrine + roadmap, logo).
- `ui_kits/layouts/` — four canonical layouts (sidebar, single-action, stacked, blog post), interactive, browsable via `index.html`.
- `assets/logo.svg` — brand mark.
- `SKILL.md` — agent skill entry point.

## Caveats

- Fonts load from Google Fonts CDN (`@import` in `tokens/typography.css`); no font binaries are shipped. If offline use matters, drop the `.woff2` files in and add `@font-face` rules.
- Logo stroke weight (4px) was reconstructed — superseded: owner supplied the original defs; the mark is now full-color as designed.
