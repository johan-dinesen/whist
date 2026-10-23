# Whist v0.2.15 · Blød animation i Pointdiagram

Frontend-only update based on Whist v0.2.14. No Supabase or SQL changes.

## Installation

Replace exactly these three files in the GitHub Pages repository:

- `statistik.html`
- `assets/js/stats.js`
- `assets/css/app.css`

Keep all other files, including `assets/js/config.js` and the existing time-machine/history model scripts, unchanged.

## Changes

1. The positive and negative bars now animate height over 230 ms. Separate persistent gain/loss bars let a player cross zero without jumping abruptly from one side of the baseline to the other.
2. When the ranking changes, the player columns glide horizontally to their new positions over 240 ms. Subsequent updates, even mid-animation, start from the player's actual current visual position. Existing photo nodes are still preserved.
3. Point values near the baseline are held outside the profile photo area. Once the bar passes the clearance, its value moves with the bar. This applies to positive, negative, and zero scores, including on mobile.
4. Motion honors `prefers-reduced-motion: reduce`.
5. HTML asset query strings and visible version updated to v0.2.15 to force browser cache refresh.

## Local checks

- `tests/browser.py`: existing photo-cache and toggle preservation checks at 320, 390, 900 px.
- `tests/animate.py`: bar sign transitions, near-zero score/photo separation, rank-order interpolation, repeated rapid updates, avatar preservation, reduced-motion behaviour, and horizontal overflow at 320, 390, 900 px.

These checks run with mock data in Chromium. They do not connect to the live Supabase project.
