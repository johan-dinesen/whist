# Whist v0.2.14 · Profilbilleder uden blink

Frontend-only update of `Statistik`, based on v0.2.13. This addresses the brief initials flash (e.g. `D` instead of David's picture) when Tidsmaskinen advances or Meldingsstatistik switches between `Vis værdier` and `Vis afvigelse`.

## Installation

Replace these three files in your GitHub Pages repository:

- `statistik.html`
- `assets/js/stats.js`
- `assets/css/app.css`

Do not change any other file. No Supabase SQL migration is needed.

## What changed

1. Pointdiagram/Tidsmaskinen keeps the same DOM node, including the same loaded image, for each player as the scores, ranks and game counts change. It only creates/removes a player column if the selected player set changes.
2. Meldingsstatistik's `Vis afvigelse` control updates only the numeric table cells. It never recreates the player headers or their images.
3. The shared avatar renderer on the Statistik page loads/decodes each profile once per page and remembers the result. Already-loaded photos are visible immediately on subsequent renders; nonexistent photos continue to use initials, without repeated failed requests.
4. Disabled the redundant image fade-in on an already-loaded photo.

The first time an actual photo is fetched on a new page visit, an initial may still be visible briefly until the initial network load completes. This is unavoidable without delaying the initial UI, but subsequent redraws do not expose initials.

## Verification

`tests/browser.py` (not part of deploy archive) uses offline Chromium at 320, 390 and 900 pixels. It checks that the exact same avatar image elements survive repeated Tidsmaskinen frames, that the same header images survive `Vis afvigelse`/`Vis værdier`, that new table renders reuse previously decoded photos, and that there are no page errors or horizontal page overflow. Tests do not connect to the live Supabase project.
