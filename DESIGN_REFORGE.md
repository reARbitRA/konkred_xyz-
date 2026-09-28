# DESIGN REFORGE — OBSIDIAN SIGNAL / BLACKSITE FORGE

KONKRED reforged from a cool-slate/amber "void" theme into a warm-black,
chalk-grained industrial control system with a single red machine-signal
accent. This document is the audit, the token contract, and the build log.

---

## 1. CURRENT-STATE AUDIT (before reforge)

| Area | Finding |
|---|---|
| Framework | React 19 + Vite SPA, custom history router in `App.tsx`, Express server (`start.ts` / `server.ts`) |
| Styling | Tailwind **CDN** configured inline in `index.html` + `styles/globals.css` + `styles/brutal.css` (`--k-*` token system) |
| Identity | Cool slate blacks `#0B0F14`, amber accent `#D98A2E`, plus stray cyan/violet/lime/emerald accents and a hardcoded `#FF003C` REDAEYE red |
| Fonts | Inter (body), IBM Plex Mono (machine), Archivo Black referenced but not loaded |
| Texture | External PNG from transparenttextures.com (third-party runtime dependency) |
| Purpose | Catalogue of 36 evidence-linked AI workflow products + AUDITOR / fullKONK_> / REDAEYE flagship tools |
| Conversion | Enter catalogue → open suite/tool → run demo / pricing / enterprise contact; Join-waitlist secondary |
| Tests | vitest suite incl. `no-fakes` copy scanning; Playwright e2e asserting landing button names (`Open AUDITOR`, `Open fullKONK`) and headings — preserved verbatim |

Weaknesses: three parallel color systems (Tailwind names, `--k-*` vars,
hardcoded hexes), multi-hue accents diluting the brand, glow used on the
background, soft SaaS gradients in the mobile drawer, no grain/texture system,
no centralized interaction law.

## 2. STRATEGY — RETHEME AT THE TOKEN LAYER, REBUILD THE FLAGSHIP SURFACES

Because every route consumes named Tailwind colors (`void-*`, `signal`,
`neon-cyan`, `amber-*`, `zinc-*`, …) and `--k-*` vars, the entire app is
retuned by remapping those names to the Obsidian Signal ladder — no page logic
touched, no route broken. Then the highest-impact surfaces are rebuilt by hand.

### Token contract (single source of truth)

Canvas: `--obsidian #0a0908`, `--carbon #0d0c0b`, `--ash-surface #171514`,
`--well #100e0d`, `--raised #1d1a18`.
Signal (only core accent): `--signal #d60019`, `--signal-hot #ff1a2e`,
`--signal-deep #8f0010`, washes/lines for containment.
Warm neutrals: `--ink #f4f1eb` → `--ghost #3d3835`, hairlines `--line #2a2624`.

Tailwind palette remap (global, in `index.html` CDN config):

| Old family | New role |
|---|---|
| `amber` / `yellow` / `orange` / `red` / `rose` | signal-red ladder |
| `purple` / `violet` / `fuchsia` / `pink` | deep-red ladder (secondary signal) |
| `cyan` / `teal` / `sky` / `blue` / `indigo` | warm bone/ash ladder (was 2nd accent → now rests ash) |
| `emerald` / `green` / `lime` | warm bone ladder (success = warm-white marker + stamp, never green) |
| `zinc` / `gray` / `slate` / `neutral` / `stone` | warm neutral ladder |
| `white` / `black` | `#f4f1eb` / `#060505` (never pure) |
| `void-*`, `clinical`, `metal`, `ghost`, `signal`, `caution`, `neon-cyan` | mapped to the ladder above |

`--k-*` vars in `styles/brutal.css` remapped the same way; `theme-light`
becomes a warm **evidence-paper** mode (stamped-document look), not a generic
light theme.

### Visual laws enforced

1. Background never glows — canvas is matte obsidian with barely-visible
   smudges; the red wash is ≤ 0.04 alpha.
2. Red = live / armed / selected / committed. Rest state is ash.
3. `.signal-item` interaction law: ash at rest → ignites `--signal-hot` with
   tight+wide glow on hover/focus only.
4. Chalk grain: inline SVG `feTurbulence` data-URI overlay (`body::after`),
   `mix-blend-mode: overlay`, no external assets, hidden from screen readers,
   static under reduced motion.
5. Hazard tape reserved for: header cap, command band, footer boundary.
6. 0 border-radius globally (already enforced), hard offset shadows, chamfered
   corners (`.k-chamfer`) on major plates with plain-border fallback.

### Typography

- **Archivo Black** — display (`.k-title`, `.font-display`), ALL CAPS, tight.
- **Archivo** (400–900) — workhorse UI sans (replaces Inter; warm grotesque).
- **JetBrains Mono** — machine labels, IDs, status, 10–12px, 0.22–0.38em
  tracking (replaces IBM Plex Mono at the token layer; Plex kept as fallback).
- **Special Elite** — typewriter prose for editorial/manifest copy
  (`.font-prose`).
- Ghost numerals: `.ghost-num` outlined Archivo Black, `aria-hidden`.

## 3. COMPONENT INVENTORY

New primitives — `components/system/primitives.tsx`:
`SectionHead`, `GhostNumber`, `Keycap`, `SignalButton`, `Stamp`, `StatusDot`,
`DataRow`, `HazardTape`, `Panel`, `MachineLabel`, `SystemTicker`, `Frame`,
`Rail`, `CommandCard`, `InputWell`, `EmptyState`. The landing page consumes
`CommandCard` + `SystemTicker` directly; the StyleGuide (`/style-guide`)
renders the full library as living documentation.
`SignalCursor` (`components/system/SignalCursor.tsx`) is a trailing
targeting reticle that ignites over interactive targets. Hard guards: it
only mounts on `(pointer: fine)` devices, is disabled under
`prefers-reduced-motion`, never hides the native cursor, is `aria-hidden`
with `pointer-events: none`, and runs a single transform-only rAF loop.

`Loader` (`components/common/Loader.tsx`) — the app-wide Suspense
fallback — is a machine scan reticle (stepped conic sweep inside a
registration frame) with `role="status"` semantics, replacing the generic
glowing spinner.
CSS primitives — `styles/brutal.css`: `.signal-item`, `.k-panel-plate`,
`.k-chamfer`, `.k-hazard`, `.k-keycap`, `.k-stamp-box`, `.k-well`,
`.k-blueprint`, `.k-scanlines`, `.ghost-num`, `.hollow`, `.k-rivet`.

Rebuilt surfaces:
- `index.html` — head: fonts, full palette remap, canvas smudge, grain, focus,
  scrollbar, btn/card bases.
- `pages/LandingPage.tsx` — signal header, hazard cap, dual ticker, hero with
  ghost numeral + typewriter, four command modules (same routes/test-ids/
  button names), telemetry strip, command band, footer strip.
- `components/Navbar.tsx` — signal header: ash-at-rest links that ignite,
  machine-control CTAs, industrial mobile drawer (no gradients, no pills).
- `components/SystemFooter.tsx` — FooterArchive: giant outlined wordmark,
  directory rails, product-family data rows, build stamp.
- `components/LoadingScreen.tsx` / `components/brand/KonkredLogo.tsx` /
  `components/brand/PageTransition.tsx` — retuned to signal tokens.
- All other routes inherit the system via the token remap + a global sweep of
  hardcoded cool-hex values (`#0B0F14→#0d0c0b`, `#FF003C→#ff1a2e`, …).

## 4. ACCESSIBILITY DECISIONS

- Focus: 2px `--signal-hot` outline + 1px offset everywhere (`:focus-visible`).
- All decorative layers (`grain`, tickers, ghost numerals, scanlines)
  `aria-hidden` / `pointer-events:none`.
- `prefers-reduced-motion`: all animation collapsed to 0.01ms; tickers stop;
  state changes remain visible.
- Real `<a>`/`<button>` semantics preserved; drawer buttons are buttons;
  icon-only controls carry `aria-label`.
- Contrast: body `#eae7e1` on `#0a0908` ≈ 15:1; muted `#b7b2a9` ≈ 9:1; red is
  never used for body copy, only labels ≥ bold 10px mono or large display.
- No hover-only affordances: every hover state has a focus twin; primary
  actions are labeled buttons, not zones.

## 5. IMPLEMENTATION PHASES

1. **Token core** — `index.html`, `styles/globals.css`, `styles/brutal.css`. ✔
2. **Primitives** — `components/system/primitives.tsx`. ✔
3. **Flagship surfaces** — Landing, Navbar, SystemFooter, LoadingScreen,
   PageTransition, KonkredLogo. ✔
4. **Global sweep** — hardcoded hex retune across pages/components
   (REDAEYE, fullKONK console, catalogue floor inherit via tokens). ✔
5. **Validation** — `npm run typecheck`, `npm run test`, `npm run
   build:client`, manual responsive pass via dev server. ✔
6. **Deep sweep + enforcement** — exhaustive audit of every hex literal in
   `pages/` and `components/` (fullKONK console syntax colors, BlogHub acid
   lime, checkout ambers, mint success-greens, provider brand blues → warm
   ladder / signal / rare `--high`/`--medium` severities). The platform
   `Shell` (pricing/sprint/enterprise/partners/validation/kits) upgraded to
   the full page grammar (system context strip, ghost numeral, typewriter
   lead). CommandPalette rows converted to real `<button>`s with
   signal-wash selection. ✔
7. **Design-law test suite** — `tests/design-system.test.tsx` permanently
   enforces the system in CI: bans the legacy identity hexes and any
   cool blue/green/cyan hex literal in `pages/`+`components/`, asserts the
   token contract, reduced-motion + branded focus presence, inline-SVG
   texture (no third-party assets), and renders the landing / footer /
   loader / 404 / cursor-guard contracts in jsdom. ✔

## 6. CONSTRAINTS & NOTES

- Playwright e2e copy contracts kept: `Open AUDITOR`, `Open fullKONK`,
  landing test-ids, catalogue heading, 404 copy.
- `no-fakes` test scans source for banned claims — all copy remains factual;
  no invented metrics.
- Tailwind stays on CDN (repo convention); the palette remap lives in one
  place (`index.html`) and mirrors `:root` tokens in `styles/brutal.css`.
- REDAEYE keeps its red-dominant identity — now expressed with the shared
  signal ladder instead of a private `#FF003C`.
