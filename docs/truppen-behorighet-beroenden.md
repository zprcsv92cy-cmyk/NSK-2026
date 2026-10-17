# NSK – kontroll av Truppen-beroenden (endast testgren)

## Verifierat i befintlig kod
- `db.js` är det gemensamma datalagret som används av `skapapoolspel/index.html`, `laguppstallning/index.html` och `bytesschema/index.html`.
- `DB.listPlayers()` och `DB.listCoaches()` hämtar befintliga spelare/tränare och filtrerar på valt lags ID.
- `DB.listStaff(role)` hämtar lagpersonal från `/api/lagpersonal?team_id=...`.
- `DB.getPlayersOnField()` kopplar spelare till matchkonfiguration med befintliga spelar-ID:n.
- `DB.getLineup()`, `DB.listUsedPlayersInPool()` och `DB.listShiftSchema()` använder spelar-/match-ID:n i befintliga poolspel, laguppställningar och bytesscheman.
- `DB.listPlayerCoachMap()` kopplar spelare och tränare via befintliga ID:n.
- Flera skrivfunktioner går genom `adminRequest()` och det äldre adminläget.

## Viktig kompatibilitetsrisk
Testmiljöns `auth_roster_staging` använder UUID och egna testuppgifter, medan den befintliga appen använder numeriska ID:n i relationer. Testtruppen kan därför **inte** ersätta `DB.listPlayers()` eller `DB.listCoaches()` direkt utan att befintliga poolspel, uppställningar och bytesscheman riskerar att tappa kopplingar.

## Säker fortsatt ordning
1. Behåll befintliga datakällor och ID:n oförändrade.
2. Inför först sessions- och lagkontroll för läsning i en isolerad staging-adapter.
3. Definiera behörighetskontroll för befintliga skriv-API:er på serversidan innan adminläget kan ersättas.
4. Testa att befintliga poolspel, laguppställningar och bytesscheman fortfarande hittar samma spelare och tränare.
5. Ingen migrering av riktiga uppgifter och ingen ändring av produktion förrän samtliga kopplingar är verifierade.

## Status
Kartläggning klar; ingen ändring av produktionskod eller riktiga uppgifter.
