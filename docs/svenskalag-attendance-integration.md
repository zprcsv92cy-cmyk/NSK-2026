# SvenskaLag-kallelsesvar – säker integration för NSK Team 18

## Status 2026-10-24
SvenskaLag visar i sin egen tjänst vilka spelare och tränare som tackat ja/nej
eller inte svarat. Den offentligt synliga API-dokumentationen på
https://api.svenskalag.se/scalar/ visar API-nyckel via `X-Api-Key` och
medlemsuppgifter, men vi har **inte verifierat** ett endpoint-kontrakt för
aktivitetskallelser/närvarosvar.

Därför gör denna förändring **inga live-API-anrop och inga skrivningar**.
`worker/svenskalag-attendance.js` är en strikt normaliserare som kan användas
när SvenskaLag bekräftat ett giltigt endpoint och dess JSON-schema.
Formatet i filen är ett internt *målformat*, **inte** ett påstående om SvenskaLags schema.

## Begär från SvenskaLag
- Ett dokumenterat läsendpoint för aktiviteter och kallelsesvar per lag.
- Ett API-nyckelkonto med endast läsrättighet för rätt lag/grupp.
- Format för stabilt aktivitet-ID och medlems-ID, roll spelare/ledare och
  svaren Kommer/Kan ej/Ej svarat; stöd för ändrade/inställda aktiviteter.
- Bekräftelse att deras avtal och integritetsvillkor tillåter synkronisering
  av minderårigas kallelsesvar till en lagapp med rollbaserad åtkomst.

## Aktiveringskrav
1. Lägg API-nyckeln enbart som Cloudflare Worker-secret; aldrig i GitHub/appen.
2. Hämta uppgifterna endast server-side via autentiserad, lagscope:ad endpoint;
   personal och andra lags uppgifter ska nekas.
3. Koppla varje träning till **verifierat** SvenskaLag-aktivitet-ID och varje
   spelare/tränare till verifierat medlems-ID. Namn eller bara datum duger inte.
4. Normalisera endast ID + roll + Kommer/Kan ej/Ej svarat. Hämta/spara inte
   kommentarer, kontaktuppgifter, diagnoser eller frånvaroorsaker.
5. Visa en förhandsgranskning med separata spelar-/tränargrupper och
   oidentifierade personer; stoppa import om någon saknar verifierad matchning.
6. Först efter granskning: uppdatera eventuellt `selected`/`selectedCoaches`
   i befintligt träningssession-API med revision, utan att ändra målvakter,
   övningar, gruppindelning eller andra manuella fält. Synka inte automatiskt
   förrän åtkomst, rollgränser och regressionsprov är verifierade.

**Avsiktlig begränsning:** Ingen API-endpoint gissas fram och inga personuppgifter
läses eller skrivs i denna PR.
