# PR #402 — verifierad kalenderimport

Status 2026-10-25: funktion och isolerat positivt E2E godkända. Kalenderändringen är inte publicerad i produktionen.

Kalenderns starttider, motståndare och planer sparas direkt i matchkonfiguration när poolspelet skapas. En importnyckel skyddar poolskapandet mot dubbletter. Delvis sparad import återupptas i samma poolspel och hoppar över matchrader med samma metadata. Avvikande metadata ger ett fel och skrivs inte över. Högst två lag och åtta matcher per lag stöds.

## Kod och byggpaket

- Förenat med main efter PR #403, inklusive sparande och omladdning av tom match.
- calendar-match-plan.mjs inkluderas nu i appens publiceringspaket och syntaxkontroll.
- 51 riktade lokala tester passerade, inklusive sparflödets avbrott och återupptagning för 1, 4, 5, 6 och 16 matcher.
- Åtta PR-workflows var gröna på 566cc982c8390804a636c2d296ca072fe27d0f48.

## Verkligt positivt E2E

Kördes från den inloggade isolerade testappen via dess befintliga D1- och API-servicebindningar. API-versionen innehåller PR #402:s importnyckelväg och verifierades vid den separata isolerade driftsättningen. Den äldre blockerade preview-workflowen är fortsatt avstängd.

- API: nsk-api-isolated-preview, version 5b35e3a1-05fe-4785-b416-4983579405f5.
- Testapp: nsk-app-isolated-preview, version e51558d7-fa3e-4c9a-87c9-9385174fd187.
- Baserow: databas 599495, poolspel 1273721, matchkonfiguration 1273730.
- D1: b94c8dba-34be-4cff-a4e9-892caf4e3ddd. Isolerade KV- och ShiftLock-resurser bevarades.
- Samtliga fem fall passerade: 1, 4, 5, 6 och 16 matcher. Det gav 32 verifierade matchrader, tomma målvakts- och spelarlänkar och rätt kronologiska lagfördelning.
- Samma importnyckel gav samma pool-ID. Ändrad payload gav 409.
- Dubblett av match samt metadata-PATCH nekades. Sparad information bevarades.
- Delvis sparad import lästes tillbaka och återupptogs utan ny pool eller omskrivning av redan lyckade matchsteg.
- Anonymt anrop, saknad personlig behörighet och saknat medlemskap nekades.
- Tillfälliga testkonton och deras sessioner, medlemskap och grants raderades. En separat D1-kontroll visade noll återstående rader i samtliga fyra kategorier.

Exakta test-ID:n och kontrollpunkter finns i [calendar-import-402-e2e-result.json](calendar-import-402-e2e-result.json). Den körda testfunktionen finns i [scripts/calendar-isolated-bound-e2e.mjs](../scripts/calendar-isolated-bound-e2e.mjs). Den används bara av testappens särskilda, inloggningsskyddade provsida och ingår inte i produktionsappen eller produktions-API:t.

CI-provet kunde inte skapa testidentiteten eftersom CI-anslutningen saknar D1-rättighet. Det godkända verkliga provet använde testappens befintliga databasbindning. Ett första samlat runtime-prov nådde anropsgränsen; slutprovet delades därför upp per matchantal. Syntetiska Baserow-poster har behållits för granskning, inklusive poster från det avbrutna försöket.

## Kvar före produktion

Publicera det nya API:t före klienten. Samordna aktivering av personliga pool- och matchskrivningar i API och klient; produktionsflaggorna är fortfarande avstängda. Kontrollera kontots medlemskap och relevanta personliga rättigheter innan ett avgränsat produktionsprov. Inga produktionsflaggor eller historiska matchdata ändrades under kalenderarbetet.

Om Baserow skriver en pool men svaret inte når Durable Object förblir importnyckeln pending. Automatisk ny POST blockeras och importen behöver stämmas av manuellt. Låsningen ersätter inte ett globalt unikt databasindex för skrivningar utanför Workern.
