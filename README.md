# Whist v0.2.3: Meldingsstatistik

One new, independent statistics module underneath **Stilling** in the existing `statistik.html`. Same existing Spilsamlinger filters, multi-selection and `Medtag gæstespil` checkbox. Both read-only RPCs load separately, so a failure in one module need not hide the other. No other pages are changed.

## Deploy

1. **Supabase SQL Editor**: Run the entire `sql/17_melding_statistics.sql` script. It creates one read-only function, `get_melding_statistics_for_notes(uuid[],boolean,boolean)`, and refreshes the PostgREST schema cache. Apply it **after** your previous `16_standings.sql`. The function does not require a registration password for reading.
2. **GitHub Pages**: Replace the existing `statistik.html`, `assets/js/stats.js` and `assets/css/app.css`; add the NEW file `assets/js/stat-metrics.js`.
3. Commit and push. Reload Statistik and check for version **v0.2.3**. No changes to `config.js`, registration, history, admin or any other files.

If Supabase reports **“Could not find the function get_melding_statistics_for_notes”**, verify that step 1 finished successfully, and refresh the browser. Do **not** rerun your early migrations; older history migrations can reinstall deprecated access rules.

## Metrics (one row for every player with >=1 qualifying game)

- **Meldinger**: number of qualifying games in which the player is a caller. If two people call Sol, it counts once for each.
- **Undermelding**: positive numeric result (`score > 0`) or a Sol/Bordlægger win with **1 stik**. Displayed as a percentage of all own calls.
- **Overmelding**: negative numeric result (`score < 0`) or **any solo loss**. Percentage of own calls.
- **Præcis melding**: numeric result zero; Sol/Bordlægger won with **0 stik**; Ren Sol/Ren Bordlægger won. Percentage of own calls.
- **Stikafvigelse**: mean *signed* `score` on ordinary/Vip calls, plus exact recorded solo deviations 0 or +1 (and zero for winning Ren Sol/Ren Bordlægger).
- **Absolut stikafvigelse**: mean of the absolute values of those same measurable deviations.
- **Point/spil**: mean of the player's existing `game_player_payouts.payout` across **all games played**, including games where someone else calls. Displayed using 2 decimal places.

For zero calls, the three percentages and deviations display `—`; point/spil still displays. Player points are calculated using the existing scoring view, not recomputed on the client.

### Historical data limitations

Many imported solo wins were recorded only as `Vundet`, without `0 stik` or `1 stik`. For **Sol** and **Bordlægger**, this isn't enough to distinguish *Præcis* from *Under*, so those calls count in the denominator (Meldinger) but are **unclassified**. Their percentages may sum to less than 100%; the page explains how many such records are present. For **Ren Sol** and **Ren Bordlægger**, any win is unambiguously *Præcis*.

Solo **losses** count as *Over* but are excluded from both deviation averages, because the original records do not contain the number of tricks by which they failed. Averages therefore report only calls with known numerical deviations; details on hover show each player's sample count. The treatment of Sol/Bordlægger win with 1 trick as *Under* rather than 0 tricks follows the consistency assumption communicated before implementation.

### Modular design

- `sql/17_melding_statistics.sql`: server-side filtering and aggregation; future metrics can be added without changing games.
- `assets/js/stat-metrics.js`: standalone metric descriptors, value formatters and validation. Future statistics can be added by extending this list and the corresponding SQL results.
- `assets/js/stats.js`: presents the module independently below Podie/Pointdiagram, using the same filter parameters.

## Verification

`node --experimental-default-type=module tests/model.mjs` and `python tests/smoke.py` ran locally. Browser fixtures at 320, 390, 850 and 1160 px checked the statistics rows, layout, table scrolling and that the existing podium and signed point diagram remain in place. The SQL migration has **not** been run against your live Supabase project.
