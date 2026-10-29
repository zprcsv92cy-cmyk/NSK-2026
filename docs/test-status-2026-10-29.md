# Teststatus 2026-10-29

Granskad appkod: `84b54e7370571cec49ed5334d48e6998d909ce35` (PR 568). Detta är en daterad testredovisning, inte ett löfte om att alla funktioner eller framtida versioner är felfria.

## Genomfört

| Kontroll | Resultat och omfattning |
| --- | --- |
| Full automatisk svit | 909 godkända Node-tester, inga fel eller överhoppade tester. |
| Separat SQLite-integration | 2 godkända Python-tester. |
| Frontendpaket | Bygget lyckades. 39 publicerade JavaScript-moduler klarade syntaxkontrollen. Inga saknade lokala HTML-referenser. Paketet innehöll 71 filer och inga backendfiler eller pensionerade admin-/inloggningsskript. |
| CI på granskad huvudversion | Samtliga sex startade kontroller godkända: full regression, lagbehörigheter, två API dry-run-kontroller, stagingimporter och appversion. |
| Inloggad webbläsare | Personlig inloggning och läsning/navigation i Kalender, Truppen, Träningsplanering, Materialförvaltare, Statistik, Användare, Övningsarkiv, Ritverktyg, Mitt konto och formuläret Skapa poolspel. Ingen verksamhetsdata sparades som del av dessa läskontroller. |
| Anonym API-åtkomst | Nio skyddade läsrutter nekade korrekt med HTTP 401. |
| Begränsat produktionsprov | 18 anonyma GET-anrop, högst tre samtidiga: 18 HTTP 401 och inga serverfel. Median 63 ms, p95 4 183 ms från testmiljön. Detta mäter åtkomstgränsen och nätverksvägen, inte kapacitet eller svarstid för inloggade användare. |
| Service worker | Åtta lokala feltester för båda adressuppläggen: cachekvot, avbruten förhämtning, rensning av gamla NSK-cacher och cacheundantag för API, auth och publika QR-sidor. |
| D1 Time Travel | Ändrade och borttagna syntetiska rader återkom korrekt i en separat databas. Integriteten var godkänd; testdatabasen togs bort. |
| D1 med verkligt underlag | En direkt SQL-kopia återställdes i en separat, obunden testdatabas: 29 tabeller, 504 rader och 44 schemaobjekt. Samtliga återställda uppgifter och schemaobjekt matchade det lästa underlaget. Integritetskontroll godkänd, inga främmande nyckelfel. Testkopian togs bort. |
| KV-metod | 27 syntetiska poster kopierades och återlästes över tre resultatsidor. Värden, svenska tecken, tom sträng, metadata och absoluta utgångstider bevarades; saknad nyckel gav null. Båda testnamnrymderna togs bort. |
| Durable Objects-logik | Sex ytterligare lokala feltester. Serialiserade testreservationer återlästes efter simulerad återstart; 200 återförsök skapade inga extra poolspel. Ett avbrutet köjobb blockerade inte nästa jobb. Detta var inte en återställning av Cloudflares verkliga Durable Object-lagring. |

Riktade lokala tester omfattade även utgångna och aktiva sparlås, samtidiga borttagningar, avbruten borttagningsplanering, materialval med tolv samtidiga skrivare, fel vid låsregistrering/städning samt fördröjda materialsvar efter byte av session eller lag. Inga nya appfel påvisades i dessa kompletterande kontroller.

## Driftkontroll efter proven

- API-version `7ef8c15e-d180-4b25-bc89-a1b87cca8720` var aktiv på 100 procent.
- Produktions-D1 rapporterade `quick_check = ok` och inga främmande nyckelfel.
- Inga tillfälliga `nsk-disposable-*`-databaser eller KV-namnrymder återstod.
- En lyckad, filtrerad loggfråga för de sista 15 minuterna returnerade inga HTTP 5xx eller onormala Worker-avslut. Låg eller begränsad trafik kan inte bevisa belastningskapacitet.

## Kvarvarande testluckor

1. **Exportfilens återställning:** D1-exporten lyckades, men nedladdningslänken gav HTTP 403 i körmiljön. SQL-kopian ovan verifierar inte återställning från just den filen. Ingen permanent backup upprättades genom detta prov.
2. **Fysisk iPhone:** Safari och installerad PWA, kallstart efter uppdatering, flygplansläge, återanslutning, tangentbord, hemskärmsikon och systemets delningsdialog.
3. **Kamera och skrivare:** QR-skanning från verklig skärm och utskrivet papper, faktisk iPhone-utskrift och läsbarhet i praktiken.
4. **Verklig fleranvändarbelastning:** separata personliga sessioner och konton med realistiska arbetsflöden, köbildning och svarstider. Nya flikar i webbläsarprovet krävde egen inloggning och räknades därför inte som verifierad samtidig belastning.
5. **Övrig verklig dataåterställning:** Baserow, produktionens KV-innehåll och den verkliga Durable Object-lagringen har inte återställts. Syntetiska KV-prov och lokal Durable Objects-logik ersätter inte dessa kontroller.

Återställningsproven skrev inte till appens produktionsdata. En återställning av Worker-kod är inte en återställning av D1, KV, Baserow eller Durable Object-data. Ingen produktionsrollback utfördes.
