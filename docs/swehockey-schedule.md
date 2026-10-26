# SweHockey U9-spelschema

Fast källa: https://stats.swehockey.se/District/Sodermanland/Nykoping/ScheduleAndResults/Schedule/21963

Servern läser bara den offentliga schematabellen. Ingen Facebook-spårningsparameter, inloggning eller personstatistik används. Endast matcher där exakt ett lag är Nyköpings SK tas med. Både hemma- och bortamatcher stöds.

Tid ärvs i tabellens ursprungliga ordning före filtreringen på Nyköping. En tom tid tar senaste explicita tiden inom samma datum och poolgrupp. En explicit 00:00 återställer tiden till okänd; tid ärvs aldrig från en annan poolgrupp eller dag. Om SweHockey saknar tid kan en entydigt matchad SvenskaLag-tid komplettera den. Okänd tid förblir tom.

Schemat lagras separat från Baserow, manuella poolspel och träningsdata. Vid läsning sammanförs kalenderkorten efter datum och hall; olika hallar hålls isär. Saknad hall kompletteras från SvenskaLag endast om ett enda poolspel finns det datumet. SweHockeys länk visas som källa. SvenskaLags träningar och övriga aktiviteter påverkas inte.

Knappen Hämta poolspel och träningar uppdaterar båda källorna. SweHockey hämtas också med befintlig sex-timmarskörning. Hämtningen har tidsgräns och 1,5 MB storleksgräns. Nätfel, ändrad tabellstruktur och tomma resultat raderar inte senast fungerande schema.

Poolspelskapande sker genom befintliga behörighetsstyrda knappar och samma idempotenta importflöde. För befintliga aktiva poolspel kan användaren uttryckligen komplettera saknade matchposter och tomma starttider. Ifyllda motstridiga tider, osäkra matchningar och avslutade poolspel avvisas. Uppställningar och genomförda byten skrivs inte över.

Drift: tillämpa migrations/20261026_swehockey_schedule.sql, publicera hashverifierad addon med scripts/build-swehockey-addon.mjs och aktivera NSK_ENABLE_SWEHOCKEY_SYNC=true. Synlig appversion är fortsatt 1.0.
