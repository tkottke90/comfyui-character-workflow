---
name: tdk-design
description: Use this skill to generate well-branded interfaces and assets for TDK_Design (personal brand), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Key facts: link `styles.css` for all tokens; green (`--accent`) is brand/action, blue is neutral/link/focus, chestnut rose is danger; Source Sans 3 (headings = weight 900), Source Code Pro for code; Lucide icons, 2px stroke; soft 6–14px corners; border-first elevation; springy motion (`--ease-spring`). Preferred shell: green sidebar (`ui_kits/layouts/sidebar-layout.html`). Dark theme via `data-theme="dark"` on `<html>`.
