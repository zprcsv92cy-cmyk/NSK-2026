import test from 'node:test';
import assert from 'node:assert/strict';
import { planCalendarMatches } from '../calendar-match-plan.mjs';

const fixtures = n => Array.from({length:n}, (_,i)=>({
  startTime: String(8 + Math.floor(i/4)).padStart(2,'0') + ':' + String((i%4)*15).padStart(2,'0'),
  opponent: 'Motståndare ' + (i+1)
}));

for (const [count, teams, perTeam] of [[1,1,1],[4,1,4],[5,2,3],[6,2,3],[8,2,4],[16,2,8]]) {
  test(count + ' matcher fördelas på ' + teams + ' lag', () => {
    const result = planCalendarMatches(fixtures(count).reverse());
    assert.equal(result.teams, teams);
    assert.equal(result.matchesPerTeam, perTeam);
    assert.equal(result.schedule.length, count);
    assert.ok(result.schedule.every(m => m.lag_no <= 2 && m.match_no <= 8));
    assert.deepEqual(result.schedule.map(m => m.start_time),
      [...result.schedule.map(m => m.start_time)].sort());
  });
}

test('filtrerar ogiltiga poster och begränsar till 16', () => {
  const result = planCalendarMatches([...fixtures(18), {startTime:'99:99',opponent:'Fel'}]);
  assert.equal(result.schedule.length,16);
});
test('matchmetadata kräver inte spelare eller målvakt', () => {
  const row=planCalendarMatches(fixtures(1)).schedule[0];
  assert.equal(Object.hasOwn(row,'goalie_player_id'),false);
  assert.equal(Object.hasOwn(row,'players_on_field'),false);
});

test('sorterar innan gränsen 16 tillämpas', () => {
  const all=fixtures(18);
  const result=planCalendarMatches(all.reverse());
  assert.equal(result.schedule[0].opponent,'Motståndare 1');
  assert.equal(result.schedule.at(-1).opponent,'Motståndare 16');
});
test('tom import ger inga matcher och inget laguppställningskrav', () => {
  const result=planCalendarMatches([]);
  assert.equal(result.schedule.length,0);
  assert.equal(result.matchesPerTeam,0);
});

test('behåller motståndare utan starttid och fördelar fyra matcher på ett lag', () => {
  const opponents=['Järna SK Röd','Eskilstuna Linden Hockey','Södertälje SK Blå','Åker/Strängnäs HC Gul'];
  const result=planCalendarMatches(opponents.map((opponent,i)=>({opponent,startTime:i%2?'00:00':''})));
  assert.equal(result.teams,1);
  assert.equal(result.matchesPerTeam,4);
  assert.deepEqual(result.schedule.map(m=>m.opponent),opponents);
  assert.ok(result.schedule.every(m=>m.start_time===null));
});
test('sorterar kända tider före okända och filtrerar ogiltiga tider', () => {
  const result=planCalendarMatches([
    {opponent:'Okänd tid',startTime:''},
    {opponent:'Sen',startTime:'13:00'},
    {opponent:'Fel',startTime:'99:99'},
    {opponent:'Tidig',startTime:'09:00'}
  ]);
  assert.deepEqual(result.schedule.map(m=>m.opponent),['Tidig','Sen','Okänd tid']);
});
