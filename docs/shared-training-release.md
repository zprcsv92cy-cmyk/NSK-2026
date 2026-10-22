# Gemensam Träning – publiceringsplan

Status: **INTE DRIFTSATT**. PR #269 är en releasekandidat, inte tillstånd att driftsätta. Följ stegen i ordning. Inga produktionsdata får kopieras till preview.

## 1. Förutsättningar (måste vara uppfyllda)

- Befintliga GitHub-kontroller för PR #269 måste vara godkända; ingen kringgång av branch protection.
- Isolerad Baserow-databas med tio tabeller, syntetiska lag och en token utan åtkomst till produktion måste vara verifierad enligt [isolated-baserow-integration.md](isolated-baserow-integration.md).
- Separata D1/KV/DO-bindningar och fungerande personliga inloggningar för två testledare ska vara verifierade i preview. Preview-workflowen är med avsikt låst tills dess.
- Kontrollera att endast behöriga medlemmar i samma lag kan läsa och redigera samma träningsdatum, att ett annat lag nekas samt att konflikt (revision 409) inte skriver över någon annans ändring.

## 2. Databasen före Worker

- Bekräfta backup/återställningsväg och rätt produktions-D1 innan någon migrering.
- Granska `migrations/20261022_training_sessions.sql`; migreringen skapar `training_sessions` och index, utan att ändra befintliga tabeller.
- Applicera migreringen på **bekräftad** produktions-D1 endast efter godkänd preview och uttryckligt produktionsbeslut. Bekräfta att tabellen finns efteråt.
- Sätt inte flaggan till true före detta steg.

## 3. API och webb

1. Publicera Worker-koden med `NSK_ENABLE_SHARED_TRAINING = "false"` och verifiera att övriga befintliga API-rutter fungerar.
2. Aktivera `NSK_ENABLE_SHARED_TRAINING = "true"` i Worker-konfigurationen **först efter** migrering och behörighetskontroll. Verifiera en läsning och en skrivning med ett behörigt testkonto, och ett avslag för fel lag.
3. Merga PR #269 till `main` efter godkända kontroller. GitHub Pages-workflowen publicerar då `home-training.js`, `shared-training.js`, `training-groups.js` och respektive sidor.
4. Kontrollera på mobil att Träning på startsidan är expanderbar, att vald dag öppnas och att två ledare i samma lag ser samma sparade uppgifter.

## 4. Återställning

- Vid fel: sätt omedelbart `NSK_ENABLE_SHARED_TRAINING = "false"` och återställ senast fungerande Worker-/webbversion vid behov.
- Radera **inte** `training_sessions` som snabb återställning: det skulle förstöra sparade träningsuppgifter. Återställ data separat utifrån verifierad backup vid behov.
- Dokumentera faktiskt deployad commit, tidpunkt och vem som godkände utrullningen.

## Nuvarande blockeringar

Preview-workflowen är låst, Baserow-mappning och isolerad token saknas i manifestet, och produktionens D1-migrering är inte utförd. Att koden kan mergas tekniskt innebär inte att gemensamma träningar fungerar i produktion.
