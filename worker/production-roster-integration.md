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
