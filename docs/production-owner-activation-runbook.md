# Skarp aktivering av NSK:s huvudadministratör

**Status 2026-10-17:** Produktionsdatabasen `nsk-auth-production` är nåbar och har de nödvändiga tabellerna. Vid senaste read-only-kontrollen innehöll `auth_users` **0 rader**. Den skarpa Workern `nsk-api` saknar `AUTH_DB`-bindning. Ingen produktionsaktivering är möjlig ännu.

## Stoppvillkor före kontoskapning

- Publicera **inte** `worker/production-entry-candidate.js` förrän samtliga historiska `/api/`-endpoints fungerar och har testats mot appens nuvarande funktioner. Kandidaten svarar avsiktligt 503 för flera ännu inte migrerade endpoints.
- Kontrollera att `nsk-api` har en korrekt D1-bindning `AUTH_DB` till den verifierade **produktionsdatabasen** med UUID `9f937bcb-b0c0-4129-af5b-775cf284dfcb`. Koppla aldrig staging-databasen.
- Kontrollera att `POST /api/auth/activate`, `POST /api/auth/login` och `GET /api/auth/me` är driftsatta och att befintliga sidor och API:er fortfarande fungerar.
- Läs databasen igen innan bootstrap: `npx wrangler d1 execute nsk-auth-production --remote --command "SELECT id,disabled FROM auth_users WHERE email='peter_hasselberg@hotmail.com'"`. Stoppa om ett konto redan finns.
- Skapa inte någon aktiveringskod förrän det finns en fungerande inloggnings- och aktiveringsväg för användaren.

## Operatörskörning när stoppvillkoren är uppfyllda

Utför endast från en kontrollerad terminal där Wrangler är inloggat mot rätt Cloudflare-konto och projektets branch har granskats. Använd inte ChatGPT eller GitHub Actions för att skriva ut någon aktiveringskod till offentliga loggar.

```sh
NSK_PRODUCTION_BOOTSTRAP=CONFIRM_PRODUCTION \
NSK_D1_DATABASE_ID=9f937bcb-b0c0-4129-af5b-775cf284dfcb \
node scripts/bootstrap-production-admin.mjs \
  'peter_hasselberg@hotmail.com' 'Peter Hasselberg'
```

Skriptet skapar ett **inaktiverat** konto och medlemskapet `('*', 'owner')` med personliga behörigheter; det genererar **inte** en aktiveringskod. Kontrollera resultatet med read-only SQL:

```sh
npx wrangler d1 execute nsk-auth-production --remote --command \
"SELECT email,disabled FROM auth_users WHERE email='peter_hasselberg@hotmail.com'"
```

Kontot ska existera med `disabled=1`. Kontrollera därefter att endast detta konto har `team_id='*'` och `role='owner'`, och att dess personliga behörigheter har tilldelats. Vid fel: stoppa och felsök; kör inte bootstrap igen blint.

**Separat aktivering:** När den skarpa endpointen är verifierad ska en engångskod med 120 minuters giltighet skapas i en autentiserad, behörighetskontrollerad process och överlämnas säkert direkt till kontoinnehavaren. Koden får inte läggas i kod, ärenden, PR-kommentarer, kommandologgar eller URL:er. Användaren väljer lösenord via `POST /api/auth/activate`, loggar in och verifierar lagåtkomst. Slutligen verifieras att en förbrukad aktiveringskod inte kan återanvändas.

## Separata arbetsmoment som återstår

1. Fullständigt godkända produktions-API:er och `AUTH_DB`-bindning utan regression i NSK.
2. Verifierad provisionering av det inaktiva kontot i produktions-D1.
3. Säker engångskod och aktivering, följt av riktig inloggning och rolltest.

**Denna instruktion utför inga produktionsskrivningar och publicerar ingen Worker.**
