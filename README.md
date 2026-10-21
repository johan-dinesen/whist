# Whist v0.1.6: tournament notes and Kredsspil

This is an incremental update to v0.1.5. The scoring rules, the shared password, 30-day authorization, and automatic timestamps have not changed. **9 Gode = 0.40; 9 Halve = 0.50; each additional trick doubles the value.**

## Deploy to your existing GitHub Pages repository

1. In Supabase → SQL Editor run **`sql/06_tournament_notes.sql`**. This assumes `05_scoring_history.sql` was already run. The migration does not delete or rewrite old games. You do not need to rerun 01, 02, 04 or 05.
2. Replace `index.html`, `historik.html`, `assets/css/app.css`, `assets/js/app.js`, and `assets/js/history.js` in the repository. Nothing else needs replacing. Commit/push and hard-refresh the website; check for `v0.1.6` in both pages.
3. **Preserve `assets/js/config.js` and the Supabase keys you already configured**. This ZIP deliberately contains only `assets/js/config.example.js`, not your real config.
4. The v0.1.5 `assets/js/scoring.js` remains unchanged. It is included so a fresh installation has all frontend dependencies.

## Classification of games

`public.tournaments` now has these five named groupings: Slettestrand 2023, Hals 2024, Helsinki 2024, Hals 2025 and Klitmøller 2026. **Kredsspil** is not a database tournament row; it means a game where `public.games.tournament_id IS NULL`. Every existing game retains its current tournament assignment. The SQL creates missing group names with no invented start/end dates.

**Registration:** A compact “Spilsamling” setting appears above the players. When a tournament is marked `is_active=true`, that tournament is automatically selected. You can tap **Kredsspil** for an ordinary game. The selection persists when you press “Registrer næste spil” on the same page, but not indefinitely across browsers. The selected grouping is shown in the review before submission. With no active tournament, the only option is Kredsspil. The game timestamp is still captured automatically when submitting.

**Historik:** No date fields or date column. Click one note to isolate it, then click another to include both. “Alle” resets the filter to all notes, including Kredsspil. “Medtag gæstespil” still toggles guest-game inclusion, adding guest-name columns to the right. “Note” appears only when all or multiple notes are displayed; it is hidden for a single selected note to conserve space. The table has sticky column headings inside a vertically and horizontally scrollable region, compact payout columns, and alternating row colors. The call label uses `9Alm♦` rather than `9Almindelig ♦`, and the result heading is shortened to `Res.`. The table loads 250 games at a time, with an **Indlæs flere spil** button to support large imports.

## Turning an active tournament on or off

In Supabase SQL Editor, to activate Klitmøller 2026:

```sql
begin;
update public.tournaments set is_active = false where is_active;
update public.tournaments set is_active = true where name = 'Klitmøller 2026';
commit;
```

A unique index ensures at most one tournament is active. We do **not** automatically activate Klitmøller 2026 merely because it appears in the seed; you decide when the tournament is actually happening. To end the active tournament:

```sql
update public.tournaments set is_active = false where is_active;
```

When none is active, the form defaults to Kredsspil. Activating/deactivating a tournament never reclassifies previously saved games. Older games can later be imported with an explicit tournament ID, not inferred from timestamps. To inspect the notes and assignment counts:

```sql
select name, is_active from public.tournaments order by name;

select coalesce(t.name, 'Kredsspil') as note, count(*) as games
from public.games g
left join public.tournaments t on t.id = g.tournament_id
group by t.name order by t.name;
```

## Notes on historical imports

When we import your legacy games, each game's source file/tournament can be mapped explicitly to the corresponding `tournaments.id`, even if its recorded timestamp is incomplete or unusual. This is safer than guessing tournament membership from a date range, and it leaves Kredsspil distinct. Existing games with `tournament_id=NULL` will show under Kredsspil. If any were accidentally recorded there while a tournament was running, they can be reassigned deliberately later, but nothing in this migration does that automatically.

## Security and testing

The SQL creates `get_game_history_for_notes()`, a paginated read-only RPC that enforces the existing 30-day authorization through `is_registrar()`. It leaves all raw table write restrictions in place. Players and current active groupings are readable to anonymous authenticated sessions so the registration form can be filled before the shared password is entered. No password is embedded in the site.

Run `npm test` in this folder to test scoring and form behavior. SQL syntax and integration should be verified in your actual Supabase project before depending on them. This environment does not have credentials for the hosted database.
