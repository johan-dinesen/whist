# Whist v0.1.11 · Profilbilleder i Administrering

Dette er **kun** en opdatering af Administrering. Der oprettes ingen Statistik-side, og Registrering/Historik ændres ikke.

## Installation

1. Opret en sikkerhedskopi af din Supabase-database eller eksportér de eksisterende tabeller.
2. Gå til **Supabase → SQL Editor → New query**. Indsæt hele `sql/15_profile_administration.sql`, og kør det. Det forudsætter, at de eksisterende migrationer `04_shared_password.sql` og `07_administration.sql` allerede virker. **Du skal ikke oprette eller ændre nogen af adgangskoderne.**
3. I dit nuværende GitHub Pages-repository erstatter du:
   - `administrering.html`
   - `assets/js/admin.js`
   - `assets/css/app.css`
   - og tilføjer den nye `assets/js/profiles.js`.
4. **Behold** `assets/js/config.js`, `assets/js/app.js`, `assets/js/history.js`, `assets/js/scoring.js`, `index.html`, `historik.html`, dine importfiler og alle øvrige filer uændrede.
5. Commit og push. Når GitHub Pages har opdateret, genindlæs Administrering og kontroller versionsmærket **v0.1.11**.

SQL-filen er genkørbar og modificerer ikke registrerede spil, eksisterende spiller-ID'er eller turneringsvalg. Den opretter kun adgangsfunktionen, upload-rettigheder og Storage-bucketen `whist-profiles`.

## To niveauer med ét adgangskodefelt

- **Registreringskode**: Giver adgang til Profilbilleder. Den eksisterende 30-dages browserautorisation genbruges, så man normalt ikke skal skrive koden igen, hvis den allerede er indtastet ved registrering.
- **Administrationskode**: Giver adgang til både Profilbilleder og de eksisterende funktioner til at vælge/oprette Spilsamlinger. Administrationstilstanden bevares i 12 timer.
- Der er kun **ét** felt mærket *Adgangskode*. Der er ingen tekst, som fortæller brugeren, at der findes to forskellige koder.
- Hvis man allerede har registreringsadgang, er Profilbilleder synlig med det samme. Knappen **Indtast kode** gør det muligt at angive en anden kode.
- **Lås adminfunktioner** fjerner adminadgang på denne enhed. Den ændrer ikke den eksisterende registreringsadgang. Har man registreringsadgang, bliver Profilbilleder stående.

De to koder skal være forskellige, og de eksisterende hashes forbliver i Supabase. Firewalls/fejlratebegrænsninger er ikke stærkere end den eksisterende anonyme Supabase-session; brug lange, hemmelige adgangskoder.

## Profilbilleder

Vælg en aktiv spiller (også gæster) på Administrering, vælg JPG/PNG/WebP og tryk **Gem profilbillede**. Appen beskærer billedet centralt til **512 × 512 pixels**, konverterer til **WebP**, og uploader højst 2 MiB.

Filnavnet er altid spillerens eksisterende database-ID, fx `11111111-1111-1111-1111-111111111111.webp`. Et nyt billede for samme spiller overskriver det gamle. Upload påvirker ikke score, games eller player-ID. Billederne er **offentligt læsbare** fra Supabase Storage, så de kan anvendes i fremtidige stillinger uden login. Skrivemulighed kontrolleres derimod i Supabase RLS for hver upload.

Billederne kan findes under **Supabase → Storage → whist-profiles**. Ingen Statistik- eller stillingskomponent er lavet i denne version.

## Efter installation: hurtig kontrol

1. På en browser uden adgang: Åbn Administrering. Kun et neutralt adgangskodefelt skal vises.
2. Indtast den normale registreringskode: Profilbilleder vises, men ikke Aktiv spilsamling/Opret ny spilsamling.
3. Vælg en spiller, upload et billede, og kontrollér filen i Storage-bucketen.
4. Klik **Indtast kode** og indtast adminadgangskoden: Begge moduler er nu synlige.
5. Genindlæs: Adgangsniveauet skal huskes på samme browser indtil sessionen udløber.
6. Ved en forkert kode skal adgangsniveauet ikke stige.

## Verifikation og forbehold

Testet med en lokal Chromium-browser og simulerede Supabase-svar: forkert kode, registreringsniveau, visning af moduler, valg af gæst, konvertering/upload af billede, opgradering til admin, oprettelse af spilsamling og låsning af adminfunktioner. Den rigtige SQL-migration og den rigtige Storage-upload er **ikke afprøvet på din Supabase-instans**. Hvis Storage afviser en upload, kontrollér at migrationen er fuldt kørt og at sessionen ikke er udløbet.
