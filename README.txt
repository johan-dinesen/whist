Whist v1.0.0 — Fjern Tidstrend fra Meldingsstatistik

Opdater kun disse tre filer i GitHub-repositoriet:
- statistik.html
- assets/js/stats.js
- assets/css/app.css

Slet desuden denne nu ubrugte fil fra den forrige opdatering:
- assets/js/time-trend-model.js

Meldingsstatistik viser herefter udelukkende den oprindelige tabel med alle
syv statistikker, Gennemsnit-kolonnen og spillernes egne værdier.
Både "Se trends" og "Vis afvigelse" er fjernet.

Andre moduler (Stilling, Synergi, Hænder) bevares uændret.
Ingen SQL-migration er nødvendig; den tidligere trendstatistik hentes ikke
længere fra databasen.

Den synlige versionsetiket forbliver v1.0.0. CSS/JS-links i statistik.html
har en ny cache-nøgle, så browseren indlæser de ændrede filer.
