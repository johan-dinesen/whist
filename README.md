# Whist v0.1.5: points and game history

This package extends the **working v0.1.4** registration app. It retains anonymous sessions, the shared 30-day password, the existing `games` and `game_participants` tables, automatic submission timestamps, and scroll-to-next-step behavior.

## Install on an existing GitHub Pages Whist repository

**1. Keep your own `assets/js/config.js` unchanged.** The ZIP contains `config.example.js` only; do not upload it as `config.js` or overwrite your real credentials.

**2. Run `sql/05_scoring_history.sql` once in Supabase → SQL Editor.** You must already have run the previous `01_schema.sql` and `04_shared_password.sql`. This migration is non-destructive and safe to re-run. It creates:

- `public.game_player_payouts`: one calculated payout row per player per game.
- `public.game_history`: one row per game, with named caller(s), partner, all four participants and their payout values in JSON, including past games.
- `public.get_game_history(...)`: read-only API for filtering by date, guest participation and optional tournament ID. Only accessible to anonymous browser sessions that have been unlocked by the shared password and are still within the 30-day window.

**3. Copy the following files to the same paths in your GitHub repository:**

- `index.html` (updated review section and new Historik link)
- `historik.html` (new history page)
- `assets/css/app.css` (updated CSS for both pages)
- `assets/js/app.js` (updated registration form showing estimated payouts)
- `assets/js/scoring.js` (**new required file**, used by both pages)
- `assets/js/history.js` (**new required file**, loads live calculated payouts)

You may also commit `sql/05_scoring_history.sql` and `tests/` to keep the migration and tests versioned. **Never overwrite your existing `config.js` or rerun the old schema/seed files.**

**4. Commit, push, and hard-refresh GitHub Pages.** The website should say `v0.1.5` and show links to **Registrering** and **Historik**. Example history URL: `https://YOURUSERNAME.github.io/whist-registration/historik.html`.

**5. Test:** Register a test game, check that the registration review shows the point distribution, then open Historik. On a device with existing valid 30-day access, history opens immediately. Otherwise enter the same shared password once. SQL verification:

```sql
select id, call_type, played_at, callers, partners, payout_sum, participants
from public.game_history
order by played_at desc limit 10;

select game_id, sum(payout) as total
from public.game_player_payouts
group by game_id
having sum(payout) <> 0;
```

The second query should return **zero rows**, because each game's winnings and losses must sum to zero. If it doesn't, investigate the affected game before relying on statistics.

## Scoring rules implemented

### Almindelig / Gode / Halve / Vip

At 9 tricks, base points are respectively `0.30 / 0.40 / 0.50 / 0.60`. For each trick increase from 9, double the base value. For a score of `0`, take the base; `+n` multiplies by `1 + n/2`; `-n` multiplies by `-(1 + (n-1)/2)` (where `n >= 1`). Vip additionally multiplies by `vip_depth`.

Caller and partner each receive the signed value, and the two opponents each receive its negative. Historic self-partner records are handled as a **one-person team receiving 3V** against three players receiving `-V`, ensuring zero-sum accounting.

**A discrepancy in the provided specification must be resolved before treating the scores as final:** `9Halve=0.50` plus doubling at each trick implies `10Halve=1.00` and `11Halve=2.00`, whereas the message also gives `10Halve=0.80` and `11Halve=1.60`. This implementation uses the doubling rule. If the latter examples are intentional, change the rule centrally in SQL and in `assets/js/scoring.js` after agreement. Calculated history will update automatically.

### Sol / Ren Sol / Bordlægger / Ren Bordlægger

Values are `0.30 / 0.60 / 1.20 / 2.40`. Each caller independently wins `+V` (if the result starts with `Vundet`) or loses `-V` (if `Tabt`), and transfers the opposite amount in three equal parts to the other players. All callers' transfers are added. Two successful Sol callers each get `+0.20`, and the other two get `-0.20`. A successful caller and a losing caller get `+0.40 / -0.40`, with `0` for the other players.

The underlying database labels are preserved (`bordlaegger` / `ren_bordlaegger`), to remain compatible with previously registered games.

## History filters and guest columns

The history page supports **inclusive from/to dates**, which makes it possible to isolate a tournament based on its dates later without changing how games are registered. The database RPC also accepts an optional `p_tournament_id` for future use.

With **Medtag gæstespil** unchecked, only games involving the regular players are shown. Enabling it includes games with guests and adds guest-name columns on the right. Games not involving a particular player have a blank cell. The history page shows up to 500 latest matching games for responsiveness; the RPC supports a larger maximum of 2,000.

## Security and verification

The new history RPC enforces the existing 30-day shared-password authorization on the server, and the calculated views are not granted directly to the browser. No service-role or private key should appear in GitHub. The point-preview is only a client-side display; **Supabase's database views are the canonical calculation**.

The JavaScript scoring module is covered by `npm test` (Node.js required). There is no connection from this ZIP to your live Supabase project; the migration has not been applied to or executed against your hosted database. Browser-based end-to-end testing was not possible in the build environment, so verify one live game before relying on the history.
