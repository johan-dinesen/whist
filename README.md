# Whist v0.2.11: Hænder

Adds a standalone **Hænder** module below Synergi on `statistik.html`.

## Install

1. In Supabase Dashboard → SQL Editor, run the complete `sql/21_hands_statistics.sql` file **once**. It installs `public.get_hands_statistics_for_notes(uuid[],boolean,boolean)` and reloads the API schema cache.
2. In your existing GitHub Pages repository, **replace**:
   - `statistik.html`
   - `assets/js/stats.js`
   - `assets/css/app.css`
3. **Add**: `assets/js/hands-model.js`.
4. **Do not replace** `assets/js/config.js` or any existing registration/history/admin/scoring files.
5. Commit and push. Refresh Statistik and verify version `v0.2.11`.

The migration is read-only with respect to data: it only creates/replaces the RPC. It does not change historical games, scoring functions, profiles or tournament assignments. If the SQL wasn't run, the Hænder module shows its own loading error while the other Statistik modules continue working.

## What the table means

- All filters are identical to the other Statistik modules, including the multi-select Spilsamlinger filter and the **Medtag gæstespil** checkbox.
- Player columns are alphabetized and include **everyone who played at least one selected game**, even if they made no calls.
- Only observed hand types occur in the table. Ordinary combinations are identified by number of tricks and call (`9Alm`, `10Gode`, `11Halve`); Vip also includes the depth (`9Vip1`, `9Vip2`, `9Vip3`). Solo calls get separate `Sol`, `Ren Sol`, `Bordlægger` and `Ren Bordlægger` rows.
- **Antal** is a count of **calls** for the hand type. Multiple players declaring Sol in the same game count as separate Sol calls; ordinary games normally have one caller.
- **Gns.** for Alm/Gode/Halve/Vip is the average **signed trick result** (`games.score`), *not* average earned points. For example +2, −1, 0 → +0.33.
- **Gns./%** for solo calls is the percentage of winning calls, using `solo_result` starting with `Vundet`. Historical `Vundet` (without a trick count) counts as a win, and `Tabt` counts as a loss.
- Trump is not part of the hand type, making the historical data with missing suits compatible.
- Empty player/hand combinations show a dash; their average is not incorrectly displayed as zero.

All calculations run in Supabase, so adding more games or tournaments does not require modifying the browser code.

## Verification

After running the SQL, this diagnostic should return a registered function:

```sql
select to_regprocedure('public.get_hands_statistics_for_notes(uuid[],boolean,boolean)');
```

For a simple SQL Editor smoke test:

```sql
-- Direct SQL Editor calls typically lack a Supabase Auth user and are therefore
-- rejected by this RPC. Test the results from the Statistik page with a valid
-- anonymous Supabase Auth session instead.
```

The frontend model tests pass with `node tests/hands-model.test.mjs`. JavaScript syntax and the static integration were checked. The live SQL query and Supabase data have **not** been tested in your database.
