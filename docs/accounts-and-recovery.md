# Användare, inbjudan och lösenord – NSK

## Skyddad huvudadministratör

Peter Hasselberg, `peter_hasselberg@hotmail.com`, är huvudadministratör och har alltid alla nio funktionsbehörigheter efter giltig personlig inloggning. Skyddet är knutet till det befintliga verifierade konto-ID:t och e-postadressen tillsammans. En e-postadress eller flagga från webbläsaren ger aldrig denna behörighet.

Kontot kan inte tas bort, inaktiveras, byta identitet eller få begränsad åtkomst via användarhanteringen. Andra användares personliga grants, medlemskap och lagroller kontrolleras som tidigare. Detta skydd ersätter inte kravet på korrekt lösenord, giltig session och tillgänglig databastjänst.

## Ny användare

1. Öppna **Användare** i menyn efter administratörsinloggning.
2. Ange namn och e-post, välj lagroll och individuella behörigheter. Standard är läsbehörighet.
3. **Skapa användare** sparar konto, lagkoppling och behörigheter tillsammans. Kontot är låst tills användaren aktiverar det.
4. Välj **Skapa inbjudningslänk**, därefter **Kopiera inbjudningslänk**. Kontrollera mottagarens identitet och dela länken säkert med rätt person.
5. Användaren öppnar länken och väljer ett eget lösenord på minst 12 tecken. Länken gäller två timmar och kan användas en gång.

Ingen öppen självregistrering finns. Administratören ser inte användarens lösenord och ska inte sätta ett gemensamt tillfälligt lösenord.

## Användarhantering

- Tilldela eller ta bort personliga behörigheter med kryssrutorna. Servern kontrollerar uppdaterade grants vid efterföljande begäran.
- Lagroll och lagmedlemskap hanteras separat. En grant ger inte andra användare rätt att ändra ett lag utan rätt medlemskap och roll.
- **Inaktivera konto** stoppar inloggning, avslutar aktiva sessioner och ogiltigförklarar väntande lösenordslänkar.
- **Ta bort användare** tar bort inloggningskonto, sessioner, grants och lagkopplingar efter bekräftelse. Spelare/tränare i truppen och matchhistorik påverkas inte.
- E-poständring ogiltigförklarar kontots sessioner och gamla aktiverings-/återställningslänkar. Namnändring kräver ingen ny inloggning.
- Huvudadministratörens skydd och befintligt skydd för den sista aktiva administratören tillämpas på servern, även om någon försöker anropa API:t direkt.

## Glömt lösenord

På inloggningssidan finns **Glömt lösenord?**. Begäran ger samma offentliga svar oavsett om adressen finns eller inte. Den lämnar aldrig ut en återställningskod offentligt.

**Nuvarande driftläge: hjälp via huvudadministratören.** En verifierad e-postavsändare saknas i Cloudflare-kontot. För ett aktivt konto visas begäran därför på användarkortet i Användare. Efter identitetskontroll skapar huvudadministratören en återställningslänk och delar den säkert. Länken gäller 30 minuter, kan användas en gång och byter aldrig lösenord förrän användaren själv väljer ett nytt. Alla äldre sessioner avslutas när lösenordet ändras.

Ett inaktiverat konto kan inte återaktiveras av en återställningslänk. Det måste återaktiveras separat av administratören. Ett ännu oaktiverat konto får en ny inbjudningslänk i stället.

Peters egen återställning när han inte kan logga in kräver antingen fungerande e-postleverans eller hjälp från ägaren till Cloudflare-kontot via en separat verifierad återställningsrutin. En offentlig bakdörr för huvudadministratören finns inte.

## Byt eget lösenord

Under **Mitt konto → Byt lösenord** anger användaren sitt nuvarande lösenord, väljer och bekräftar ett nytt och loggar sedan in igen. Alla andra sessioner och väntande återställningslänkar ogiltigförklaras.

## Aktivera automatisk e-postleverans

Koden stöder ett Cloudflare Email Service-binding `ACCOUNT_EMAIL` och en konfigurerad `ACCOUNT_EMAIL_FROM`. Den avsändarens domän måste vara verifierad för utskick innan funktionen kopplas på. Ingen avsändaradress gissas och ingen personlig e-postsession används som mailserver.

När binding och verifierad avsändare finns visar användarhanteringen **Skicka inbjudan** och **Skicka återställningslänk**. Offentlig lösenordshjälp skickar då engångslänken till den lagrade konto-adressen. Vid leveransfel finns begäran kvar för administratörshjälp. Ett API-anrop får aldrig välja en annan mottagare än kontots sparade adress.

## Säkerhet och validering

- Endast tokenhashar lagras. Länkar använder URL-fragment; fragmentet tas bort ur adressfältet när formuläret lästs in.
- Länkar är tidsbegränsade och engångsanvändning sker i en databastransaktion. Samtidiga försök får inte båda byta lösenord.
- Inloggning och återställning har frekvensbegränsning. Lösenord lagras med den befintliga PBKDF2-SHA256-formatet, aldrig i klartext.
- Nya inloggningssessioner gäller två timmar. Befintliga giltiga sessioner ändras inte av själva publiceringen.
- Tester mot en separat lokal SQLite-databas täcker skapa/ta bort konto, grants, lagkopplingar, Peters skydd, aktivering, utgångna och återanvända länkar, samtidighet, felaktiga lösenord, sessionernas ogiltigförklaring och validering av e-postmottagare. Inga riktiga konton eller utskick används i testerna.
- Additiv migration: `migrations/20261025_account_recovery.sql`. Den skapar bara nya tabeller och ändrar inga befintliga konton, lösenord, medlemskap eller behörighetsrader.
