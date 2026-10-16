# Personlig behörighet – isolerad Worker-integration (ej driftsatt)

## Verifierad status 2026-10-16

GitHub Actions **Team authorization tests**, **Staging import preflight** och **Automatisk appversion** är gröna för commit `b0625fdb`. Detta inkluderar regressionstester för staging-D1:s lagbegränsade PATCH och för att ett saknat AUTH_DB inte får leda till anrop mot LEGACY_API.

Det finns redan en separat Worker-konfiguration `wrangler.auth.staging.toml` med `AUTH_DB` kopplad till databasen `nsk-auth-staging`. Det verifierar **konfigurationen**, inte att D1 fungerar vid ett verkligt Cloudflare-anrop. Det finns även en manuellt startad GitHub Actions-workflow för stagingdeploy, men ingen ny sådan körning har verifierats i detta arbete.

Staging har en fungerande separat D1-baserad skrivväg `/api/auth/roster-staging` för testdata, med personlig sessionskontroll och lagbegränsade SQL-skrivningar. Den är **inte samma sak** som integration med produktions-Workerns Baserow/KV-baserade trupp- och lagpersonalrutter.

`authorizePersonalWorkerWrite` och dess Baserow/KV-resolvers är ännu fristående moduler, inte inkopplade i den riktiga Worker v42. Nuvarande tester använder mockar för identitet, Baserow och KV. Ingen produktionstoken eller produktionsskrivning har använts.

**Särskild risk att hantera:** staging-konfigurationen innehåller en service binding `LEGACY_API` till produktions-Workern `nsk-api`. Kommentaren ”read-only” i TOML begränsar inte tekniskt HTTP-metoderna. Inför ett framtida skrivtest bör den bindningen tas bort eller tekniskt begränsas till GET i en verifierad mellanhand; inga produktionsskrivningar får vara möjliga från staging.

## Före isolerad stagingdrift

1. Kopiera användarens Worker-kod till en separat, icke-produktionsbunden testmiljö; behåll originalet orört och bevara återställningsreferensen för version 42.
2. Lägg till separat `AUTH_DB` D1 med migrationsschema för `auth_sessions`, `auth_users`, `auth_team_memberships` och `auth_user_permissions`. Använd inte produktionens databas, token eller KV.
3. Säkerställ att medlemskapens `team_id` använder **Baserows numeriska ID som sträng** (exempelvis `18`) i adapterkedjan. Stagingkonton som använder `team-18` behöver explicit, betrodd mappning före användning; skriv inte om lag-ID från klientdata.
4. Anslut `authorizePersonalWorkerWrite` före varje faktisk skrivfunktion för `/api/spelare`, `/api/tranare` och `/api/lagpersonal`. Implementera serverägda `listTeams`, `readRow` och skrivfunktioner. Returnera status och JSON från beslutet; låt inte nekade anrop falla vidare till äldre adminhantering.
5. Avgränsa metodstödet: den befintliga `resolveLegacyRosterTeam` stöder bara POST och PATCH. DELETE är ännu inte färdigintegrerad och ska förbli nekad. Kontrollera att POST/PATCH för tränare använder rätt tabell och sparade lagkopplingar.
6. För `lagpersonal` måste `team_id` valideras på serversidan och POST/PATCH dessutom kontrollera personens roll, ID och aktuell KV-post. För PATCH får klientens `team_id` aldrig ensamt bestämma ägarskap om posten kan flyttas eller lagras globalt.
7. Befintlig gemensam adminsession får **inte** vara en reservväg till de personligt skyddade skrivrutterna. Övriga API-rutter (poolspel, match, bytesschema) använder fortfarande äldre autentisering och kräver separat migrationsplan.
8. Kör riktiga HTTP-integrationstester mot isolerad Worker med separat D1, simulerad Baserow och KV; testa positiva skrivningar, obehöriga, cross-team, utgångna sessioner, felaktiga lagkopplingar och driftstörningar.
9. Dokumentera dataexport, bindningar och en verifierad rollback innan någon framtida produktionsrelease.

## Releasegräns

Ingen av modulerna ovan importeras av den driftsatta `nsk-api`-Workern. Inga produktionsbindningar eller verkliga truppuppgifter får ändras utan uttryckligt godkännande.
