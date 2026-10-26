# Poolspelsflödet

Synlig appversion är fortsatt 1.0.

Manuella poolspel och kalenderimporter använder samma laguppställning, bytesschema och matchvy. Kalenderimportens faktiska matchposter utgör dess plan; manuella planer omfattar alla valda lag och matchnummer. Kalenderimport skapar aldrig en extra match för att fylla ut ett ojämnt antal.

En fullständig Match 1 fyller kommande tomma matcher för samma lag. Befintliga spelarval och genomförda byten skrivs inte över. Starttid, motståndare och plan behålls per match. Matchinfo kan sparas separat från en ofullständig uppställning. En materialförvaltare väljs bland lagets tränare för hela poolspelet, utan att appbehörigheter ändras.

Uppställningens Spara-knapp och väntande autosparningar använder en fångad kopia av poolspel, lag, match och formulärvärden. Intern navigering väntar på sparandet. Ett serverjournalfört, ofärdigt sparande blockerar bytehantering tills användaren sparar uppställningen igen. Baserow har ingen gemensam transaktion för dessa tabeller: delsteg kan finnas efter ett nätfel, men visas inte som bekräftat sparade. Spara igen återanvänder matchposten. Matchen kontrolleras mot aktuell uppställning före start.

Schemagenerering kräver personlig lineup-behörighet. Bockning kräver personlig shifts-behörighet. Befintliga behörighetskontroller för match och lineup körs även i det samlade sparandet. Påbörjade matcher låser spelaruppställningen; matchinfo kan fortfarande ändras. Avslutade poolspel måste återöppnas före skrivning. Schemaåterskapning får inte nollställa genomförda byten.

Radering kräver personlig pool-behörighet i det verifierade ägarlaget. En D1-journal sparar en plan över betrodda kopplade rader och blockerar fortsatta ändringar. Barnrader tas bort före poolraden i återupptagbara omgångar. Ett avbrott lämnar en Fortsätt radering-knapp. Delade ägarkopplingar avvisas. Kalenderkällan i SvenskaLag ändras inte.

## Drift

1. Tillämpa den additiva migrationen `migrations/20261026_pool_flow.sql`.
2. Bygg och syntaxkontrollera `scripts/build-pool-flow-addon.mjs` mot hashverifierad aktuell Worker.
3. Publicera addon och aktivera `NSK_POOL_FLOW_ENABLED=true`, med övriga bindningar bevarade.
4. Publicera frontend med `POOL_FLOW_ENABLED: true`.

Wrappern behåller tidigare autentisering, Skills/PIN, personkort och slipningsfunktioner. API:t fungerar som tidigare när serverflaggan saknas. Matchdatabasens externa skriverier kan inte göras atomiska med D1; journal och återupptagning hanterar avbrotten.
