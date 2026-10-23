# Gemensam Träning – verifierad status 2026-10-23

**Produktion: INTE AKTIVERAD / INTE SLUTVERIFIERAD.** Den dedikerade isolerade Workern `nsk-api-isolated-preview` har `NSK_ENABLE_SHARED_TRAINING=true` och separat D1-bindning `AUTH_DB=b94c8dba-34be-4cff-a4e9-892caf4e3ddd`. Detta är **inte** produktionsworkern `nsk-api`.

## Vad som faktiskt har verifierats

- Cloudflare API bekräftade ovanstående isolerade Worker-bindning och flagga.
- Ett syntetiskt träningspass skapades, lästes, uppdaterades och raderades i **isolerad D1**. En uppdatering med föråldrad revision gav 0 ändrade rader. Testposten rensades.
- PR #278 lade till `scripts/training-payload-regression.test.mjs`.
- PR #279 lade till `scripts/training-authorized-http.test.mjs` med två simulerade ledare, delad läsning/skrivning, lagisolering och revisionskonflikt.
- PR #280 kopplade **båda** testfilerna till `.github/workflows/team-authorization-tests.yml`. GitHub Actions för PR #280 körde `security-checks` och `authorization` med godkänt resultat. PR #280 är mergad i `main` (commit `562ef4b1479376d0ccbb364d682600a311101cea`).

**Viktig gräns:** Mockade identiteter och direkt D1-SQL bevisar inte att två faktiska personliga sessioner kan använda den publicerade HTTP-API:n. Det testet återstår.

## Kvar innan produktion

1. Verifiera isolerad HTTP GET/PUT med **två verkliga syntetiska testledarsessioner**, inklusive att den andra ledaren ser första ledarens sparade träning.
2. Verifiera att en obehörig användare/annat lag får 403, att en föråldrad revision får 409, samt att giltiga sessioner inte ger 503. Använd endast testidentiteter och isolerade resurser; inga autentiseringstoken i chatt eller loggar.
3. Verifiera produktions-D1:s identitet, backup/återställning och migrationsplan. Kör migreringen först efter godkänd isolerad integration.
4. Publicera produktions-Worker med träningsflaggan av, verifiera befintliga rutter, aktivera därefter flaggan och kontrollera behörig läsning/skrivning samt mobilflödet.
5. Dokumentera faktiskt driftsatt commit, tidpunkt och återställningsåtgärd.

## Säkerhetsgränser

- Använd aldrig produktions-Baserow, produktions-D1, produktions-KV eller produktions-DO som testfixturer.
- Ändra inte produktionsflaggan innan stegen ovan är verifierade.
- Vid problem: slå av `NSK_ENABLE_SHARED_TRAINING` och återställ Worker/webbversion efter behov. **Radera inte** sparade produktionspass som rollback.
- Ett grönt GitHub-test är inte ett bevis på att produktions-API:n fungerar.

## Relaterade filer

- `worker/training-sessions-api.js`
- `migrations/20261022_training_sessions.sql`
- `scripts/training-authorized-http.test.mjs`
- `scripts/training-payload-regression.test.mjs`
- `.github/workflows/team-authorization-tests.yml`
