# Whist v0.2.8 — Meldingsstatistik: gennemsnit og afvigelser

Dette er en frontend-opdatering oven på v0.2.7. Ingen SQL-migration.

## Ændringer

1. **Meldinger** er nu en procentdel: `100 × antal egne meldinger / antal spillede hænder`.
2. Den øverste række **Gennemsnit** viser det aritmetiske gennemsnit af de individuelle spilleres statistik. Hver spiller vægtes lige meget, uanset antal spillede hænder. Spillere uden en defineret måling i en given kolonne (fx Under uden nogen meldinger) medtages ikke i den kolonnes gennemsnit; deres celle vises som `—`.
3. Knappen **Vis afvigelse** til højre for overskriften skifter mellem faktiske spillerresultater og forskelle fra spillergennemsnittet. I afvigelsesvisningen forbliver gennemsnitsrækken i faktiske tal, så den fungerer som reference.
4. Procentkolonner (Meldinger, Under, Over og Præcis) viser forskellen i **procentpoint (pp)**, fx `+12,3 pp`. Stikafvigelse, absolut stikafvigelse og point pr. spil viser forskellen i deres normale enheder, fx `−0,25`.
5. Tabellen følger som før Spilsamlinger, gæstespil og alfabetisk spillerrækkefølge. Podie, Pointdiagram, Stillingshistorik, Synergi og de bagvedliggende SQL-beregninger er uændrede.

## Opdater disse fire filer i GitHub

- `statistik.html`
- `assets/js/stats.js`
- `assets/js/stat-metrics.js`
- `assets/css/app.css`

Behold `assets/js/config.js` og resten af filerne. Commit og push, og genindlæs siden. Versionsnummeret er `v0.2.8`.

## Verifikation

- JavaScript-syntaks for `stats.js` og `stat-metrics.js` testet med Node.
- Enhedstest for procentandel, ligevægtet gennemsnit, procentpointsafvigelser, ingen meldinger og alfabetisk sortering.
- Chromium-test på 320, 390 og 900 pixels: gennemsnitsrække, knap/toggle, delta-tilstand og layout. Brugte testdata og ikke live Supabase.
