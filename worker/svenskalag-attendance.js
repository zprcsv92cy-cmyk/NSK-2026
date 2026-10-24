/**
 * SvenskaLag invitation response adapter.
 * Pure, read-only normalization. It is intentionally NOT connected to an
 * undocumented API endpoint. No personal data or credentials are logged.
 *
 * The provider contract must be verified before feeding real responses here:
 *  {eventId, participants:[{memberId, role, response}]}
 */
const STATES=Object.freeze({coming:'kommer',not_coming:'kommer_inte',unanswered:'ej_svarat'});
const RESPONSE_CODES=Object.freeze({
  accepted:STATES.coming,yes:STATES.coming,kommer:STATES.coming,
  declined:STATES.not_coming,no:STATES.not_coming,'kan ej':STATES.not_coming,'kommer inte':STATES.not_coming,
  pending:STATES.unanswered,unanswered:STATES.unanswered,'ej svarat':STATES.unanswered
});
const ROLES=Object.freeze({player:'spelare',spelare:'spelare',coach:'tränare',trainer:'tränare',leader:'tränare',ledare:'tränare',tränare:'tränare'});
const id=x=>typeof x==='string'&&/^[1-9][0-9]{0,17}$/.test(x)?x:null;
export function normalizeSvenskalagAttendance(payload,expectedEventId){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Ogiltigt kallelsesvar');
  if(typeof expectedEventId!=='string'||!expectedEventId.trim()||payload.eventId!==expectedEventId)
    throw Error('Aktivitets-ID stämmer inte');
  if(!Array.isArray(payload.participants)||payload.participants.length>300)throw Error('Ogiltig deltagarlista');
  const seen=new Set(),players=[],coaches=[];
  for(const person of payload.participants){
    if(!person||typeof person!=='object'||Array.isArray(person))throw Error('Ogiltig deltagare');
    const memberId=id(person.memberId),role=ROLES[String(person.role||'').toLocaleLowerCase('sv-SE')];
    const response=RESPONSE_CODES[String(person.response||'').toLocaleLowerCase('sv-SE')];
    if(!memberId||!role||!response)throw Error('Oväntat fältvärde i kallelsesvar');
    if(seen.has(memberId))throw Error('Dubblett i deltagarlista');
    seen.add(memberId);
    (role==='spelare'?players:coaches).push({memberId,response});
  }
  return {players,coaches};
}
export function previewSvenskalagAttendance(normalized,playerIds,coachIds){
  const players=new Set(playerIds),coaches=new Set(coachIds);
  // Mapping must use verified per-person SvenskaLag IDs, not guesses from names.
  const missing=[...normalized.players.filter(x=>!players.has(x.memberId)),...normalized.coaches.filter(x=>!coaches.has(x.memberId))];
  return {
    players:normalized.players.filter(x=>players.has(x.memberId)),
    coaches:normalized.coaches.filter(x=>coaches.has(x.memberId)),
    unmapped:missing.length,
    canApply:missing.length===0
  };
}
