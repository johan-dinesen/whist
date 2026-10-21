# Whist v0.2.5 – Synergi

Adds **Synergi** below the existing Stilling and Meldingsstatistik modules.

## Installation

1. In **Supabase → SQL Editor**, run the complete `sql/19_synergy.sql` file. Run after the existing scoring/standings/statistics migrations. It creates one read-only function, `public.get_synergy_for_notes(uuid[],boolean,boolean)`, then asks PostgREST to refresh its schema cache. It does not modify saved games.
2. In GitHub, replace:
   - `statistik.html`
   - `assets/js/stats.js`
   - `assets/css/app.css`
3. Add the new file `assets/js/synergy-model.js`.
4. Keep **all other files**, notably `assets/js/config.js`, `assets/js/notes.js`, `assets/js/stat-metrics.js`, `assets/js/profiles.js` and `assets/js/scoring.js`, unchanged.
5. Commit and push, then hard-refresh Statistik. It should display **v0.2.5**.

## Calculation

- Same **Spilsamlinger** multiselect and **Medtag gæstespil** filtering used by Stilling and Meldingsstatistik. If guest games are excluded, entire games involving guests are excluded.
- Include every player who participated in at least **one qualifying game**, even if none of those games involved their own melding or makker role. Names are alphabetized in Danish order.
- Only Almindelig, Gode, Halve and Vip are partnership games. Ignore all Sol/Bordlægger variants for Synergi.
- For each game, pair the **melder** and **makker** and use the melder's actual **net payout** from `game_player_payouts`. That equals the partner's payout when they are different players. Average those payouts over the qualifying games for each unordered partnership, including losses. A game contributes once per pair.
- **Diagonal:** melder=makker, i.e. legacy one-versus-three games. Use that player's actual payout, which can be three times the standard two-person partnership amount.
- Both halves of the matrix show the same result and game count. A pair that has never played together shows `—` and `0 spil`, rather than a misleading average of zero. A real mean of zero is displayed `0,00` with a nonzero count.
- Heat-map intensity uses the largest absolute partnership average among **all nonempty cells in the filtered matrix**, with green for positive and muted red for negative. Colour isn't an uncertainty or sample-size indicator, so each cell displays its count.
- Names on top and left; header and row-name labels stay visible during matrix scrolling. On narrow screens, scroll horizontally for more players.

## SQL verification

After running the SQL file, check its final result: `synergy_function` should show `get_synergy_for_notes(uuid[],boolean,boolean)`.

If the site reports `Could not find the function ... in the schema cache`, rerun `NOTIFY pgrst, 'reload schema';` and refresh the page.

## Tests / caveats

- `node tests/model.mjs` tests symmetry, Danish alphabetical sorting, diagonal observations, zero and missing pairs, sample counts and colours.
- `python tests/browser.py` runs an isolated browser fixture using sample values and captures mobile and desktop previews. It does not contact Supabase.
- This package's SQL has not been executed against your live Supabase project. Test the new RPC after applying the migration.
