# Whist v0.2.13 · Tidsmaskinen i Pointdiagram

Frontend-only update of **Statistik**, based on v0.2.12. The new Tidsmaskinen sits **directly beneath Pointdiagram** inside the Stilling module. There is no extra module and the existing Stillingshistorik tab remains.

## Installation

Upload/replace these files in the GitHub Pages repository:

- `statistik.html` (replace)
- `assets/css/app.css` (replace)
- `assets/js/stats.js` (replace)
- `assets/js/score-history-model.js` (replace)
- `assets/js/time-machine-model.js` (**add**)

**Do not replace** the existing configuration, remaining JS helpers, registration page, history page or SQL files.

**No new SQL is necessary.** This feature uses the existing read-only `get_standings_history_for_notes` RPC, introduced in SQL migration 20. If Stillingshistorik already works, that function is already installed.

Commit and push, then reload the Statistik page and look for `v0.2.13`.

## Behavior

- Choose **Stilling → Pointdiagram**. Drag the slider underneath the bars to select game 0 through the final game in the currently selected Spilsamlinger / guest filter.
- The bar values, their order, and each player's `X spil` count are recalculated **as they stood after the selected game**. At game 0, all selected players have zero points and zero played games. A player who hadn't joined yet remains at zero.
- `Afspil` / `Pause` animates the bars from the selected position; if already at the last game, play begins from game 0. For long selections the animation may skip some frames; the slider always supports **every integer game index**.
- `Seneste` jumps to the final game, which matches the present-day Pointdiagram. Moving to Podie / Stillingshistorik does not change their data. Returning to Pointdiagram preserves the selected time-machine position until the filters are refreshed.
- Refreshing filters resets Tidsmaskinen to the latest game. If the history RPC is unavailable, the present-day Pointdiagram still functions and the slider is disabled.

## Verification

The `tests/model.mjs` local checks cover initial and intermediate frames, cumulative points, individual game counts, player ordering, and invalid indices. `tests/browser.py` exercises the actual UI controller and historic model in offline Chromium at 320, 390, 620, and 900 pixels, including slider, play/pause, latest, and tab switching. These checks do not access the live Supabase project.
