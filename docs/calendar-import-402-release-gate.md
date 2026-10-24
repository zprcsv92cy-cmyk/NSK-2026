# PR #402 — releasegräns för kalenderimport

**Status 2026-10-24: godkända kodtester, ej E2E-godkänd och inte klar för produktionspublicering.**

## Kontrollerat

- GitHub Actions på commit `7fcb0cd1163b63bc7fcde01a7da8c6a5bea7a486`: 10/10 gröna.
- `nsk-api-isolated-preview` finns separat från produktionens `nsk-api`.
- Dess Cloudflare-bindningar är isolerade: D1 `b94c8dba-34be-4cff-a4e9-892caf4e3ddd`, separata KV-resurser, eget `SHIFT_LOCK`, `NSK_ISOLATED_MODE=true`, Baserow-databas `599495`.
- Den isolerade Workern kör version 10 från 2026-10-24 20:16 UTC, alltså **inte** den nya importnyckelkoden i denna PR.
- `.github/workflows/start-isolated-api-preview.yml` är uttryckligen blockerad av `&& false`. Ta inte bort detta som en genväg.
- Isolerad D1 innehåller bland annat `auth_users`, `auth_sessions`, `auth_team_memberships`, men ingen `pool_calendar_imports`. Den tabellen behövs av en separat `calendarImport:true`-väg, inte av `calendar_import_key`-vägen i PR #402.

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
