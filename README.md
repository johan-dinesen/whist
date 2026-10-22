# Whist v0.2.9: relativ afvigelse uden layoutskift

Dette er en **frontend-opdatering** til v0.2.8. Ingen databaseændringer og ingen SQL-migration.

## Opdaterede beregninger

I Meldingsstatistik bruger **Vis afvigelse** nu præcis:

`100 * |spillerens værdi - gennemsnittet| / gennemsnittet`

- Alle syv statistikker vises som procent ved aktivering af **Vis afvigelse**. Ingen procentpoint eller numeriske differencer.
- Gennemsnit-rækken viser fortsat de absolutte gennemsnitsværdier som reference.
- Hvis gennemsnittet er 0 eller praktisk taget 0, vises `—`, da forholdet ikke er defineret.
- Ved **negative** gennemsnit bliver det matematiske resultat negativt, fordi nævneren ikke er taget i absolutværdi. Hvis der i stedet ønskes altid positive afvigelser, skal nævneren være `|gennemsnit|`. Denne version følger den angivne formel bogstaveligt.

## Layout

Den forklarende linje under Vis afvigelse er fjernet helt fra HTML, ikke kun skjult. Dermed bliver tabellens lodrette placering uændret, når visningen skiftes.

## Installer

Opdatér kun disse fire filer i GitHub:

- `statistik.html`
- `assets/js/stats.js`
- `assets/js/stat-metrics.js`
- `assets/css/app.css`

Behold alle andre filer, især `assets/js/config.js`. Commit/push og genindlæs Statistik. Versionsnummeret er `v0.2.9`.

## Test

- Node.js-syntaks og beregningstests for positive og negative gennemsnit, nul-gennemsnit og manglende målinger.
- Browserfixture ved 320, 390 og 900 px bekræfter, at tabellens lodrette position ikke ændres ved klik, og at den ekstra linje er fjernet.
- Ikke testet mod en live Supabase-instans.
