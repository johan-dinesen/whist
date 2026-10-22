# Whist v0.2.10 · Meldingsstatistik transponeret

Frontend-only opdatering. Statistikkerne står nu **ned ad rækkerne**, mens **Gennemsnit** og spillere vises som kolonner. Spillerkolonnerne er sorteret alfabetisk, med gennemsnittet først. Flere statistikker kan senere tilføjes som ekstra rækker ved blot at udvide `METRICS` i `assets/js/stat-metrics.js`.

**Vis afvigelse** bevarer v0.2.9-beregningen: `100 × |spillerens værdi − gennemsnit| / gennemsnit`. Gennemsnittet forbliver et absolut reference-tal i begge visninger. Ved et gennemsnit på nul vises `—`. Ingen ekstra hjælpetekst dukker op, når visningen skiftes.

På mindre skærme kan tabellen scrolles vandret. Der er ikke sticky spillerkolonner. Al øvrig statistik, scoring, diagrammer og filtre bevares.

## Installation

Udskift disse **tre** filer fra ZIP-arkivet:

- `statistik.html`
- `assets/js/stats.js`
- `assets/css/app.css`

Behold `assets/js/stat-metrics.js`, `assets/js/config.js` og alle andre filer uændrede. **Ingen SQL-migration.**

Version i siden: `v0.2.10`.

## Validering

JavaScript-syntaks, dataformatering, alfabetisk sortering og HTML-konsistens er kontrolleret lokalt. Live Supabase er ikke tilgængelig under udviklingen.
