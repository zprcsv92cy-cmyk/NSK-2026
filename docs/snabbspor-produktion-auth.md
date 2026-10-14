# Snabbspår: befintliga NSK-appen till inloggning

Mål: behåll befintliga sidor, layout, Baserow-ID och match-ID. Bygg inte om Truppen eller Poolspel.

## Granskat 2026-10-14
- `index.html` skickar vidare till `startsida/`.
- `db.js` läser fortfarande direkt från `nsk-api` utan användarsession i sina läsanrop.
- `worker/staging-entry.js` hanterar en separat autentiserings-Worker. Den serverar inte den befintliga produktionsappen.
- `worker/team-auth.js` har inloggning, sessioner och lagkontroll. Integrationens åtkomstkontroll är ännu inte ett skydd för de verkliga produktionsanropen.
- Staging-skrivskydd för Truppen och Laguppställning finns, men är inte automatiskt samma skydd som i produktions-API.

## Kortaste säkra genomförande
1. Kartlägg samtliga verkliga läs- och skrivvägar i `db.js` och NSK-API. Markera vilka som kräver autentisering, lagmedlemskap och specifik behörighet.
2. Inför en gemensam session i befintliga appen utan att ändra sidornas layout. Använd ett skyddat API som verifierar session och lag **på serversidan** för varje relevant anrop. Enbart dold knapp eller klientkontroll räcker inte.
3. Koppla befintliga funktioner till det skyddade API:t utan att ändra dataformat, spelarnas numeriska ID eller match-ID. Särskilt viktigt för poolspel, laguppställning, bytesschema och statistik.
4. Kör automatiserade testfall för anonym användare, läsbehörighet, rätt roll och fel lag mot samtliga endpoints. Kontrollera även att autentisering inte kan kringgås genom direktanrop till gamla API:t.
5. Kör regressionstester i mobil och dator. Ta säkerhetskopia och verifiera återläsning samt rollback innan produktionsdriftsättning.

## Produktionsgräns
Inga ändringar i produktions-API eller skarpa data utan separat granskning, säkerhetskopia, verifierade kritiska tester och uttryckligt driftsättningsbeslut.

**Status: integration ej klar. Ingen produktionsdriftsättning godkänd.**
