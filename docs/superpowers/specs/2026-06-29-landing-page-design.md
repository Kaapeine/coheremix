# Landing Page Design — CohereMix

**Date:** 2026-06-29  
**Status:** Approved for implementation

---

## Overview

Add a landing page at `/` that introduces CohereMix to new visitors, explains the core value proposition, and links to key entry points. Move the existing Library screen from `/` to `/library`. Workspace routes are unchanged.

---

## Route Changes

| Route | Before | After |
|---|---|---|
| `/` | Library | Landing (new) |
| `/library` | — | Library (moved) |
| `/c/:id` | Workspace | Workspace (unchanged) |

---

## Page Structure

### 1. Header
- Brand mark (existing SVG) + "CohereMix" wordmark, left-aligned
- "Open Library" link/button, right-aligned — ghost style, navigates to `/library`
- Reuses existing `.header` class; no "New comparison" button here (that belongs to the hero)

### 2. Hero
- Large headline (placeholder copy, user will rewrite)
- Short sub-paragraph describing the tool: mix + reference, side-by-side analysis, no plugin switching
- Two CTAs:
  - **New comparison** — `.btn-primary`, opens upload modal or navigates to `/library` with modal open
  - **View sample** — ghost/outline button, navigates to a pre-loaded sample comparison at `/c/sample`

### 3. Pitch Strip
Three short bullet points emphasizing the side-by-side value:
- Everything visible at once — both tracks, no toggling
- See the delta instantly — all metrics show A, B, and the difference
- No plugin switching — LUFS, spectrum, stereo in one place

### 4. Metrics Section
Grouped by category, using existing `.tile` visual style. Each group has a category label and metric tiles showing the metric name + one-line "why it matters" description.

**Loudness**
- Short-term LUFS — how loud each section feels in real time
- Integrated LUFS — overall loudness across the whole track

**Frequency**
- LTAS — long-term average tonal balance, where each track sits in the frequency spectrum
- Live spectrum — real-time frequency view, holds on pause for detailed comparison

**Stereo**
- Side/Mid ratio — how wide each track is, per frequency band
- Goniometer — real-time stereo field visualization, A and B side by side

### 5. Footer
- Brand mark + name
- Tagline: placeholder ("Built for mix engineers" or similar, user will rewrite)

---

## Visual Design

- Follows existing dark aesthetic exactly: `--bg`, `--surface-1`, `--line`, `--tx-1/2/3`, `--a`/`--b` palette
- No new design tokens or CSS custom properties
- Metric tiles reuse existing `.tile` / `.tile-l` / `.tile-vals` classes where possible, or a landing-specific variant that matches the same visual weight
- Ghost button: `border: 1px solid var(--line)`, hover `border-color: var(--line-strong)` — matches existing card hover pattern
- Page is a single scroll; no animations or transitions beyond existing hover states
- Copy is placeholder; user will rewrite all text

---

## Sample Comparison

"View sample" links to `/c/sample`. Implementation scope for the sample:
- A hardcoded sample comparison ID or a static fixture served by the backend
- Exact approach (fixture vs. seeded DB entry) to be decided during implementation
- Out of scope if not feasible quickly — button can be hidden or disabled until ready

---

## Out of Scope

- Authentication / user accounts
- Marketing analytics or tracking
- Animations or scroll effects
- Mobile-specific layout (match existing app behavior)
