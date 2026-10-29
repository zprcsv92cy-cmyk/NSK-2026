# NSK 1.1 – separat utveckling

Beslut 2026-10-29: nuvarande publicerade app ska lämnas oförändrad medan version 1.1 arbetas fram.

## Utgångspunkt

- Utvecklingsgren: `dev/v1.1`.
- Bas: `38978d0c3061c5d39ab37ffc7455298e82924e5e`, efter QR-utskriftsfix PR #570.
- Nuvarande publicerade version: 1.0, byggnummer 40946664125.
- `main` och den befintliga produktionspubliceringen används inte för utveckling av 1.1.

## Arbetsregler

- Alla ändringar för 1.1 görs på utvecklingsgrenen eller grenar som utgår från den. Inga ändringar mergas till main under detta arbete.
- Publicera inte 1.1 över den befintliga appen. Ett framtida produktionsbyte kräver ett nytt uttryckligt godkännande från Peter.
- En separat webbadress ger inte i sig dataisolering. Innan en körbar förhandsvisning får användas ska dess API, inloggning och lagring kontrolleras så att den inte kan skriva till produktionsdata eller anropa produktionsfunktioner med sidoeffekter.
- Börja med en lokal prototyp med syntetiska testdata. Återanvänd inga produktionssessioner eller personliga QR-länkar i prototypen.
- En delbar testadress är ännu inte skapad. Koppla inte utvecklingsgrenen till produktionsprojektets publicering.

## Föreslagen första etapp – ännu inte implementerad

1. Samlad aktivitetsvy för nästa träning och nästa poolspel.
2. Tydlig översikt över vad som är klart och vad som saknas: ansvariga, målvakt, uppställning, tröjfärger och materialchecklista där det är relevant.
3. Därefter tydligare sparstatus och snabbare växling mellan kalender, planering och matchvy.

Detaljer och layout arbetas fram i prototypen. Den befintliga appens data och funktioner ändras inte av denna plan.
