# Whist v0.2.7 — Synergi og Stillingshistorik

Dette er en **frontend-only** opdatering oven på Whist v0.2.6.

## Ændringer

- Synergi anvender nu kompakte celler, så seks spillere (7 × 7 tabelfelter inklusive overskrifter) kan være synlige på en telefon uden vandret rulning. Ved flere spillere bruges vandret rulning.
- Farveforklaringen med negative/nul/positive point under Synergi er fjernet.
- Under "Sådan beregnes Synergi" er sætningerne om solomeldinger, spillerudvælgelse og farvestyrke fjernet.
- Stillingshistorik er nu den tredje visning under **Stilling**, sammen med **Podie** og **Pointdiagram**. Det selvstændige Stillingshistorik-modul længere nede på siden er fjernet.
- Historikgrafen henter de samme tal som før og tegnes først, når visningen bliver åbnet, så den måler den synlige container korrekt.

## Installation

Erstat kun:

- `statistik.html`
- `assets/js/stats.js`
- `assets/css/app.css`

Behold alle andre filer, herunder `assets/js/config.js`, `assets/js/synergy-model.js`, `assets/js/score-history-model.js` og `assets/js/score-history-chart.js`.

Ingen ny SQL-migration er nødvendig. Den eksisterende SQL fra v0.2.6 (`20_standings_history.sql`) skal stadig være installeret.

## Verifikation

- `node --check assets/js/stats.js` bestået.
- Browser-test med seks spillere ved 320, 390, 620 og 900 px bestået uden horisontal overflow.
- Browser-test med syv spillere bekræfter vandret rulning på 320 og 390 px.
- Browser-test bekræfter, at alle tre faner kan vælges, at grafen initieres med positiv bredde, og at spillerlegenden stadig kan bruges.

**Begrænsning:** Testene er kørt lokalt med simuleret statistik og en diagram-fixture, ikke mod dit live Supabase-projekt.
