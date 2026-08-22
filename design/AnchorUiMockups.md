# Anchor UI Mockups (v1)

This is the visual counterpart to the design document's §7 (Views) and §8 (Progress model) — a multi-artboard mockup canvas turning that spec into an actual look-and-feel, built with Claude Design's canvas editor and published as a Claude Artifact.

**Current, canonical link:** https://claude.ai/code/artifact/33a4ebc1-bdd6-4895-a0bc-4c72f1dac923

**A note on stale links:** an earlier version of this canvas was published to a different artifact (`.../artifact/7bf32cb2-2352-4e47-a769-20d6cc5a5b27`). That link is stuck on an old dark "darkroom" aesthetic (amber/teal, IBM Plex/Space Grotesk) that has since been fully replaced — the session that built it hit a network-allowlist block that prevents reading the artifact back before overwriting it, so updates had to go to a new URL instead. **Treat the `7bf32cb2` link as obsolete.** Only `33a4ebc1` is current. If that allowlist gets fixed in a future session (environment settings → Code → Network access → Custom → allow `*.frame.claudeusercontent.com`), the two could in principle be reconciled, but there's no need to — `33a4ebc1` is the one to keep using and updating.

## Design system

The canvas is built in **TDK_Design** — Thomas's own personal-brand design system (not something invented for this project), supplied as a folder of tokens, component specimens, and guidelines. Summary of what governs every screen:

- **Color:** apple green is the brand/action color (sidebar, primary buttons, "locked"/"frozen" states); steel-blue is the neutral backbone (borders, muted text, links, info states); chestnut-rose is reserved strictly for danger/warning — it never appears on a normal status; a distinct cooler green marks success/complete states so they don't read as plain brand color.
- **Type:** Source Sans 3 (headings differentiated by weight — 900 — not a different family), Source Code Pro for mono/technical readouts (seeds, dimensions, timestamps).
- **Shape/elevation:** soft 6–14px radii, border-first elevation (a 1px border plus a faint shadow, never a heavy glow or blur), **no gradients or textures anywhere** — this is an explicit rule in the source system, so all "generated photo" placeholders are flat steel-blue-tinted blocks with an icon, not the colorful gradients the first draft used.
- **Shell:** a 240px green sidebar (logo + Characters/Templates nav) replaces the old horizontal top bar; breadcrumbs replace the old back-chevron button.

## Canvas structure

Two pages:

- **Flow** — one artboard (`Main`), the phase-by-phase flow map (Character List → Draft → Casting → Refinement → Anchor kit → Downstream/Dataset → lora-trained), plus the Template Library as a side node and three cross-cutting guarantee callouts. Deliberately kept as a single continuous diagram rather than split per phase, so the connecting arrows stay legible at a glance.
- **Screens** — 18 artboards laid out in a grid, grouped into four labeled rows plus a template cluster:

| Row | Artboards | What it shows |
|---|---|---|
| ① Entry & Spec | CharacterList, CharacterOverviewDraft, CharacterOverviewComplete, SpecBuilder | The character list as an image gallery (card per character: photo, name, status); the same Overview screen shown twice — Draft (Kwame Asante, nothing built yet) beside Kit-complete (Rin Takahashi, everything built) — to demonstrate the same screen changing by status; the live-compiling spec form. |
| ② Casting & Lock | CastingPreflight, CastingBatch, WinnerAudit | Pre-flight gated on a checklist, a live seed-sweep batch mid-run, and the forced attribute-by-attribute audit before a seed can lock (Marguerite Dubois, with a deliberately flagged build mismatch mirroring the guide's own worked example). |
| ③ Refinement & Kit Build | RefinementChain, FaceCrop, ViewGeneration | The three-step face-detail→cleanup→upscale chain, the adjustable crop tool, and view generation running several view-cards at once with the reorientation toggle on each. |
| ④ Polish, Validate & Track | PolishLocked, PolishActive, DownstreamValidation, DatasetTracking | Targeted fixes shown locked beside the same screen unlocked (polish accepted); the three throwaway downstream checks; dataset/training progress tracking. |
| Templates | TemplateLibrary, TemplateDetail, TemplateUpload | The not-character-scoped template grid; a single template's detail view (usage list, replace/remove); the upload flow (dropzone, name, silhouette-vs-OpenPose type, gated "Add to Library" button). |

Real data threads through every screen instead of placeholder text: Rin Takahashi's actual locked seed and identity-block text, Ailsa MacLeod as locked, Marguerite Dubois's actual seed range, and Kwame Asante's build attribute from Spec Builder is the same "inverted triangle" template shown used by two characters in Template Detail.

## Key decisions (dated log)

**2026-08-21**

- **Static, non-clickable mockups**, not an interactive prototype — the goal at this stage was settling the visual language and confirming the progress model reads correctly, not wiring up real interaction. Revisit this choice before an actual build.
- **Character List is an image gallery** (card per character: photo above name and status) rather than a row list, per direct request.
- **Entire canvas rebuilt from a first-draft dark "darkroom" aesthetic into TDK_Design**, the user's real personal-brand system, once it was supplied. The dark version should be considered fully superseded — see the stale-link note above.
- **Template Library was split into three screens** (grid, single-template detail, upload flow) rather than the one combined view the design document's §7.12 sketches in prose — browsing, inspecting usage, and uploading turned out to want different layouts once actually drawn.
- **Each of the 18 screen panels was also exported as a standalone, self-contained HTML file** and saved into the project under `mockups/` (see table below), so individual screens can be opened, downloaded, or reviewed one at a time without loading the full multi-artboard artifact. Each file has fonts linked and the logo embedded as a base64 data URI — no external dependencies besides Google Fonts.

## Standalone HTML exports

Each panel from the canvas is also saved as its own file in this project, under `mockups/`:

| Screen | Project path |
|---|---|
| Flow map | `mockups/Main.html` |
| Character List | `mockups/CharacterList.html` |
| Character Overview (Draft) | `mockups/CharacterOverviewDraft.html` |
| Character Overview (Complete) | `mockups/CharacterOverviewComplete.html` |
| Spec Builder | `mockups/SpecBuilder.html` |
| Casting Pre-flight | `mockups/CastingPreflight.html` |
| Casting Batch | `mockups/CastingBatch.html` |
| Winner Audit | `mockups/WinnerAudit.html` |
| Refinement Chain | `mockups/RefinementChain.html` |
| Face Crop | `mockups/FaceCrop.html` |
| View Generation | `mockups/ViewGeneration.html` |
| Polish (Locked) | `mockups/PolishLocked.html` |
| Polish (Active) | `mockups/PolishActive.html` |
| Downstream Validation | `mockups/DownstreamValidation.html` |
| Dataset Tracking | `mockups/DatasetTracking.html` |
| Template Library | `mockups/TemplateLibrary.html` |
| Template Detail | `mockups/TemplateDetail.html` |
| Template Upload | `mockups/TemplateUpload.html` |

These are plain, renderable HTML — not the Claude Design canvas (`.dc.html`) source format, so they can't be dropped back into the canvas editor unmodified. They're a durable, individually-viewable snapshot of each screen as of 2026-08-21; if the canvas is revised later, re-export and overwrite these paths to keep them in sync (they will silently drift out of date otherwise — nothing currently re-generates them automatically).

## Caveat for future sessions

This canvas is a look-and-feel reference, not a build spec — if an actual implementation ever diverges from a mockup on some interaction detail, the design document's §2 (constraints) and §4 (behavior) are still the source of truth, not the pixels here.

The `.dc.html` **canvas-editor source files** used to build this canvas live only in the cloud session's temporary workspace and are **not** saved anywhere durable — a future session that needs to edit these mockups further (in the canvas editor, with live artboards and annotations) should use the design skill's `--extract` flow against the live artifact URL above to pull working files back out, rather than assuming the originals still exist somewhere. The standalone `mockups/*.html` files above are a separate, already-durable copy, but they are exports, not canvas-editor-compatible source.