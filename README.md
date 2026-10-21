# Whist v0.2.4 – Meldingsstatistik refinements

This patch changes only the Statistik page and its existing statistics read function.

## Installation

1. In **Supabase → SQL Editor**, run the entire `sql/18_ordinary_deviation_only.sql` script. This **replaces** `get_melding_statistics_for_notes` with the same argument and result signature, so existing code continues to work. Do **not** rerun `17_melding_statistics.sql` afterward, since the old function would reinstate the solo-deviation logic.
2. In GitHub, replace `statistik.html`, `assets/js/stats.js`, `assets/js/stat-metrics.js`, and `assets/css/app.css` with the files in this ZIP.
3. Keep all other files (including `assets/js/config.js`, `profiles.js`, scoring logic, Historik and Administrering) unchanged. Commit, push and hard-refresh Statistik. The version displayed should be **v0.2.4**.

## Changes

- Removed the yellow information banner about historical solo wins entirely; no hidden placeholder remains.
- Sorted **Meldingsstatistik** alphabetically by name, independent of the point-based ordering in Stilling.
- Both **Stikafvigelse** and **Absolut stikafvigelse** now average only an individual caller's numeric score from **Almindelig, Gode, Halve or Vip**. No solo games contribute, whether won or lost.
- Updated the detailed descriptions, tooltips and footnote accordingly. The percentages for Under, Over and Præcis still include solo calls, as before.
- Removed horizontal sticky positioning and oversized minimum width from the player column, which now fits its profile picture, name and game-count label. The rest of the table scrolls horizontally together on narrow screens. The vertical table header may still remain sticky while scrolling within the table.

The SQL is a read-only RPC definition and does not modify game data. The migration must be run in your live Supabase project. Local tests cannot validate live database execution.
