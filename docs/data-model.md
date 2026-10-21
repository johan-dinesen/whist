# Canonical data model (phase 1)

`players` is a central roster, **not** a yearly spreadsheet header. Each player
has a stable UUID, display name, guest flag, and active flag.

`tournaments` stores a name and optional `start_at` / `end_at` timestamps.
Tournament dates can later define a filter independently of a game's actual
registration timestamp. New events require adding a tournament row, not a new
spreadsheet or branch of the website code.

`games` contains one logical row per game:

| Field | Purpose |
|---|---|
| `id` | Stable game UUID |
| `client_request_id` | Deduplicates a repeated mobile submission |
| `tournament_id` | Optional tournament association |
| `played_at` | Actual time the game was played |
| `created_at` | When database received the game |
| `recorded_by` | Authorized recorder (Supabase Auth user) |
| `call_type` | Canonical identifier, independent of interface label |
| `tricks`, `trump`, `vip_depth` | Non-solo declaration |
| `score` | Raw integer result, not a calculated player payout |

`game_participants` holds exactly four rows per game, inserted **together
with** the parent game in one database transaction:

| Field | Purpose |
|---|---|
| `game_id` | Links to its game |
| `player_id` | Links to central player |
| `seat` | Original selection order, 1–4 |
| `is_caller` | Player was a caller |
| `is_partner` | Player was the registered partner |
| `solo_result` | Per-caller outcome for solo types |
| `was_guest` | Guest classification at time of game |

The database deliberately does not store derived standings or points allocations.
Later these may be computed in SQL views or application code after matching the
spreadsheet scoring logic. This avoids storing inconsistent redundant totals.

Possible future filter (pseudocode):

```sql
select * from public.games
where played_at >= :start_at and played_at < :end_at;
```

Or filter by `tournament_id`. End-exclusive intervals avoid double counting.

## Preservation of old form behavior

- Exactly four players per game.
- `Almindelig`, `Gode`, `Halve`, `Vip` have one caller, tricks from 9 to 13,
  a trump and exactly one partner. A partner may coincide with caller because
  the legacy form allowed it.
- `Gode` supports only clubs or no trump.
- `Vip` adds a depth from 1 to 3.
- Non-solo result is an integer +4, +3, ..., −7.
- `Sol`, `Ren Sol`, `Bordlægger`, `Ren Bordlægger` allow one or more callers;
  each caller has their own result. Non-callers have no solo result.
- The database server validates these rules independently of the UI.
