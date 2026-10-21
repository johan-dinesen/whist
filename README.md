# Whist v0.1.10: renere brugerflade

## Installering i det eksisterende GitHub Pages-repository

Erstat filerne med samme sti:

- `index.html`
- `historik.html`
- `administrering.html`
- `assets/js/app.js`
- `assets/js/history.js`
- `assets/js/admin.js`
- `assets/css/app.css`

Behold `assets/js/config.js`, `assets/js/scoring.js`, alle SQL-filer og øvrige filer uændrede. Ændringen kræver **ingen SQL-opdatering**. Commit og push filerne, vent på GitHub Pages, og genindlæs eventuelt med Ctrl + Shift + R.

## Ændringer

- **Registrering:** Overskriften er nu »Registrer spil«. Introduktion, normal Supabase-status og adgangskodeforklaring over formularen er fjernet. Adgangskode indtastes stadig først ved gemning. Gæster vises alfabetisk **efter** de faste spillere, i samme knapnet.
- **Historik:** Introduktion, forklarende mobil-/gæstetekst, almindelige forbindelses-/opdateringsbeskeder og hele kolonnen »Note« er fjernet. »Opdatér historik« er fysisk mindre. De eksisterende filtre og 🏆-kolonnen bevares.
- **Administrering:** Introduktion og almindelige forbindelsesbeskeder er fjernet. Administration af spilsamlinger er uændret.
- **Fejl:** Supabase-fejl vises stadig diskret som rød tekst i stedet for at blive skjult helt. Ingen almindelige succes- eller indlæsningsstatusbeskeder vises.

## Verifikation

JavaScript-syntaks og tidligere scoring-/registrerings-/historik-/administrationstests er kørt lokalt. Browser-test på et isoleret HTML-fixture bekræfter rækkefølgen med gæster og størrelsen på opdateringsknappen. Ikke testet live mod dit Supabase-projekt.
