# NSK – användarkonton och lagbehörigheter

## Status
Detta är ett förslag för nästa etapp. Den befintliga produktionen använder fortfarande gemensamt adminläge. Klientens auth.js i denna gren förutsätter API-endpoints som ännu inte finns.

## Datamodell
- users: id, email (unik, normaliserad), display_name, password_hash, disabled, created_at
- teams: id, name, season
- memberships: user_id, team_id, role, unique(user_id, team_id)
- sessions: hash_of_token, user_id, expires_at, revoked_at

Roller: owner, team_admin, coach, team_manager, fitness, equipment, viewer. Truppens personalkategorier är separata från behörighetsroller.

## API-kontrakt
- POST /api/auth/login med email och password: returnerar slumpmässig sessionstoken efter verifiering
- GET /api/auth/me med Bearer-token: returnerar {user:{id,name},memberships:[{team_id,role}]}
- POST /api/auth/logout: återkallar sessionen
- GET /api/teams: endast lag användaren tillhör
- GET /api/teams/:teamId/members: endast behöriga medlemmar
- POST /api/teams/:teamId/members: endast owner/team_admin

## Säkerhetskrav innan driftsättning
1. Hasha lösenord med ett lämpligt långsamt lösenords-KDF och unika salter. Spara aldrig lösenord i klartext.
2. Skapa tokens med kryptografiskt säker slumpgenerator; lagra endast hash av token på servern.
3. Kontrollera session, roll och team_id på servern för varje endpoint, även läsningar.
4. Kontrollera att alla Baserow-rader och länkade match-/pool-/spelarrader tillhör begärt lag före ändring.
5. Rate-limit inloggning, sätt sessionstid och återkalla vid utloggning.
6. Ingen öppen registrering eller självvald owner-roll; skapa första ägaren via skyddad administrativ process.
7. Migrera befintliga Team 18-data utan att ändra deras ID:n och bekräfta backuper.
8. Avveckla admin- och matchkoder först efter att samtliga klientanrop migrerats och testats.
9. Kör negativa tester: annan lag, borttagen medlemskap, utgången token, ogiltig roll och direkt API-anrop.
10. Publicera inte förrän backend och klient är kompatibla.

## Plan
Steg 1: skapa och testa autentiserings-API i separat Worker-miljö.
Steg 2: koppla login-vy och lagväljare till API.
Steg 3: uppdatera DB-adapter att skicka team_id och Bearer-token; ta bort hårdkodningen av NSK Team 18.
Steg 4: behörighetsstyr Truppen och övriga vyer, följt av verifiering och kontrollerad driftsättning.
