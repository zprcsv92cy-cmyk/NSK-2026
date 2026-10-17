# NSK – kontroll inför skarp drift

Den här checklistan gäller inloggning och lagbehörighet. Produktionsappen ändras inte av dokumentet.

## Steg 1 – autentisering
- [ ] Rätt lösenord ger inloggning.
- [ ] Fel lösenord nekas.
- [ ] Utloggning spärrar den tidigare sessionen.
- [ ] Utgången eller återkallad session nekas.
- [ ] Avaktiverad användare nekas.
- [ ] Inga lösenord eller sessionstoken syns i loggar.

## Steg 2 – lagbehörighet
- [ ] Användare får bara åtkomst till egna lag.
- [ ] Läsbehörighet kan inte skriva.
- [ ] Lagledare, tränare, fysansvarig och materialförvaltare får rätt åtkomst.
- [ ] Försök att byta lag-ID i anrop nekas på serversidan.
- [ ] Ändringar i behörighet får genomslag utan ny driftsättning.

## Steg 3 – befintlig app
- [x] Testmiljön kan läsa antal för NSK Team 18 utan att skriva till befintlig datakälla (8 spelare, 4 tränare vid senaste användartestet).
- [ ] Riktiga truppuppgifter visas enbart för behöriga användare.
- [ ] Ursprungliga spelar- och match-ID:n bevaras.
- [ ] Poolspel, laguppställning, bytesschema och statistik regressionstestas.
- [ ] Mobil och dator testas.

## Steg 4 – lansering
- [ ] Säkerhetskopiera datakällan och verifiera återläsning.
- [ ] Dokumentera rollback och vem som kan genomföra den.
- [ ] Godkänn samtliga kritiska tester.
- [ ] Planera och genomför separat produktionsdriftsättning.
- [ ] Följ upp fel och inloggningar efter driftsättning.

**Lanseringsbeslut: INTE KLAR.** Denna fil är en plan, inte bevis på att testerna har körts.
