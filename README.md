# Whist v0.2.16 · Profilbilleder foran nullinjen

CSS-only layout correction based on Whist v0.2.15.

## Installation

Replace exactly these two files in your GitHub Pages repository:

- `statistik.html`
- `assets/css/app.css`

Keep `assets/js/stats.js`, other JavaScript, Supabase configuration, and SQL unchanged.

## Fix

The moving Pointdiagram player columns now have a stacking level above the grey horizontal zero baseline. During the CSS transform-based ranking animation, each column forms a separate stacking context. Previously the baseline could overlap its profile picture despite the picture's higher z-index within the column. Setting the column's z-index to 2, above the baseline's z-index of 1, makes the profile picture remain on top throughout the animation without changing the animation or the photo image elements.

The CSS URL in `statistik.html` is cache-busted to v0.2.16.
