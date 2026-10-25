# PR #402 — releasegräns för kalenderimport

**Status 2026-10-24: godkända kodtester, ej E2E-godkänd och inte klar för produktionspublicering.**

## Kontrollerat

- GitHub Actions på commit `a08b1b8c985fb3449a064820523170eedbe04748`: åtta relevanta workflow-körningar gröna, inklusive validering av isolerat Worker-paket **utan driftsättning**. Tidigare 10/10 gröna på `7fcb0cd1163b63bc7fcde01a7da8c6a5bea7a486`.
- `nsk-api-isolated-preview` finns separat från produktionens `nsk-api`.
- Dess Cloudflare-bindningar är isolerade: D1 `b94c8dba-34be-4cff-a4e9-892caf4e3ddd`, separata KV-resurser, eget `SHIFT_LOCK`, `NSK_ISOLATED_MODE=true`, Baserow-databas `599495`.
- Cloudflare bekräftar att `nsk-api-isolated-preview` kör **version 11**, driftsatt 2026-10-24 22:20 UTC (`e326ca7f-4f46-45e5-b994-abbb1a2ad9bd`). Nedladdat aktivt Worker-paket saknar texten `calendar_import_key` och kan därför **inte** användas som bevis för PR #402:s idempotenta importväg. Kontrollera källkod/versionskoppling innan E2E.
- `.github/workflows/start-isolated-api-preview.yml` är uttryckligen blockerad av `&& false`. Ta inte bort detta som en genväg.
- Isolerad D1 innehåller bland annat `auth_users`, `auth_sessions`, `auth_team_memberships`, men ingen `pool_calendar_imports`. Den tabellen behövs av en separat `calendarImport:true`-väg, inte av `calendar_import_key`-vägen i PR #402.

## Driftsättningsspärr och nästa säkra steg

- Den existerande preview-workflowen är avsiktligt inaktiverad. Aktivera inte den utan att först verifiera isolerade Baserow-tokenens tabellbehörigheter, samtliga bindningar och positiv skrivberedskap.
- Ta fram och granska en separat, uttryckligen godkänd driftsättningsväg för PR #402:s Worker-kod till **endast** `nsk-api-isolated-preview`; behåll D1/KV/DO och Baserow `599495` isolerade och oförändrade.
- Efter driftsättning, verifiera att den aktiva Worker-koden faktiskt innehåller `calendar_import_key` innan någon skrivning görs. CI:s gröna bundle-test är inte en driftsättning.
- Håll produktionspublicering och merge blockerade tills nedanstående positiva E2E-fall passerat.

## Kvarvarande riktad E2E-verifiering

Använd enbart godkänd, isolerad Worker-version av denna PR och isolerade Baserow-resurser, aldrig produktionen. Testa med ett syntetiskt konto som har medlemskap och `pool`- och `matches`-rättighet i testlaget:

1. Kontrollera faktisk Workers-kodversion och att alla Baserow-tabell-ID:n är de isolerade. Bekräfta tillhörande tokenbehörighet utan att exponera token.
2. Skapa syntetiskt poolspel med `calendar_import_key`, spara matchmetadata utan målvakt eller spelare.
3. Upprepa exakt samma pool-POST med samma UUID och identisk payload: samma ID och inga dubbletter.
4. Upprepa med samma UUID men ändrad payload: 409, ingen skrivning.
5. Läs tillbaka matchkonfigurationen via personligt autentiserad, lagbegränsad läsväg.
6. Avbryt efter ett framgångsrikt skrivsteg och återuppta; verifiera samma pool-ID och att matchdata inte skrivs över.
7. Kontrollera nekade försök utan medlemskap/personlig behörighet.
8. Ta bort de syntetiska testposterna i isolerad Baserow efter verifiering, om säkert och uttryckligen godkänt.

### Kända begränsningar

Om Baserow hinner skriva men svaret aldrig når Durable Object registreras importnyckeln som *pending* och automatisk ny POST blockeras. Detta skyddar mot dublett men kan kräva manuell avstämning. Låsningen är inte ett globalt unikt index för skrivningar utanför denna Worker.

**Ingen merge till main och ingen produktiondeploy baserat enbart på gröna unit-/mocktester.**
