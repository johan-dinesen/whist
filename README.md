# Whist v0.2.12 — Hænder og mindre podie

Frontend-only update to the existing Statistik page, based on v0.2.11.

## Install

Replace these **three** files in your existing GitHub Pages repository:

- `statistik.html`
- `assets/js/stats.js`
- `assets/css/app.css`

Keep all other files unchanged, including `assets/js/hands-model.js`, Supabase configuration, SQL functions, and every other statistic module.

After committing and pushing, refresh the Statistik page and confirm `v0.2.12`.

## Changes

1. Hænder uses short display names `Bord` and `Ren Bord` for `Bordlægger` and `Ren Bordlægger`. The database call types are unchanged.
2. The first three Hænder columns (`Melding`, `Antal`, `Gns.`) stay together when scrolling horizontally. Their sticky offsets are computed from the rendered column widths, so they stay aligned on mobile and desktop. Sticky cells use opaque backgrounds and a boundary rule so that player data does not show through.
3. The top-three Stilling podium is shorter: blocks retain descending heights, but have less empty vertical space, with the `spil` counts aligned near the bottom.

No SQL migration or new dependencies. No changes to score calculations, statistics, tournament filters, profile photos, or authentication.

## Verification

The update passed `node --check` for `stats.js` and a headless Chromium visual/layout fixture at 320, 390, 620, and 900 px. Checks included fixed column x positions after horizontal scrolling, shorter podium sizes, and rendering of both Bord labels. The screenshot fixture uses illustrative player data; this update has not been exercised against the live Supabase project.
