# NSK – plan för säker integrering av lagbehörigheter

Status: planering på utvecklingsgrenen. **Ingen produktionsändring är godkänd eller utförd.**

## Kartläggning (2026-10-13)
- Staging kör separat Worker och D1-databas med sessionsinloggning, lagmedlemskap och personliga funktionsbehörigheter.
- Produktionsgränssnittet `truppen/index.html` använder fortfarande `admin-mode.js`, `nsk_admin_token` och `/api/admin/status`.
- Gemensamma `db.js` skriver via `adminRequest` med `nsk_admin_token` till befintlig `nsk-api`. Den innehåller även särskild matchinloggning. Detta kan inte ersättas genom att enbart dölja knappar.
- Sidorna för laguppställning, poolspel och bytesschema nyttjar den gemensamma datalagringen. Behörigheter måste kontrolleras på serversidan per lag och åtgärd.

## Införandeordning
1. Dokumentera alla läs- och skriv-API:er och deras lagkopplingar, särskilt lagpersonal, poolspel, laguppställning, bytesschema, målvaktsstatistik och matcher.
2. Inför en **separat integrationsmiljö** med kopia av relevanta gränssnitt, men inga produktionsskrivningar. Separata API-adresser och testdata krävs.
3. Lägg till central sessionshantering och aktivt lagval. Säkerställ att lagval inte ger åtkomst utan serververifierat medlemskap.
4. Migrera Truppen först: skydda både läsning och varje skrivoperation i API, kontrollera lagroll och funktionsbehörighet. Kontrollera användargränssnittet på mobil och dator.
5. Migrera övriga funktioner en i taget, med behörighetsmatris och tester för flera lag, utloggning, utgången session och nekad åtkomst.
6. Skapa en separat produktionsmigrering med databasbackup, återställningsplan, administratörskonto och uttryckligt godkännande innan publicering.

## Viktiga spärrar
- Rör inte produktions-Worker, produktionsdatabas, produktionssidor eller `db.js` under kartläggningen.
- Staging-testkontot och testlösenord får inte bli produktionskonton.
- Servern måste neka åtkomst även om användaren manipulerar lag-ID eller skickar API-anrop direkt.
- Behåll skyddet för sista aktiva lagadministratören.
- Ta bort äldre adminläge först efter att samtliga berörda API-anrop använder den nya serverkontrollen och återställning är testad.

## Nästa leverans
En inventering av endpoints och en konkret behörighetsmatris för NSK-funktionerna, följt av en isolerad integrationsprototyp för Truppen.
