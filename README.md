# Whist 1.0.0: Efter klokkeslæt

A new module at the bottom of **Statistik**, following all existing Spilsamlinger and Medtag gæstespil filters.

## Installation

1. Run `sql/22_hourly_statistics.sql` in Supabase > SQL Editor **after** existing migration 21.
2. Upload the five frontend files from this archive to the matching paths in GitHub:
   - **Replace** `statistik.html`
   - **Replace** `assets/js/stats.js`
   - **Replace** `assets/css/app.css`
   - **Add** `assets/js/hourly-model.js`
   - **Add** `assets/js/hourly-chart.js`
3. Keep all other files, particularly `assets/js/config.js`, unchanged.
4. Refresh the Statistik page. The updated CSS/JS links use a cache-busting suffix; the displayed site version remains **v1.0.0**.

## Behaviour

- One line chart, five choices: Point/spil, Meldinger %, Præcis melding %, Absolut stikafvigelse, Solomeldinger %.
- One solid curve per player for observed hourly averages; a thinner dashed curve of the same colour for the player's **overall average over eligible timestamped games**.
- Legend buttons independently show/hide both curves for a player. Player photographs use the existing image cache.
- Hover/tap an observation to see the value, number of observations and player's overall average.
- The graph's x-axis runs only from the first to the last observed hour, constrained to 10:00 through 02:59. Midnight buckets are plotted after 23:00, and an hour with no matching games remains a gap.
- Averages are properly weighted from **sums and counts**, not a simple mean of hourly means.
- Solo calls with multiple callers are counted individually. "Præcis melding" follows the existing historical win/trick classification and uses **all calls** as denominator, even if a legacy solo win is unclassified. Absolute trick deviation uses only ordinary/Vip calls.
- The new RPC only reads data. All earlier modules, standings logic and stored games remain untouched.

## Timestamp assumptions

- Only non-NULL `games.played_at` is used. Import times (`created_at`) and artificial year sorting keys are NEVER used.
- The timestamp is translated to the **playing-location timezone before** extracting its clock hour. Current mapping: tournament names containing `Helsinki` use `Europe/Helsinki`; all others, including Kredsspil, use `Europe/Copenhagen`. For future games played elsewhere, adjust the timezone mapping in this new SQL function before including them.
- A game at 03:00 or later (up to 09:59) is excluded. A game at 02:59 is included.

## Tests

The new model's 5 automated tests and 13 existing scoring/model tests passed locally. Browser interaction checks at 320, 390, 620 and 900px passed using a Chart.js-compatible test double (the production Chart.js CDN and live Supabase function were not available for end-to-end verification in this environment). SQL must be applied and verified in your own Supabase project.
