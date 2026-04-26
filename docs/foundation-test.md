# Rentmies Ads Engine — FASE 1 Foundation Test

The `/dashboard` route renders the FASE 1 visual foundation. Take a screenshot
here and save as `docs/foundation-test.png` after verifying the checklist below.

## How to verify

1. Deploy the branch to Vercel (auto-deploys on push to `main`).
2. Open `https://rentmies-ads-engine.vercel.app/dashboard` (or `/dashboard/`).
3. Compare against the SKILL spec in `.claude/skills/ads-engine-brand/SKILL.md`.

> The working app at `/app` is untouched — all Instagram publishing, multi-post
> scheduling, AI captions/images, Meta credentials, and WhatsApp templates
> continue to work there. FASE 1 is greenfield foundation.

## Visual checklist

- [ ] **Page background** is warm `#f6f3ee`, not white, not gray
- [ ] **Camilord panel** (right 320px) is pure black `#000000` with a subtle
      teal radial glow top-right
- [ ] **Left rail** (64px) is dark green-black `#0f1410` with a teal
      square logo "C" cap at the top
- [ ] **Top nav** is white with a `1px var(--rm-border)` bottom border
- [ ] All three fonts loaded: **Inter** (UI body), **Instrument Serif italic**
      (display "Fuel your Ads: Villa Victoria Luxury"), **JetBrains Mono**
      (eyebrow "CREATIVE STUDIO · CAMPAÑA NUEVA", stat labels, badges)
- [ ] Cards (`.ae-formcard`) are white with `1px solid #e8e3dc` border, 6px
      radius, and the XS shadow only (~1px Y, 4% opacity)
- [ ] **Active rail item** has a 3px teal accent bar at its left edge
- [ ] **Active topnav link** ("CREATIVE STUDIO") has green-deep color +
      2px green-deep bottom border
- [ ] **AI badge** ("AI Active", "4 generados", "Camilord active") shows a
      pulsing teal dot (~1.6s ae-pulse animation)
- [ ] **Live status pill** shows the same pulsing dot
- [ ] **Status pills** (scheduled / pending / paused) use semantic colors
      from the SKILL palette
- [ ] **Recommendation block** (deep green) shows a giant rotated mint bolt
      at ~12% opacity in the bottom-right corner
- [ ] **Page rises in** with a stagger (`ae-rise` 200ms delays of 60/120/180/240ms)
- [ ] Buttons: dark ink primary, deep green authority, ghost white-with-border;
      all press to scale(0.98) on click
- [ ] Inputs: surface-2 background, focus shifts to white + 3px teal halo
- [ ] Camilord shows "Listo para asistir" + the editorial italic quote
- [ ] Camilord chat input lifts to teal border on focus

## Captures expected

- Desktop ≥ 1280px width — full 3-column shell visible
- Mobile ≤ 768px — Camilord hides, rail stays at 64px, content stacks

## Known gaps (deliberate — FASE 2/3 work)

- Top nav links don't route yet — they only update active state.
  `showPage()` logs intent to console.
- Rail clicks update active accent but don't navigate.
- Camilord chat send button is a no-op.
- Suggestion items don't apply suggestions.
- No data is wired to any of the displayed numbers.

These are FASE 2 (port functionality) and FASE 3 (replace `/app` with the
new shell). FASE 1 is foundation only — visual + interaction primitives.
