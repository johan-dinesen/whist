# Whist v0.1.9: Open history and automatic game categories

This release changes the display and the read-only history permissions. It does **not** reclassify or delete existing games. It builds on v0.1.8 and keeps the working admin page from v0.1.7.

## 1. Supabase: apply the **new** migration

Run **the entire file `sql/08_public_history.sql`** once in Supabase → SQL Editor. Do not rerun schemas 01–07. This modifies only the `get_game_history_for_notes` read function: it no longer requires the 30-day shared registration password. The visitor still receives an invisible, free Supabase anonymous session. A strong registration password is **still required to save** a game, and the separate administrator password is **still required** to create or activate tournament tags.

**Privacy change:** all historical game data returned by the read function, including player names, game details and point results, becomes viewable to anyone visiting the website (no password). Only apply this migration if that is intended.

## 2. Website: copy these updated files

- Replace `index.html`
- Replace `historik.html`
- Replace `assets/js/app.js`
- Replace `assets/js/history.js`

Preserve `assets/js/config.js`, `assets/css/app.css`, `administrering.html`, `assets/js/admin.js` and `assets/js/scoring.js`. The ZIP also includes them (except your private config) for completeness, but they need no changes.

Commit and push to GitHub Pages, then hard-refresh the browser. The pages are labelled **v0.1.9**.

## Resulting behavior

- **Historik** opens without any password form. Supabase still signs the browser in anonymously, behind the scenes; the history RPC is read-only.
- **Spilsamlinger** chips show: `Kredsspil`, then **newly created categories (newest first)**, then `Klitmøller 2026`, `Hals 2025`, `Helsinki 2024`, `Hals 2024`, `Slettestrand 2023`, and `Alle` (the reset control) last. Selecting multiple chips still combines their games.
- **Registrering** has no Spilsamling selection block and no spilsamling field in its review. At the **first actual submission**, it reads the currently active tag from Administrering and assigns that to the game. If no tag is active, `tournament_id` is `NULL`, meaning **Kredsspil**.
- On a failed or uncertain network save, the app retries with the same request ID, captured timestamp and tournament tag. Changing the game form clears this snapshot. This prevents accidental reclassification of a retry.
- Dates are still saved automatically. All payouts and historical tournament assignments are unchanged.

**Important:** with no per-game Spilsamling selector, a game registered while Hals 2027 is active **will always be tagged Hals 2027**, even if it was intended as a Kredsspil. Switch the active category to Kredsspil in Administrering before saving such a game. To correct a mistaken tag on a saved game, a separate administration function would be needed in a future version.

## Verification

1. Open `historik.html` in a private browsing window. It should show history without asking for the registration password.
2. Create a new note, for example Hals 2027, in **Administrering**. It should appear immediately after Kredsspil in the history filters.
3. Activate Hals 2027 in Administrering. Register a game on another device and verify in Supabase `games.tournament_id` matches Hals 2027.
4. Deactivate Hals 2027 (choose Kredsspil as active). Register a second game and verify its `tournament_id IS NULL`.

The package includes automated JavaScript tests. The SQL has not been executed against your live database.
