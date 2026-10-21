# Whist registration: phase 1

A **new, separate GitHub Pages application**. It deliberately does **not** use
Google Sites, Google Apps Script or Google Sheets. A Supabase/Postgres database
stores games, players, and optional tournament associations. No score calculations
or charts are implemented yet.

## 1. Folder layout

```text
whist-registration/
├── index.html                    # Mobile-first game-registration screen
├── assets/
│   ├── css/app.css               # All visual styles
│   └── js/
│       ├── app.js                # Forms, validation, Supabase calls
│       └── config.js             # Public Supabase URL + publishable key
├── sql/
│   ├── 01_schema.sql             # Tables, permissions, RLS, atomic save
│   ├── 02_seed.sql               # Initial players + Klitmøller 2026
│   └── 03_authorize_registrar.sql # Template for authorizing an account
├── docs/
│   └── data-model.md             # Explanations for future statistics
├── .gitignore
└── README.md
```

## 2. What is and isn't implemented

**Implemented**
- Four different players, selected from a central database list.
- Six main players and six guests from the 2026 workbook (seed data).
- Eight call types: Almindelig, Gode, Halve, Vip, Sol, Ren Sol,
  Bordlægger, Ren Bordlægger.
- One/multiple callers as appropriate; nine to thirteen tricks on non-solo
  games; VIP depth 1–3; trump restrictions on Gode; partner selection;
  integer result from +4 through −7 or an outcome per solo caller.
- Selection of existing tournaments, or "Uden turnering".
- Exact game date/time. Stored as `timestamptz`; the browser submits UTC.
- Authentication by emailed login link, with a separate approved-registrar list.
- Database transaction, server-side validation, and replay-safe request IDs.
- A **read-only preview** of the whole UI without configuring Supabase:
  open `?preview=1`. It *never* saves data.

**Not implemented**
- Importing 2026 games into the database.
- Creating tournaments/players inside the website (use Supabase Table Editor now).
- Ranking, score calculation, historical charts, synergy and statistics.
- Editing or deleting already submitted games; add later with audit records.
- Offline registration. An internet connection is required to save games.

## 3. Create Supabase database

1. Create a project at https://supabase.com/dashboard.
2. In the **SQL Editor**, run `sql/01_schema.sql` **once**.
3. Then run `sql/02_seed.sql` to populate the names and 2026 tournament.
4. Open Project Settings / API Keys (or the project's API section).
   Copy the **Project URL** and the **publishable key** (`sb_publishable_...`
   or your project's browser-safe legacy anon key).
5. Replace the placeholders in `assets/js/config.js` with the URL and
   publishable key. **Never put a `service_role` or secret key in the browser.**

Because row-level security and least-privilege grants are used, merely knowing
those public values does **not** permit anyone to write game data.

## 4. Authorize yourself to register games

1. In Supabase > Authentication > URL Configuration, set the **Site URL**
   to the live GitHub Pages URL including any project path, e.g.
   `https://YOURUSERNAME.github.io/whist-registration/`.
   Add the same full URL as an allowed **Redirect URL**.
   When testing locally, add `http://localhost:8000/` as an allowed redirect.
2. Open the live website, enter your email address, and follow the login link.
   (First sign-in creates an Auth user if sign-ups are enabled.)
3. Open **Authentication > Users** in Supabase; confirm your user exists.
4. In SQL Editor, copy `sql/03_authorize_registrar.sql`, **replace the email**
   with yours, run it, and refresh the website or sign in again.
5. Sign-in alone is **not** permission to write games. Only users who appear
   in `public.registrars` can read player/tournament lists or use `register_game`.
   To add a trusted friend, have them sign in once and then add their auth ID
   to the registrar table in Supabase. Revoke access by deleting that row.

For a real group, review your Supabase email sending limits and provider
configuration. A mail link can only redirect to addresses allowed in Auth.

## 5. Publish to GitHub Pages

1. Create a **new repository** for the card-game application, for example
   `whist-registration`. Do **not** overwrite your academic website repository.
2. Unzip this project. Upload/commit the **contents**, keeping `index.html`
   in the repository root.
3. In GitHub repository **Settings > Pages**, choose **Deploy from a branch**,
   branch `main`, folder `/(root)`.
4. The URL will usually be
   `https://YOURUSERNAME.github.io/whist-registration/`.
5. Use that **exact URL**, including trailing slash, in Supabase Auth's
   Site URL and Redirect URLs.
6. After setup, edit files in VS Code, then **commit and push**. GitHub Pages
   republishes from the branch. Relative paths work at project subpaths.

If you want to preview on your computer, open a terminal in the project folder:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000/?preview=1` for the **non-saving UI demo**.
For live authentication locally, use `http://localhost:8000/` and ensure it
is an allowed Supabase redirect. Opening `index.html` via `file://` is not recommended.

## 6. Managing the next tournament

Go to Supabase > Table Editor > `tournaments` and insert a row:

- `name`: e.g. `Klitmøller 2027`
- `start_at`: optional start date/time (with timezone)
- `end_at`: optional end date/time (with timezone)

There is **one common `games` table** across all tournaments and years.
Every game has both `played_at` and optional `tournament_id`. Future charts
can filter games either by selected tournament or by a user-specified time
interval, without making separate spreadsheets.

To add a guest/player, insert a row in `players`. Mark guests `is_guest=true`.
Don't delete players who participated in old games; set `active=false`
instead. `game_participants.was_guest` preserves the original guest status.

## 7. Reliability and security boundaries

- Anonymous visitors have no database table or submit access.
- Authenticated but unapproved users also have no access to game data.
- `register_game` runs in one database transaction with server-side validation.
- Each submission uses a unique request ID; repeating a request cannot
  create a duplicate game. Network failure messages don't imply a save failed:
  use the same retry button before restarting the form.
- Browser configuration (`config.js`) **is public**. It must contain only a
  browser-safe publishable key. Supabase database SQL uses Row Level Security.
- No live Supabase account/database is created by this package. You need to
  perform the setup above; until then, only preview mode works.
- Use Supabase backup/export features and consider regular database backups.

## 8. Legacy migration

The source workbook (`2026Klitmøller.xlsx`) has a source-of-truth `Overview`
worksheet with timestamp, Player1–4, caller, call, tricks, trump, VIP depth,
partner, score and a guest flag. Later phases can import those records into
`games` and `game_participants`, mapping names onto stable player UUIDs.

Before implementing statistics we should review scoring formulas and check
that outputs reproduce the legacy spreadsheet for the same historical games.
Some formula results in the workbook are not directly portable, so this
version intentionally stores **raw results only**.
