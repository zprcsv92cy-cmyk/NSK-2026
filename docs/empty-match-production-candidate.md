# Produktionskandidat: spara tom match

Förberedd 2026-10-25 från main `cd0dd02` (max åtta matcher per lag).

En match utan målvakt och spelare kan sparas med starttid, motståndare och plan.
Appen skickar `player_count: null`, `goalie_player_id: null` och
`players_on_field: []`. API:t sparar tomma målvakts- och spelarlänkar samt tomt
antal spelare. Inga nya Baserow-fält eller migreringar behövs.

En delvis ifylld uppställning följer tidigare validering. Behörighetsflaggor,
medlemskap, kontroll av matchens poolspel och kontroll av valda spelares
lagtillhörighet ändras inte. Både befintligt Adminläge och den flaggstyrda
personliga behörighetsvägen stöds. Ingen behörighetsflagga aktiveras här.

Omsparning använder den befintliga matchraden. En sparad tom match kopierar
inte längre uppställningen från Match 1 när den öppnas igen. Kopiering för
matcher utan en sådan sparad tom konfiguration behåller tidigare beteende.

## Kontroller

- 78 lokala tester passerade: sparflöde via app, databasadapter och Worker,
  återläsning och omsparning, omladdning av tom match med fylld Match 1,
  ogiltiga och främmande spelare, saknad eller ogiltig session, fel lag,
  saknad behörighet samt klientens ordinarie publiceringskontroller.
- Produktionsbundeln byggd med samma esbuild-version som repositoryts workflow.
- JavaScript-syntax och `git diff --check` godkända.
- Ett befintligt test för anonym åtkomst förväntade 403 trots att oförändrad
  main redan svarar 401. Testet förväntar nu 401 och verifierar fortfarande att
  inga externa anrop sker. Ingen behörighetskod ändrades för detta.
- Det nya funktionstestet körs även i appens och API-bundelns workflows.

Kontrollerna för denna kandidat använde syntetiska data och mockade nätverksanrop.
Den tidigare isolerade integrationen testades live; denna nya kandidat har inte
driftsatts eller skrivtestats mot produktionen.

## Publiceringsordning

1. Behåll aktuell API-version som återställningspunkt. Bygg och ladda upp
   kandidaten med befintliga produktionsbindningar, hemligheter och flaggor
   bevarade; granska den uppladdade versionen före aktivering.
2. Aktivera API-kandidaten före frontend. Den tidigare klienten fortsätter
   fungera eftersom API-ändringen även accepterar fullständiga uppställningar.
3. Publicera därefter appändringen via ordinarie versionsstämplade workflow.
   En push av app.js eller db.js till main startar denna publicering automatiskt.
4. Kontrollera den publicerade versionen och gör ett avgränsat funktionsprov i
   särskilt identifierade testdata; ändra inte det avslutade poolspelets historik.

## Återställning

Återställ frontend först och API därefter till respektive föregående version.
Befintliga tomma Baserow-värden behöver inte migreras eller tas bort. Den äldre
API-versionen kan neka omsparning av en tom match tills uppställningen fyllts i.
Återställning ska inte ändra behörigheter, tränarval, byten eller historik.

Kandidaten är endast förberedd lokalt. Ingenting har pushats till main, och
ingen API- eller appversion har publicerats under denna förberedelse.
