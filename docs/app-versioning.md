# Appversion och byggnummer

Den synliga appversionen är **1.0**. Ändra den manuellt endast vid en större uppdatering, enligt användarens beslut. Vanliga rättningar och mindre förbättringar behåller samma appversion.

- `version.js`: `NSK_APP_VERSION` är den synliga versionen. `NSK_VERSION` är ett internt byggnummer för cache och uppdateringar.
- `deploy.json`: `appVersion` är synlig version; `version` är byggnummer.
- `manifest.webmanifest`: `version` är synlig version; `build` är byggnummer.
- Publicering stämplar byggnummer från GitHub-körningens ID och bevarar den synliga appversionen. Ingen automatisk PR ska höja den synliga versionen.
- Vid större release: ändra de tre synliga versionsfälten tillsammans. Kontrollera uppdateringsmeddelandet. Byggnummer får aldrig användas som produktversion i gränssnittet.
