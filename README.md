# Whist Statistik v0.2.1 - Podie + pointdiagram

This package is a **frontend-only patch** for v0.2.0. It does not change database schema, permissions, ranking calculation or shared Spilsamlinger filters.

## Apply to GitHub

Replace exactly these files in the existing Whist repository:

- `statistik.html`
- `assets/js/stats.js`
- `assets/css/app.css`

Keep all other files, especially `assets/js/config.js`, `assets/js/profiles.js`, `assets/js/notes.js`, and the Supabase migrations as they are. Commit and push. Refresh Statistik; the heading should show `v0.2.1`. No SQL is necessary.

## Changes

- Removes the numerals 1, 2, 3 from the podium blocks. The remaining standings list still shows ranking numbers.
- Fixes profile-photo loading: previous markup made the images `loading=lazy` while CSS hid them until the `load` event; this could prevent the requests from starting. Images now load eagerly, fade in when loaded and fall back to initials on error. Uploaded files continue to be read from the `whist-profiles` public bucket at `{player UUID}.webp`.
- Replaces the two donut charts with one static vertical bar chart, ordered by standings. All bars share the same scale and a single zero baseline. Gains rise (green) and losses fall (red). Uploaded profile images appear on the baseline. The chart scrolls horizontally on mobile.
- The two-option toggle is now `Podie` / `Pointdiagram`.
- The same category and guest filters continue to drive both views.

## Tests and limitations

`node --check assets/js/stats.js` passes. The headless browser fixture passed at 1160px and 390px with simulated Supabase results and loadable image data, checking the image `load` event and visible photo, standings order, no podium numbers, gain/loss/zero bars, guest inclusion and view switches. This does not constitute a live Supabase Storage test.

If images do not load after deploying, inspect Supabase Storage > `whist-profiles` and verify that files are named after the corresponding UUID and that the bucket is public. The image URL may be opened directly from the browser's developer tools.
