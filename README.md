# Whist v0.2.0 — Statistik, module 1: Stilling

This is an incremental update to the currently deployed Whist GitHub Pages site
(after the profile-picture administration update v0.1.11).

## What is included

- `statistik.html`: new Statistik page. First module only: podium for places
  1–3, then a ranked list of every remaining player. Switch to
  `Pointfordeling` to view two static doughnut/pie charts.
- `assets/js/stats.js`, `assets/js/ranking-model.js`: UI and ranking model.
- `assets/js/notes.js`: single shared Spilsamlinger filter, also used by Historik.
  It keeps Kredsspil first, newly created tournaments next (newest first),
  and the five historical categories in their requested order. The selected
  categories and `Medtag gæstespil` are shared *within the same browser tab*
  when switching between Historik and Statistik via sessionStorage.
- `assets/js/history.js`: existing Historik refactored to use the same filtering
  module. Table layout and scoring are unchanged.
- `assets/css/app.css`: previous v0.1.11 CSS plus standings/podium/doughnut styles.
- `index.html`, `historik.html`, `administrering.html`: just add `Statistik` to
  the navigation and update the version labels.
- `sql/16_standings.sql`: one new **read-only RPC** `get_standings_for_notes`.
- `assets/js/scoring.js` and `assets/js/profiles.js`: matching existing helper
  modules included for reference/completeness. If these are already deployed
  and working, you do not need to replace them.

## Install

1. Back up the existing repository and check that the profile-image migration
   `15_profile_administration.sql` was installed previously.
2. In Supabase SQL Editor, run the **entire** `sql/16_standings.sql` file.
   Run once after `05_scoring_history.sql` and your working public-history fix.
   This creates the standings function without changing game records.
3. Upload these files in their matching locations in GitHub:
   - `statistik.html` (new)
   - `index.html`, `historik.html`, `administrering.html` (navigation update)
   - `assets/css/app.css`
   - `assets/js/stats.js` (new)
   - `assets/js/ranking-model.js` (new)
   - `assets/js/notes.js` (new)
   - `assets/js/history.js` (existing history implementation, shared filters)
4. **Keep your real `assets/js/config.js` unchanged.** Also keep
   `assets/js/app.js`, `assets/js/admin.js`, and the profile-upload module.
5. Push to GitHub Pages. Refresh the website and open `Statistik` in the nav.

## Exact standings semantics

All games included in the selected Spilsamlinger are counted, not just the first
250 visible on Historik. When nothing is selected, all categories are included.
With `Medtag gæstespil` unchecked, *entire games involving any guest* are
excluded. When checked, those games and guest participants are included.
Each player appears if they took part in at least one included game, including
players with zero net points. Sort by total net points descending, then number
of games played descending, then name alphabetically. Payouts are calculated
by the same database scoring view as Historik, not recalculated in JavaScript.

The alternative pie view has **two** charts rather than one: percentage shares
of the net positive points, and percentage shares of absolute net negative
points. Negative quantities cannot be drawn directly as pie slices.
Neither view has playback animation or medal emojis. Images are read from the
existing public `whist-profiles` bucket, named by player UUID; if none exists,
an initials avatar is shown. Viewing statistics requires no shared password.

## Verification and caveats

`node tests/ranking-model.test.mjs` validates ranking, zero-point participants,
and pie-chart allocation. `python tests/browser_fixture.py` tested desktop and
390px mobile Chromium interfaces using mock Supabase data. The local fixture
requires Python Playwright and Chromium; screenshots are not needed in GitHub.

The SQL has **not** been executed against your live Supabase project. If you see
`Could not find the function public.get_standings_for_notes` in the schema cache,
confirm the migration ran successfully, then execute
`NOTIFY pgrst, 'reload schema';` in the SQL Editor and reload Statistik.
