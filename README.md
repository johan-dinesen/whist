# Whist v0.2.2: tighter point diagram and white solo-result symbols

This is a frontend-only incremental update for the existing GitHub Pages Whist  project.

## Changes

- **Statistik / Pointdiagram:** up to six players occupy exactly the available diagram width, including on narrow phones. Seven or more players can be reached through horizontal scrolling, with six columns visible at once. The scroll hint appears only when needed.
- **Historik / result column:** solo outcomes are plain white `✓` (win) and `×` (loss) rather than colored emoji. Multiple callers display consecutive symbols, in caller order. Existing games, scores, suits and filtering remain untouched.

## Deployment

Replace these five paths in your GitHub repository:

- `statistik.html`
- `historik.html`
- `assets/js/stats.js`
- `assets/js/history.js`
- `assets/css/app.css`

**Do not overwrite** `assets/js/config.js` or any other files. No SQL migration is needed.

Commit and push, then refresh your site; both pages show **v0.2.2**. Their CSS and script URLs have new version parameters to avoid displaying older cached versions.

## Checks

JavaScript syntax was checked with Node. An isolated Chromium fixture verified that six players fit without sideways overflow at viewport widths 320, 390, 620, and 1160 px; a seventh player produces horizontal scrolling. It also verified that solo symbols render as `✓×` and appear in white. These are local checks, not a live Supabase deployment test.
