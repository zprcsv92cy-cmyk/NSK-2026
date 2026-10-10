NSK2 - TESTVERSION UTAN INLOGGNING

GitHub Pages -> Cloudflare Worker -> Baserow.
API: https://nsk-api.peter-hasselberg.workers.dev

Endast läsning. Alla spar-/raderingsfunktioner ger ett felmeddelande.
Inga Supabase-skript eller inloggning används.

OBS: Cloudflare Workern har öppna GET-anrop till samtliga tabeller.
Publicera INTE personuppgifter i denna version innan API-åtkomst skyddats.
ALLOWED_ORIGIN i Cloudflare måste matcha den faktiska GitHub Pages-origin (utan sökväg).

Lägg filerna i ett SEPARAT testrepo/testmiljö först.
Gamla service worker-cache kan kräva avregistrering i webbläsaren.
