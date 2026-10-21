# Whist v0.1.7: Administrering

Adds **Administrering** to the existing v0.1.6 Whist site. The admin page can:

1. Create new named tournaments such as **Hals 2027**, without activating them.
2. Select exactly one active tournament as the default note on newly registered games.
3. Choose **Kredsspil** as the default (no active tournament).
4. Lock the admin page again explicitly.

No individual email or GitHub login is needed. Admin has a **separate password**, verified by Supabase on every unlock. A valid admin session is remembered for **12 hours** on the same browser. The ordinary shared game-registration password and its **30-day** grant are unchanged. Changing the admin password invalidates prior admin grants.

## Deployment to your existing Supabase + GitHub Pages project

**First, SQL:** In Supabase → SQL Editor, run `sql/07_administration.sql` from this package. The existing `01_schema.sql`, `02_seed.sql`, `04_shared_password.sql`, `05_scoring_history.sql`, and `06_tournament_notes.sql` must already have been run, in that order. **Do not rerun them just to install this update.** The new migration never deletes or rewrites old games.

**Second, set the independent admin password once in Supabase SQL Editor:** Replace the example with your own long, random password (8–72 bytes; 20+ random characters recommended). **Choose a different password from the registration password.**

```sql
insert into private.admin_secret (id, password_hash, changed_at)
values (
  1,
  extensions.crypt('REPLACE_WITH_A_DIFFERENT_LONG_ADMIN_PASSWORD', extensions.gen_salt('bf', 12)),
  clock_timestamp()
)
on conflict (id) do update
  set password_hash = excluded.password_hash,
      changed_at = excluded.changed_at;
```

The password appears as a literal in the SQL editor when initially set; avoid sharing the statement or committing it to GitHub. The website **never downloads or stores your password**, and the database contains only its bcrypt hash. Running the statement again with a new password rotates it and invalidates previously authorized admin sessions.

**Third, website files:** Copy these items from the package into your existing GitHub Pages repository, preserving their paths:

- **Add** `administrering.html` and `assets/js/admin.js`.
- **Replace** `index.html`, `historik.html`, `assets/js/app.js`, `assets/css/app.css`.
- **Keep** your existing `assets/js/config.js` untouched.
- All other bundled files are identical to the prior release or included for reference. Your prior `assets/js/scoring.js` and `assets/js/history.js` continue to work.

Commit and push. Open `https://YOURNAME.github.io/YOUR_REPO/administrering.html` (or use the Administrering navigation link). Enter the independent admin code.

## Normal workflow

- To plan **Hals 2027**, enter its name and click **Opret**. It becomes selectable in Historik immediately; it is **not** active yet.
- When it starts, select **Hals 2027** under *Aktiv spilsamling* and click **Gem aktiv spilsamling**.
- When it ends, select **Kredsspil (ingen aktiv turnering)** and save. The registration page defaults to Kredsspil for newly started games.
- You may still manually choose Kredsspil for an individual game while a tournament is active.
- The admin selection affects **new submissions only**. It never reclassifies old games, and never changes their scores or recorded timestamps. A registration page open in another tab checks whether the default changed before saving and requires reconfirmation if so.

## Supabase security model

The admin password hash, failed-attempt counters, and time-limited grants are held in the non-exposed `private` schema. Browser users have **no direct insert or update rights** on `public.tournaments`; they call `admin_create_tournament()` and `admin_set_active_tournament()` through restricted Postgres functions. Both functions independently verify the admin grant linked to the current anonymous Supabase Auth account. Anonymous Supabase Auth sessions use the `authenticated` database role; RPCs restrict who may execute them and check the browser session server-side. **Do not put a service-role key or a password in any GitHub file.**

There is a **five-attempt / 15-minute per-session lockout**. It is not effective against attackers who continually create new anonymous sessions. For public internet hosting, use a high-entropy admin secret and consider enabling Supabase's CAPTCHA and/or an upstream rate limiter before broad use. The admin page's password requirement is backed by server-side access checks, not merely by hiding UI controls.

## Troubleshooting

- **Could not find the function**: SQL migration `07_administration.sql` was not applied, or Supabase's schema cache is stale. Re-run only the new migration if needed, then refresh the page.
- **Administration password not configured**: Set `private.admin_secret` with the SQL above.
- **Anonymous sign-ins disabled**: Enable Anonymous Sign-Ins under Supabase Authentication settings (the registration site needs it too).
- **Can't see new tournament on history page**: Hard-refresh `historik.html` to reload the current list of labels.
- **Active note in a previously opened registration tab looks stale**: Refresh the registration page. Save also rechecks the active note and warns if it changed.

## Tests

Run `npm test` in the project folder to execute the existing scoring/history tests plus the new admin UI tests. The local tests simulate Supabase calls; actual database functions and authorization must still be verified against your live Supabase project. A recommended check is to create a test tournament, activate it, submit one game, verify `games.tournament_id`, deactivate it, and verify the next game's `tournament_id` is NULL.
