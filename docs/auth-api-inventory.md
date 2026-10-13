# NSK – API-inventering och behörighetsmatris (integrationsfas)

**Omfattning:** genomgång av utvecklingsgrenen. Detta dokument ändrar inte produktion.

## Nuvarande beroenden
- `db.js` använder `APP_CONFIG.API_URL` eller `https://nsk-api.peter-hasselberg.workers.dev`. Läsning går genom `/api/<tabell>` och skrivning genom `adminRequest` med `nsk_admin_token`.
- `db.js` väljer i nuläget **NSK Team 18, säsong 2026** via en hårdkodad uppslagning i `lag`. Flera lag kräver ett nytt, serververifierat lagval och en stabil koppling mellan äldre numeriska lag-ID och nya lag-ID.
- `truppen/index.html` använder dessutom `admin-mode.js` och `/api/admin/status` för att visa och låsa redigering. Att dölja fält ger inte säkerhet om gamla skriv-API:er finns kvar.
- Isolerad staging har `/api/auth/me`, `/api/auth/roster-staging?team_id=...` och lagmedlemskap i D1. Testtruppen är **inte** samma data som produktions-Truppen.

## Behörighetsmatris – förslag, inte ännu implementerad i gamla API:t

| Funktion | Läsning | Skrivning | Befintlig koppling |
| --- | --- | --- | --- |
| Truppen: spelare, tränare och lagpersonal | Medlem i valt lag | `team_admin` + `roster:manage` | `spelare`, `tranare`, `lagpersonal` |
| Poolspel | Medlem i valt lag | Roll och `pool:create` eller motsvarande specifik åtgärdsrätt | `poolspel`, `matchkonfiguration` |
| Laguppställning | Medlem i valt lag | Roll och `lineup:edit` | `laguppstallningar` |
| Bytesschema | Medlem i valt lag | Roll och `shifts:check` | `/api/bytesschema/save` |
| Matcher | Medlem i valt lag | Roll och `match:manage`; särskild matchkod måste utredas | `/api/match/login` och matchanrop |
| Målvaktsstatistik | Medlem i valt lag | Roll och särskild statistikbehörighet (behöver definieras) | Inventeras vidare |
| Användare och lagroller | Begränsad till behöriga administratörer | `users:manage` och lagadministratör där det är relevant | `/api/auth/users`, `/api/auth/team-members` |

## Säkerhetskrav för nästa prototyp
1. Varje API-anrop ska härleda användaren från giltig session och kontrollera medlemskap i valt lag på **servern**.
2. Skrivning kräver både tillåten lagroll och relevant funktionsbehörighet. Ingen tillit till enbart UI eller klientens `team_id`.
3. Samtliga SQL-/databasuppdateringar ska begränsas till verifierat lag. Ett objekt-ID från ett annat lag ska nekas.
4. Gamla admin- och matchtoken får inte automatiskt likställas med nya sessioner.
5. Läs-API:er som exponerar lagdata utan inloggning måste skyddas före produktionsövergång.
6. Testdata, staging-databas och produktionsdata hålls helt separata.

## Nästa tekniska arbete
Bygg en isolerad integrationsadapter för **Truppen** som mappar den befintliga sidans läs-/skrivformat till staging-API:t, utan att ändra `db.js`, produktions-Worker eller `truppen/index.html`. Testa sedan rättigheter och lagisolering automatiskt före manuell kontroll.
