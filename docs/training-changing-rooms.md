# Omklädningsrum till träning

Startsidan visar exempelvis **Lilla Hallen Omkl. 10 och 11** efter hallnamnet. Uppgifterna hämtas från Rosvallas offentliga Rbok-informationstavla (id `7a4f6400-3abd-4b6d-ad93-c7158bea2e1f`). Inga bokningar ändras och inga uppgifter skrivs till Baserow.

Endast bokningar för **Nyköpings Sportklubb / NSK 18** används. Datum och hall måste stämma och omklädningsrummets bokning måste täcka hela träningstiden. Två matchande rum visas tillsammans. Saknad start-/sluttid, okänd hall, annan lagbeteckning och fler än två motstridiga rum ger inget rumsnummer. Datumen saknar år på tavlan: endast verkliga datum inom 14 dagar från kontrollen accepteras, även vid årsskifte.

## Kontroller

- Varje dag kl. 10.00 i Europe/Stockholm, med automatisk sommar-/vintertid.
- Extra kontroll cirka två timmar före kalenderträning med känd starttid. Schemaläggaren går var 15:e minut: kontrollen kan ske upp till 15 minuter tidigare än tvåtimmarspunkten.
- Träningar skapade manuellt utan en motsvarande kalenderhändelse saknar starttid i schemaläggningsunderlaget och får därför ingen extra tidsstyrd kontroll.
- En ny sidvisning hämtar det senaste kontrollerade resultatet. När inget aktuellt resultat finns görs en direktkontroll, med två minuters teknisk cache.

Resultatet sparas under en separat nyckel i befintliga `NSK_TRAINERS`. Schemalagda kontroller som misslyckas skriver inte över tidigare resultat. Resultat äldre än 26 timmar används inte. Kontrolltiden finns som tooltip på hallnamnet när rum visas. Tavlan visar bara de bokningar den själv publicerar, så framtida eller redan passerade träningar kan sakna rum.

Den befintliga kalenderhämtningen var sjätte timme behålls. Den nya cron-raden är `*/15 * * * *`. Ingen extra hämtning sker om varken daglig kontroll eller kontroll före träning är aktuell. Isolerat läge hämtar aldrig tavlan. API-åtkomst kräver personlig inloggning, läsbehörighet och medlemskap i rätt lag. Endast filtrerade bokningar lämnas ut; hela tavlan och andra lags uppgifter skickas inte till appen.
