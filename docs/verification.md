# Verification notes

Static JavaScript syntax was checked using `node --check assets/js/app.js`.
This repository has not yet been connected to an actual Supabase project, so
real authenticated inserts and all Postgres procedures still need live end-to-end
testing before use with important game records.

A safe check after setup:
1. Visit `?preview=1` and walk through each call type; pressing save MUST say
   it is only a preview and cannot save.
2. Visit the ordinary page; ensure logged-out users see login, not registration.
3. Add your user to `public.registrars`; sign in and register one test game.
4. In the Supabase table editor, confirm **one** `games` row and **four**
   `game_participants` rows, including correct `seat` order and caller/partner.
5. Retry after a simulated connectivity failure, and verify no duplicate rows.
6. Try `Gode` and ensure it only offers clubs/no trump; test solo calls with
   two callers and independent outcomes.
7. Register one game as "Uden turnering" and one linked to Klitmøller 2026.
8. Confirm an unapproved account cannot list players or register games.
9. Keep test data clearly labeled and remove it through the Supabase admin
   interface before entering real results.
