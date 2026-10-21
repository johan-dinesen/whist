# Whist v0.2.6 · Stillingshistorik

This is a small update to the **existing** Statistik page. It adds one module below Synergi: a cumulative score line chart, based on the same selected Spilsamlinger and Medtag gæstespil setting. All existing statistics and administration functionality remain intact.

## Install

1. In Supabase → SQL Editor, run the **entire** `sql/20_standings_history.sql`. This adds the read-only RPC `public.get_standings_history_for_notes(uuid[],boolean,boolean)`. Requires the existing scoring views and historical metadata from previous imports .
2. In GitHub, **replace**:
   - `statistik.html`
   - `assets/js/stats.js`
   - `assets/css/app.css`
3. In GitHub, **add**:
   - `assets/js/score-history-model.js`
   - `assets/js/score-history-chart.js`
4. Leave `assets/js/config.js`, the profiles, other pages, existing stats helpers and all other files unchanged.
5. Commit and push. Hard-refresh Statistik, checking for **v0.2.6**. Chart.js v4.5.1 is loaded by the new page from jsDelivr; no build tools are needed.

If you see a schema-cache error, execute `NOTIFY pgrst, 'reload schema';` in Supabase SQL Editor and reload the page.

## Interpretation

- X is the **ordinal number of a game in the filtered selection**. It runs from game `0`, meaning before any selected games, to the last selected game. It does not count unrelated games that were filtered out.
- Y is the player's **cumulative net score** after that many games, computed from the existing `game_player_payouts` view. When someone did not participate in a particular game, their cumulative score remains flat. Players who join after the first game still begin at `(0, 0)`.
- Include every player with at least one participation in the selected games. The game filters and guest handling are **identical to Stilling**. Both solo and regular games contribute their actual payouts.
- Order uses genuine `played_at` when known. Slettestrand 2023's unknown-time records use `played_year = 2023` for chronological positioning, then `legacy_row` for ordering within that year. **No dates are invented or written to the games table.** Other unknown-time records similarly use their known year, then source order and deterministic tie breakers. If played time and year are both absent, created_at is a fallback, explicitly not a claim about the time played.
- The final Y coordinate per player is expected to match that player's total in the Stilling module with the same selection, to two decimals.
- The graph's legend buttons toggle individual players; there is no animation.

## SQL and performance

The RPC is read-only, access-controlled by the same anonymous Supabase Auth session as Stilling, and `SECURITY DEFINER` so it does not give broad SELECT access to tables. It returns **one JSON document**, containing player IDs and a chronological sequence of games with their four payouts. This avoids the default 1,000-row PostgREST response limit as the historical collection grows. The browser creates the running totals using exact integer cents. The database, passwords, and stored games are not changed.

## Verification

The SQL editor's final statement should return a non-NULL `standings_history_function` signature. After deployment, select a tournament and check:

- The curve ends at the score shown in Stilling for each player.
- The x-axis counts *only* the selected games.
- Selecting Medtag gæstespil changes all statistics consistently.
- Mixing Slettestrand 2023 and a later tournament plots Slettestrand first, in the old source-row order.
- Selecting no games shows the usual empty-state text.

Local tests: `node tests/model.mjs` checks cumulative arithmetic and edge cases; `python tests/browser.py` checks responsive layout and legend click logic using a mocked chart drawing surface. These are local tests, not a live Supabase database test.
