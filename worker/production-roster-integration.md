# Produktionsintegration – Truppen (arbetsplan)

## Verifierat från publicerad Cloudflare Worker `nsk-api`

- Den driftsatta bundle-koden anger `src/worker.js` som ursprungsfil. Den filen finns ännu inte i GitHub `main`.
- `POST /api/spelare`, `PATCH /api/spelare/:id`, `POST /api/tranare` och `PATCH /api/tranare/:id` använder idag gemensam session i `ADMIN_KV`.
- För PATCH läser servern befintlig Baserow-rad och verifierar lagkopplingen innan skrivning. Den kontrollen måste bevaras.
- `POST/PATCH /api/lagpersonal` använder också gemensam adminsäsong och KV-lagring `NSK_TRAINERS` per lag.

## Krav innan driftsättning

1. Ta fram versionshanterad kopia av faktisk Worker-källa och dess konfiguration. Behåll en verifierad rollback-version.
2. Verifiera personliga bearer-token **på servern** mot betrodd identitetstjänst; acceptera aldrig klientens roller eller lag-id som auktoritet.
3. För POST: härled och validera mållag på servern. För PATCH: härled mållag från den lagrade posten; neka vid avvikelse.
4. Kontrollera medlemskap och `roster:manage` för mållaget före varje skrivning. Utöka kontrollen till lagpersonal.
5. Kör negativa integrationstester (utan token, utgången token, fel lag, annan roll, manipulerat lag-id) och positiva tester i staging.
6. Migrera frontendens skrivfunktioner först när staging är grön; avveckla gemensam adminsession i en kontrollerad release.

Ingen produktionsendpoint aktiveras genom detta dokument.

## Säker migreringsordning (uppdaterad)

- **Nuvarande läge:** den ordinarie `truppen/index.html` använder `db.js` och det äldre adminläget för riktiga ändringar. Den personliga behörighetsindikatorn är informativ och ger inte skrivåtkomst.
- **Staging:** `/truppen-befintlig/` och `/api/auth/roster-staging` använder isolerade testposter; dessa är inte en kopia av produktionsregistret.
- **Spelare och tränare:** bevara befintliga rad-ID:n och lagkopplingar. POST kräver betrodd lagmappning; PATCH och eventuell DELETE kräver lagupplösning från den sparade raden innan skrivning.
- **Lagledare, fysansvarig och materialförvaltare:** bevara befintlig `lagpersonal`-lagring och kontrollera serverns lagkoppling vid varje skrivning.
- **Frontend:** aktivera aldrig personlig skrivning genom att enbart dölja/visa knappar. Skrivvägen måste först gå till ett serververifierat API.
- **Rollback:** spara och verifiera driftsatt Worker-kod, konfiguration och relevanta databackuper innan en framtida produktionsrelease.
- **Releasegräns:** ändra inte produktions-Worker `nsk-api` eller migrera riktiga truppposter utan separat uttryckligt godkännande.

## Produktions-Worker: verifierad återställningsreferens 2026-10-16

- Worker: `nsk-api`; Cloudflare deployment-ID: `17408693-062c-4f71-b36e-9eb37881536e`.
- Aktiv version: **42**, version-ID `95247668-0e10-4ba3-b6c5-469ed37a986c`, 100 % trafik.
- Publicerad: `2026-10-13T15:02:54.622304Z`.
- Konfiguration: compatibility date `2026-10-10`; binding-namn `ADMIN_KV`, `ADMIN_PASSWORD`, `BASEROW_DATABASE_ID`, `BASEROW_TOKEN`, `MATCH_PASSWORD`, `NSK_TRAINERS`, `SHIFT_LOCK`.
- Tidigare versioner finns listade i Cloudflare, men **återställning är inte provad**.
- **Viktigt:** Användaren har nu lämnat en kopia av Cloudflares visade `worker.js` (656 rader, kompilerad kod med `sourceMappingURL`). Kopian finns som uppladdad fil i konversationen och som separat lokal granskningsfil, **inte** i GitHub. Exakt byteidentitet mot Cloudflare version 42, fullständiga källmoduler och rollback är ännu inte verifierade. Versionsmetadata är inte en fullständig backup. Hemligheter och bindnings-ID:n ska inte läggas i repo.
- Produktions-Worker har inte uppdaterats genom denna inventering.

## Checklista för säker export och återställning

1. Exportera **den driftsatta versionens faktiska kod** från Cloudflare Workers: `nsk-api`, version 42 (`95247668-0e10-4ba3-b6c5-469ed37a986c`). Spara ursprungliga filnamn och modulstruktur.
2. Kontrollera att exporten kan läsas och byggas separat. Jämför relevanta API-rutter med den driftsatta versionen. Lägg **inte** in hemliga miljövariabler eller autentiseringstoken i GitHub.
3. Dokumentera bindningarnas **namn och typer**, compatibility date, routes och konfiguration separat från hemligheterna.
4. Ta en separat, verifierbar backup av relevant produktionsdata innan schemaändringar eller migrering. Export av Worker-kod är inte en databasbackup.
5. Förbered återställning till exakt versions-ID ovan, men **utför inte** återställning eller deployment som del av en skrivskyddad kontroll.
6. Testa den nya Worker-koden och negativa behörighetsfall i isolerad staging. Kontrollera därefter att staging använder egna databindningar och aldrig produktionens Baserow/KV.
7. Kräv separat godkännande innan produktions-Worker, produktionsbindningar eller riktiga truppdata ändras.

**Status 2026-10-16:** versions-ID och bindningsnamn verifierade via Cloudflare API. Användaren har delat en kompilerad `worker.js` från kodredigeraren; den behöver fortfarande matchas mot den driftsatta versionen och kompletteras med konfiguration och databackup. Ingen rollback har genomförts.

## Granskningsfynd från användarens Worker-kopia

- `POST/PATCH /api/spelare` och `/api/tranare` använder fortfarande gemensam `ADMIN_KV`-session och hårdkodad `NSK Team 18`-mappning.
- `/api/lagpersonal`-blocket ligger efter en generell `if (req.method !== 'GET') return 405`; dess `POST/PATCH` kan därför inte nås i den visade koden. Korrigering kräver säkerhetstester och godkänd release.
- Separata förberedande moduler `production-roster-team-resolver.js`, `production-roster-route-guard.js` och `team-authorization-policy.js` är **inte** importerade av produktions-Workern. Integrationstesterna kör dessa moduler med mockade datakällor och skriver inte i Baserow.
- **Nästa tekniska steg:** isolerad Worker-testhärva mot den mottagna koden med simulerad Baserow/KV, därefter personlig sessionsverifiering och behörighet för samtliga skrivvägar. Produktionsdriftsättning kräver fortfarande separat godkännande.

## Verifierad stagingkontroll – laguppställningar 2026-10-16

- Inloggad testanvändare har via webbläsaren gjort riktiga HTTP-anrop mot den isolerade stagingservern för `NSK Testlag 2`.
- `DELETE /api/auth/lineups-staging` returnerade **403 Forbidden**.
- `POST /api/auth/lineups-staging` returnerade **403 Forbidden**.
- `PATCH /api/auth/lineups-staging` returnerade **403 Forbidden**.
- Detta bekräftar att servern nekar dessa tre skrivmetoder för användarens aktuella behörighet i Testlag 2. Det verifierar **inte** alla skrivvägar i produktion eller ett fullständigt säkerhetstest av alla roller.
- GitHub Actions `Team authorization tests` och `Staging import preflight` var gröna för testcommit `ea9ccf47`. Testerna använder simulerad databas.
- Nästa releaseblockerare: återställningsbar versionshanterad produktions-Worker, säker koppling till personlig serververifierad identitet, verifierad teammappning, negativa och positiva stagingtester för produktionsskrivvägar samt separat produktionsgodkännande.
- Inga produktionsändringar har utförts som del av dessa kontroller.
