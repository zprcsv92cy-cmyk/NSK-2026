// Age-adapted observation support, not a permanent ranking of children.
export const SKILLS_GUIDANCE={
 intro:'Bedöm vad spelaren visar i åldersanpassade övningar och spel över flera tillfällen. Utgå från spelarens utveckling. 10 betyder mycket säkert i denna miljö, inte färdigutvecklad eller elitnivå.',
 withinBand:'Välj det lägre talet (1, 3, 5, 7, 9) när spelaren precis börjat klara nivån. Välj det högre (2, 4, 6, 8, 10) när det fungerar återkommande.',
 unknown:'Välj Ej bedömd om du inte har sett tillräckligt. Det är inte samma sak som ett lågt betyg.',
 behavior:'Lagspel och inställning bedöms efter synliga handlingar och behov av stöd. Anpassa instruktioner och stöd efter barnet. Tystlåtenhet, en dålig dag eller fysisk storlek ska inte styra betyget.',
 passing:'Passningsteknik visar om spelaren kan passa. Passningsspel visar om spelaren ser och använder en medspelare när det är ett bra val. Att åka själv kan också vara rätt beslut.',
 bands:['1–2 · Mycket stöd','3–4 · Börjar klara','5–6 · Fungerar i övning','7–8 · Fungerar i spel','9–10 · Säkert under press'],
 behaviorBands:['1–2 · Mycket stöd','3–4 · Många påminnelser','5–6 · Viss påminnelse','7–8 · Oftast självständigt','9–10 · Även när det är svårt']
};
export const SKILL_CRITERIA={
 forward:{question:'Åker spelaren framåt med balans och kontroll?',bands:[
  'Behöver mycket stöd för att ta skär och hålla balansen.',
  'Tar sig fram själv i lugnt tempo, men tappar ofta balans eller riktning.',
  'Åker med kontrollerade skär och viktöverföring i en enkel övning.',
  'Behåller kontrollen i spel och kan ändra fart och riktning.',
  'Åker effektivt och kontrollerat även med puck och motståndare nära.']},
 backward:{question:'Åker spelaren bakåt med balans och kontroll?',bands:[
  'Behöver mycket stöd för att komma bakåt och hålla balansen.',
  'Tar sig bakåt korta sträckor, men tappar ofta kontrollen.',
  'Åker bakåt med kontroll och blicken framåt i en enkel övning.',
  'Ändrar riktning bakåt och följer spelet med kontroll.',
  'Anpassar fart och avstånd till en anfallare utan att tappa kontrollen.']},
 balance:{question:'Behåller spelaren balansen när rörelsen förändras?',bands:[
  'Behöver mycket stöd för att stå, glida och återfå balansen.',
  'Håller balansen i enkla moment men tappar den lätt vid förändring.',
  'Klarar glid, böjda knän och enkla enbensmoment med kontroll.',
  'Behåller eller återfår balansen vid vändningar och små störningar i spel.',
  'Behåller kroppskontrollen under press och fortsätter nästa spelmoment.']},
 turns:{question:'Svänger spelaren åt båda håll med kontroll?',bands:[
  'Behöver mycket stöd för att byta riktning.',
  'Svänger i lugnt tempo, oftast säkrare åt ena hållet.',
  'Svänger åt båda håll och provar kontrollerade översteg i övning.',
  'Använder svängar och översteg åt båda håll i spel.',
  'Behåller fart och kontroll genom svängar även med puck under press.']},
 acceleration:{question:'Kan spelaren starta, stanna och komma iväg igen med kontroll?',bands:[
  'Behöver mycket stöd för start eller stopp.',
  'Startar och bromsar i lugnt tempo, ofta med lång förberedelse.',
  'Startar, stannar åt båda håll och startar om i en enkel övning.',
  'Reagerar och ändrar fart eller riktning med kontroll i spel.',
  'Startar, bromsar och accelererar snabbt även i pressade situationer.']},
 puck:{question:'Behåller spelaren pucken nära klubban?',bands:[
  'Behöver mycket hjälp för att få och behålla kontroll på pucken.',
  'För pucken korta stunder men tappar den ofta.',
  'Flyttar pucken mellan forehand och backhand med kontroll i övning.',
  'Behåller pucken i spel och kan lyfta blicken korta stunder.',
  'Skyddar och kontrollerar pucken under press med blicken mot spelet.']},
 dribble:{question:'Kan spelaren åka med puck utan att tappa den?',bands:[
  'Behöver mycket stöd för att åka och hantera pucken samtidigt.',
  'Åker korta sträckor med puck i lugnt tempo.',
  'Transporterar pucken och ändrar riktning i en enkel övning.',
  'Ändrar fart och riktning med puck i spel utan att ofta tappa den.',
  'Tar sig fram med puck i fart och anpassar vägen under press.']},
 pass:{question:'Når passningen fram med lagom kraft?',bands:[
  'Behöver mycket stöd för att rikta och få iväg en passning.',
  'Når ibland en stillastående medspelare på kort avstånd.',
  'Når oftast en medspelare och anpassar kraften i en enkel övning.',
  'Passar till medspelare i rörelse med användbar riktning och kraft.',
  'Slår mottagningsbara passningar i rätt yta även i fart under press.']},
 receive:{question:'Får spelaren kontroll på pucken vid mottagningen?',bands:[
  'Behöver mycket stöd för att möta och stoppa en passning.',
  'Tar ibland emot en lugn passning stillastående.',
  'Tar oftast emot passningar med kontroll i en enkel övning.',
  'Tar emot pucken i rörelse och kan fortsätta spela.',
  'Tar emot från olika håll under press och gör pucken redo för nästa aktion.']},
 shot:{question:'Kan spelaren rikta skottet dit hen vill?',bands:[
  'Behöver mycket stöd för att träffa pucken och få iväg skottet.',
  'Får iväg skott, men riktning och kontroll varierar mycket.',
  'Riktar oftast skottet mot en vald yta från stillastående eller lugn fart.',
  'Riktar skott i rörelse eller efter mottagning i spel.',
  'Avslutar kontrollerat mot vald yta även med kort tid och press. Bedöm inte bara hårdhet.']},
 space:{question:'Söker spelaren en fri plats för att kunna få passning?',bands:[
  'Behöver mycket hjälp att lämna trängseln och göra sig spelbar.',
  'Söker ibland en fri yta efter tydlig påminnelse.',
  'Hittar passningsytor i enkla övningar och flyttar sig efter passning.',
  'Gör sig återkommande spelbar genom att söka nya ytor i spel.',
  'Läser spelet tidigt och tajmar rörelsen så puckföraren får ett bra alternativ.']},
 position:{question:'Placerar sig spelaren så att hen kan hjälpa till i spelet?',bands:[
  'Behöver mycket hjälp för att hitta sin plats i spelet.',
  'Hittar en användbar plats efter instruktion, men följer ofta bara pucken.',
  'Anpassar sin plats efter pucken, medspelare och eget mål i enkla situationer.',
  'Hittar oftast användbara positioner i både anfall och försvar.',
  'Justerar sin position tidigt när spelet ändras och täcker eller erbjuder viktiga ytor.']},
 decisions:{question:'Väljer spelaren när det passar att åka, passa eller skjuta?',bands:[
  'Behöver mycket hjälp för att uppfatta alternativ och välja nästa aktion.',
  'Gör ibland ett fungerande val efter en tydlig påminnelse.',
  'Tittar upp och gör fungerande val i enkla övningar.',
  'Väljer återkommande en fungerande lösning i spel utan påminnelse.',
  'Uppfattar alternativen tidigt och anpassar sitt beslut även under press.']},
 passing:{question:'Ser och använder spelaren fria medspelare när passning är ett bra val?',bands:[
  'Upptäcker sällan passningsalternativ, även med stöd.',
  'Söker och använder ibland en fri medspelare efter påminnelse.',
  'Lyfter blicken och använder fria medspelare i enkla övningar.',
  'Ser och använder återkommande bra passningsalternativ i spel.',
  'Ser medspelare tidigt och tajmar passningen under press. Behåller pucken när det är bättre.']},
 attack_defend:{question:'Byter spelaren uppgift när laget vinner eller förlorar pucken?',bands:[
  'Behöver mycket hjälp att förstå vilket lag som anfaller eller försvarar.',
  'Byter uppgift efter tydlig instruktion när puckinnehavet ändras.',
  'Uppfattar puckvinst och pucktapp och byter uppgift i enkla övningar.',
  'Ställer oftast om själv mellan anfall och försvar i spel.',
  'Ställer om snabbt och hjälper laget med en användbar första aktion.']},
 cooperate:{question:'Försöker spelaren lösa uppgifter tillsammans med andra?',bands:[
  'Behöver mycket vuxenstöd för att delta i en gemensam uppgift.',
  'Samarbetar korta stunder med återkommande påminnelser.',
  'Deltar i gemensamma lösningar med viss påminnelse.',
  'Samarbetar oftast självständigt med olika lagkamrater.',
  'Fortsätter samarbeta och anpassar sig till andra även när uppgiften är svår.']},
 communicate:{question:'Visar spelaren med ord, blick, kropp eller klubba vad hen vill?',bands:[
  'Behöver mycket stöd för att ge eller uppfatta enkla signaler i spelet.',
  'Ger ibland en användbar signal efter påminnelse.',
  'Visar att hen är spelbar och tar emot enkla signaler med visst stöd.',
  'Ger och uppfattar oftast användbara signaler självständigt i spel.',
  'Kommunicerar tydligt och hjälpsamt även när tiden är knapp. En tyst spelare kan nå denna nivå.']},
 support:{question:'Hjälper spelaren en lagkamrat som behöver stöd i spelet?',bands:[
  'Behöver mycket hjälp att upptäcka när en lagkamrat behöver stöd.',
  'Hjälper ibland efter tydliga påminnelser.',
  'Erbjuder passningsalternativ eller arbetar tillbaka med viss påminnelse.',
  'Upptäcker oftast själv behovet och hjälper en lagkamrat i spel.',
  'Fortsätter ge stöd, arbeta tillbaka och uppmuntra även när laget har det svårt.']},
 effort:{question:'Försöker spelaren genomföra uppgiften och prova igen?',bands:[
  'Behöver mycket stöd för att komma igång och göra ett försök.',
  'Provar korta stunder med återkommande uppmuntran.',
  'Genomför uppgiften och provar igen med viss uppmuntran.',
  'Försöker oftast självständigt och tar till sig en enkel instruktion.',
  'Fortsätter göra försök och använda hjälpen även när momentet är svårt.']},
 courage:{question:'Vågar spelaren prova något nytt även om det kan bli fel?',bands:[
  'Behöver mycket trygghet och stöd för att våga ett nytt moment.',
  'Provar en ny sak med upprepade uppmuntringar.',
  'Provar en ny teknik eller lösning med visst stöd.',
  'Vågar oftast prova nya saker självständigt och försöker igen efter misstag.',
  'Fortsätter utforska nya lösningar även när de första försöken inte lyckas. Mod är inte fysisk tuffhet.']},
 focus:{question:'Kan spelaren ta en kort instruktion, börja och hitta tillbaka till uppgiften?',bands:[
  'Behöver mycket stöd för att ta instruktionen och komma igång.',
  'Kommer igång men behöver återkommande hjälp tillbaka till uppgiften.',
  'Följer en kort, anpassad instruktion och återgår med viss påminnelse.',
  'Kommer oftast igång och hittar tillbaka till uppgiften självständigt.',
  'Behåller eller återtar fokus även när uppgiften blir svår eller omgivningen stör.']}
};
